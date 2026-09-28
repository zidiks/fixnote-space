-- Plans: Free and Pro (docs/CONCEPT.md, "Тарифы"). Free is everything on the device; Pro is what
-- goes through this server: personal sync, the built-in AI assistant, sharing notes and folders,
-- public links, capture from messengers, 20 GB of files. A new account gets Pro for a few days
-- (the trial). While `beta_until` is ahead, everyone has Pro.
--
-- The checks sit on the tables (triggers) and the storage policy, so every way of writing hits
-- them. Reading stays open: an account that drops to Free can always download what it has.
-- `subscriptions` is written only by the server (the payment provider's webhook, service role).

create table public.plan_config (
  id                     boolean primary key default true check (id),
  -- Everyone has Pro until then (null: no beta).
  beta_until             timestamptz,
  trial_days             integer not null default 7,
  -- AI allowance per calendar month (UTC), in tokens (prompt + answer).
  ai_month_tokens        bigint not null default 2000000,
  ai_trial_tokens        bigint not null default 300000,
  ai_day_requests        integer not null default 150,
  -- All accounts together per month: past it the assistant pauses for everyone.
  ai_global_month_tokens bigint not null default 300000000,
  storage_bytes          bigint not null default 21474836480
);
insert into public.plan_config (beta_until) values ('2027-01-01');
alter table public.plan_config enable row level security;
revoke all on public.plan_config from anon, authenticated;

create table public.subscriptions (
  user_id                  uuid primary key references auth.users (id) on delete cascade,
  status                   text not null check (status in ('trialing', 'active', 'past_due', 'canceled')),
  trial_ends_at            timestamptz,
  -- Paid until (for canceled: Pro until then, then Free).
  current_period_end       timestamptz,
  provider                 text,
  provider_customer_id     text,
  provider_subscription_id text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy "subscriptions: read own" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.subscriptions from anon, authenticated;
revoke all on public.subscriptions from anon;

-- A new account starts with the trial.
create or replace function public.start_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id, status, trial_ends_at)
  values (new.id, 'trialing', now() + make_interval(days => (select trial_days from public.plan_config)))
  on conflict (user_id) do nothing;
  return new;
end $$;
revoke execute on function public.start_trial() from anon, authenticated, public;
create trigger subscriptions_start_trial after insert on auth.users
  for each row execute function public.start_trial();

-- 'pro' or 'free' for an account, right now.
create or replace function public.plan_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_user is null then 'free'
    when coalesce((select beta_until from public.plan_config) > now(), false) then 'pro'
    when exists (
      select 1 from public.subscriptions s
       where s.user_id = p_user
         and ((s.status = 'trialing' and s.trial_ends_at > now())
           or (s.status in ('active', 'past_due', 'canceled')
               and coalesce(s.current_period_end, 'infinity') > now()))
    ) then 'pro'
    else 'free'
  end
$$;

create or replace function public.is_pro(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.plan_of(p_user) = 'pro' $$;
revoke execute on function public.plan_of(uuid) from anon, authenticated, public;
revoke execute on function public.is_pro(uuid) from anon, authenticated, public;

-- Raises the error the app recognizes as "this needs Pro".
create or replace function public.require_pro(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_pro(p_user) then
    raise exception 'pro_required' using errcode = 'P0001', hint = 'This needs FixNote Pro';
  end if;
end $$;
revoke execute on function public.require_pro(uuid) from anon, authenticated, public;

-- ── Checks on writes ─────────────────────────────────────────────────────────

-- Personal sync: pushing notes and folders.
create or replace function public.pro_for_row_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_pro(new.user_id);
  return new;
end $$;
revoke execute on function public.pro_for_row_owner() from anon, authenticated, public;
create trigger notes_pro before insert or update on public.notes
  for each row execute function public.pro_for_row_owner();
create trigger folders_pro before insert or update on public.folders
  for each row execute function public.pro_for_row_owner();
-- Public links: new ones (a link that exists keeps working and can be refreshed).
create trigger shares_pro before insert on public.shares
  for each row execute function public.pro_for_row_owner();
-- Capture from messengers.
create trigger inbox_items_pro before insert on public.inbox_items
  for each row execute function public.pro_for_row_owner();

-- Sharing: a note shared on its own or a folder needs Pro from its owner; a note added to a
-- shared folder rides on the folder. Existing shares keep working.
create or replace function public.pro_for_new_share()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'shared_folders' then
    perform public.require_pro(new.owner_id);
  elsif new.folder_id is null then
    perform public.require_pro(new.owner_id);
  end if;
  return new;
end $$;
revoke execute on function public.pro_for_new_share() from anon, authenticated, public;
create trigger shared_notes_pro before insert on public.shared_notes
  for each row execute function public.pro_for_new_share();
create trigger shared_folders_pro before insert on public.shared_folders
  for each row execute function public.pro_for_new_share();

-- Inviting people needs Pro from whoever invites; the people invited join on any plan.
create or replace function public.pro_for_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> 'owner' and auth.uid() is not null then
    perform public.require_pro(auth.uid());
  end if;
  return new;
end $$;
revoke execute on function public.pro_for_invite() from anon, authenticated, public;
create trigger shared_note_members_pro before insert on public.shared_note_members
  for each row execute function public.pro_for_invite();
create trigger shared_folder_members_pro before insert on public.shared_folder_members
  for each row execute function public.pro_for_invite();

-- ── Files: Pro, within the plan's storage ────────────────────────────────────

create or replace function public.storage_used(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = public, storage
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o
   where o.bucket_id = 'attachments' and (storage.foldername(o.name))[1] = p_user::text
$$;
revoke execute on function public.storage_used(uuid) from anon, authenticated, public;

-- The caller may upload one more file (the storage policy asks).
create or replace function public.can_upload()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_pro(auth.uid())
     and public.storage_used(auth.uid()) < (select storage_bytes from public.plan_config)
$$;
revoke execute on function public.can_upload() from anon, public;
grant execute on function public.can_upload() to authenticated;

drop policy "attachments: add own" on storage.objects;
create policy "attachments: add own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_upload());

-- ── AI: tokens per account per day ───────────────────────────────────────────

create table public.ai_usage (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,
  tokens   bigint not null default 0,
  requests integer not null default 0,
  primary key (user_id, day)
);
create index ai_usage_day on public.ai_usage (day);
alter table public.ai_usage enable row level security;
create policy "ai_usage: read own" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.ai_usage from anon, authenticated;
revoke all on public.ai_usage from anon;

-- The account's AI allowance this month: tokens used and the limit, and when it renews.
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
      when coalesce(c.beta_until > now(), false) then c.ai_month_tokens
      when (select status from s) = 'trialing' then c.ai_trial_tokens
      else c.ai_month_tokens end,
    'today', coalesce((select requests from public.ai_usage
                        where user_id = p_user and day = (now() at time zone 'utc')::date), 0),
    'day_limit', c.ai_day_requests,
    'resets_at', ((select first from month) + interval '1 month')::date
  )
  from c
$$;
revoke execute on function public.ai_status(uuid) from anon, authenticated, public;

-- llm-proxy, before a request: may this account ask? {ok, reason?, ...ai_status}
create or replace function public.ai_allowance(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb := public.ai_status(p_user);
  v_global bigint;
begin
  if public.plan_of(p_user) <> 'pro' then
    return v || jsonb_build_object('ok', false, 'reason', 'pro_required');
  end if;
  if (v ->> 'used')::bigint >= (v ->> 'limit')::bigint then
    return v || jsonb_build_object('ok', false, 'reason', 'month_limit');
  end if;
  if (v ->> 'today')::int >= (v ->> 'day_limit')::int then
    return v || jsonb_build_object('ok', false, 'reason', 'day_limit');
  end if;
  select coalesce(sum(tokens), 0) into v_global from public.ai_usage
   where day >= date_trunc('month', now() at time zone 'utc')::date;
  if v_global >= (select ai_global_month_tokens from public.plan_config) then
    return v || jsonb_build_object('ok', false, 'reason', 'paused');
  end if;
  return v || jsonb_build_object('ok', true);
end $$;
revoke execute on function public.ai_allowance(uuid) from anon, authenticated, public;

-- llm-proxy, after a request: what it cost.
create or replace function public.ai_record(p_user uuid, p_tokens integer)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage (user_id, day, tokens, requests)
  values (p_user, (now() at time zone 'utc')::date, greatest(p_tokens, 0), 1)
  on conflict (user_id, day) do update
    set tokens = public.ai_usage.tokens + excluded.tokens,
        requests = public.ai_usage.requests + 1
$$;
revoke execute on function public.ai_record(uuid, integer) from anon, authenticated, public;

-- ── What the app shows in Settings → Plan ────────────────────────────────────

create or replace function public.my_plan()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (select * from public.plan_config),
  s as (select * from public.subscriptions where user_id = auth.uid())
  select jsonb_build_object(
    'plan', public.plan_of(auth.uid()),
    'status', case
      when coalesce(c.beta_until > now(), false) then 'beta'
      when public.plan_of(auth.uid()) = 'pro' then (select status from s)
      else 'free' end,
    'beta_until', c.beta_until,
    'trial_ends_at', (select trial_ends_at from s),
    'current_period_end', (select current_period_end from s),
    'canceled', coalesce((select status = 'canceled' from s), false),
    'ai', public.ai_status(auth.uid()),
    'storage', jsonb_build_object(
      'used', public.storage_used(auth.uid()),
      'limit', case when public.plan_of(auth.uid()) = 'pro' then c.storage_bytes else 0 end)
  )
  from c
$$;
revoke execute on function public.my_plan() from anon, public;
grant execute on function public.my_plan() to authenticated;

-- The server side (edge functions, service role) uses these.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ai_allowance(uuid) to service_role;
    grant execute on function public.ai_record(uuid, integer) to service_role;
    grant execute on function public.is_pro(uuid) to service_role;
    grant all on public.subscriptions to service_role;
    grant all on public.plan_config to service_role;
  end if;
end $$;
