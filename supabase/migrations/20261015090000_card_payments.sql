-- Card payments through ListoPays, next to Suby (crypto, unchanged). ListoPays has no
-- subscriptions: a card payment buys a prepaid period, a month or a year, which runs from the end
-- of what is already paid (or from now) and is never charged again by itself. The billing function
-- opens an order (`card_orders`) and ListoPays' payment page for it; listopays-webhook settles the
-- order with `card_order_paid` once ListoPays reports it paid.
--
-- The prepaid time lives in its own column, `subscriptions.prepaid_until`, which suby-webhook never
-- writes: a Suby event about an old subscription cannot take paid card time away, and a card
-- payment never touches the Suby subscription.

alter table public.subscriptions add column prepaid_until timestamptz;

-- ── Orders ───────────────────────────────────────────────────────────────────

create table public.card_orders (
  id                   uuid primary key default gen_random_uuid(),
  -- Kept when the account is deleted: it is a record of a payment.
  user_id              uuid references auth.users (id) on delete set null,
  plan                 text not null check (plan in ('month', 'year')),
  amount               numeric(10, 2) not null check (amount > 0),
  currency             text not null default 'USD',
  provider             text not null default 'listopays',
  provider_customer_id text,
  -- ListoPays' transaction token, once paid (one order per transaction).
  transaction_id       text unique,
  status               text not null default 'pending'
                         check (status in ('pending', 'paid', 'failed', 'expired')),
  -- What the webhook reported (may be more than `amount` with "Commission In Price").
  paid_amount          numeric(10, 2),
  paid_currency        text,
  -- The prepaid period this payment bought.
  period_start         timestamptz,
  period_end           timestamptz,
  -- The webhook's body, without the private key.
  event                jsonb,
  created_at           timestamptz not null default now(),
  paid_at              timestamptz
);
create index card_orders_user on public.card_orders (user_id, created_at desc);
alter table public.card_orders enable row level security;
create policy "card_orders: read own" on public.card_orders
  for select to authenticated using (user_id = (select auth.uid()));
create policy "no oauth clients" on public.card_orders
  as restrictive for all to authenticated
  using (not public.is_oauth_client()) with check (not public.is_oauth_client());
revoke insert, update, delete on public.card_orders from anon, authenticated;
revoke all on public.card_orders from anon;

-- A Suby subscription that renews by itself (then a card payment would pay twice).
create or replace function public.suby_renews(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
     where s.user_id = p_user and s.provider = 'suby' and s.status in ('active', 'trialing')
       and coalesce(s.current_period_end, s.trial_ends_at, 'infinity') > now())
$$;
revoke execute on function public.suby_renews(uuid) from anon, authenticated, public;

-- listopays-webhook: the order is paid. Checks it against the order (currency, at least its
-- amount), extends the prepaid time from the end of what is paid already, once per order and per
-- transaction. Returns 'paid', 'already', 'unknown_order', 'duplicate_transaction', 'mismatch' or
-- 'no_account'.
create or replace function public.card_order_paid(
  p_order uuid,
  p_transaction text,
  p_amount numeric,
  p_currency text,
  p_event jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.card_orders%rowtype;
  s public.subscriptions%rowtype;
  v_has boolean;
  v_base timestamptz;
  v_end timestamptz;
begin
  select * into o from public.card_orders where id = p_order for update;
  if not found then
    return 'unknown_order';
  end if;
  if o.status = 'paid' then
    return 'already';
  end if;
  if exists (select 1 from public.card_orders where transaction_id = p_transaction) then
    return 'duplicate_transaction';
  end if;
  if upper(coalesce(p_currency, '')) <> upper(o.currency) or coalesce(p_amount, 0) < o.amount then
    update public.card_orders set event = p_event where id = o.id;
    return 'mismatch';
  end if;
  if o.user_id is null then
    update public.card_orders set event = p_event where id = o.id;
    return 'no_account';
  end if;

  select * into s from public.subscriptions where user_id = o.user_id for update;
  v_has := found;
  -- From the end of what is paid: earlier card time, or a Suby period that ends without renewing.
  v_base := greatest(
    now(),
    coalesce(s.prepaid_until, now()),
    case when s.provider = 'suby' and s.status in ('active', 'past_due', 'canceled')
         then coalesce(s.current_period_end, now()) else now() end);
  v_end := v_base + case o.plan when 'year' then interval '1 year' else interval '1 month' end;

  if v_has then
    update public.subscriptions set prepaid_until = v_end, updated_at = now()
     where user_id = o.user_id;
  else
    -- No row yet: one that gives nothing on its own (period over), only the prepaid time.
    insert into public.subscriptions (user_id, status, current_period_end, provider, prepaid_until)
    values (o.user_id, 'canceled', now(), 'listopays', v_end);
  end if;

  update public.card_orders
     set status = 'paid', transaction_id = p_transaction, paid_amount = p_amount,
         paid_currency = upper(p_currency), period_start = v_base, period_end = v_end,
         event = p_event, paid_at = now()
   where id = o.id;
  return 'paid';
end $$;
revoke execute on function public.card_order_paid(uuid, text, numeric, text, jsonb)
  from anon, authenticated, public;

-- ── The plan rules, with the prepaid time ────────────────────────────────────

create or replace function public.plan_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_user is null then 'free'
    when exists (
      select 1 from public.subscriptions s
       where s.user_id = p_user
         and ((s.status = 'trialing' and s.trial_ends_at > now())
           or (s.status in ('active', 'past_due', 'canceled')
               and coalesce(s.current_period_end, 'infinity') > now())
           or s.prepaid_until > now())
    ) then 'pro'
    else 'free'
  end
$$;
revoke execute on function public.plan_of(uuid) from anon, authenticated, public;

-- Card time on Pro (not a trial any more, whatever the row's status says).
create or replace function public.prepaid_now(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select prepaid_until > now() from public.subscriptions where user_id = p_user),
                  false)
$$;
revoke execute on function public.prepaid_now(uuid) from anon, authenticated, public;

-- Paid once, by either way: files are never removed from the server.
create or replace function public.had_subscription(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.subscriptions
                  where user_id = p_user and (provider is not null or prepaid_until is not null))
      or exists (select 1 from public.card_orders where user_id = p_user and status = 'paid')
$$;
revoke execute on function public.had_subscription(uuid) from anon, authenticated, public;

create or replace function public.ai_status(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (select * from public.plan_config),
  month as (select date_trunc('month', now() at time zone 'utc')::date as first),
  s as (select * from public.subscriptions where user_id = p_user)
  select jsonb_build_object(
    'used', coalesce((select sum(tokens) from public.ai_usage u, month
                       where u.user_id = p_user and u.day >= month.first), 0),
    'limit', case
      when public.plan_of(p_user) <> 'pro' then 0
      when (select status from s) = 'trialing' and not public.prepaid_now(p_user)
        then c.ai_trial_tokens
      else c.ai_month_tokens end,
    'today', coalesce((select requests from public.ai_usage
                        where user_id = p_user and day = (now() at time zone 'utc')::date), 0),
    'day_limit', c.ai_day_requests,
    'resets_at', ((select first from month) + interval '1 month')::date
  )
  from c
$$;
revoke execute on function public.ai_status(uuid) from anon, authenticated, public;

create or replace function public.storage_limit(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.plan_of(p_user) <> 'pro' then 0
    when not public.prepaid_now(p_user)
     and exists (select 1 from public.subscriptions s
                  where s.user_id = p_user and s.status = 'trialing' and s.provider is null)
      then c.trial_storage_bytes
    else c.storage_bytes end
  from public.plan_config c
$$;
revoke execute on function public.storage_limit(uuid) from anon, authenticated, public;

-- Settings → Plan: `status` is 'prepaid' while card time is what keeps Pro on (no renewal), with
-- `prepaid_until`; a Suby subscription that renews keeps its own status.
create or replace function public.my_plan()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (select * from public.plan_config),
  s as (select * from public.subscriptions where user_id = auth.uid()),
  used as (select public.storage_used(auth.uid()) as bytes),
  p as (select public.prepaid_now(auth.uid()) and not public.suby_renews(auth.uid()) as prepaid)
  select jsonb_build_object(
    'plan', public.plan_of(auth.uid()),
    'status', case
      when public.plan_of(auth.uid()) <> 'pro' then 'free'
      when p.prepaid then 'prepaid'
      else (select status from s) end,
    -- Only for the "Beta" label.
    'beta', coalesce(c.beta_until > now(), false),
    'beta_until', c.beta_until,
    'trial_ends_at', (select trial_ends_at from s),
    'current_period_end', (select current_period_end from s),
    'prepaid_until', (select prepaid_until from s),
    'canceled', coalesce((select status = 'canceled' from s), false) and not p.prepaid,
    'paid_before', public.had_subscription(auth.uid()),
    'trial_available', public.trial_available(auth.uid()),
    'files_delete_at', case when used.bytes > 0 then public.files_delete_at(auth.uid()) end,
    'ai', public.ai_status(auth.uid()),
    'storage', jsonb_build_object('used', used.bytes, 'limit', public.storage_limit(auth.uid())),
    -- What Pro did for the account, for the note at the end of the trial.
    'usage', jsonb_build_object(
      'notes', (select count(*) from public.notes where user_id = auth.uid() and deleted_at is null),
      'ai_answers', (select coalesce(sum(requests), 0) from public.ai_usage where user_id = auth.uid()),
      'files', used.bytes)
  )
  from c, used, p
$$;
revoke execute on function public.my_plan() from anon, public;
grant execute on function public.my_plan() to authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.card_orders to service_role;
    grant execute on function public.card_order_paid(uuid, text, numeric, text, jsonb)
      to service_role;
    grant execute on function public.suby_renews(uuid) to service_role;
    grant execute on function public.prepaid_now(uuid) to service_role;
  end if;
end $$;
