-- The beta is only a label now: the app says "Beta" while `beta_until` is ahead, and nothing else
-- depends on it. Plans work as after the launch: 7 days of Pro from sign-up (no card), then Free
-- unless paid, with the trial's limits.

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
revoke execute on function public.plan_of(uuid) from anon, authenticated, public;

-- A trial starting now ends `trial_days` from now.
create or replace function public.trial_end()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$ select now() + make_interval(days => trial_days) from public.plan_config $$;
revoke execute on function public.trial_end() from anon, authenticated, public;

-- Trials that were waiting for the end of the beta start now.
update public.subscriptions
   set trial_ends_at = public.trial_end(), updated_at = now()
 where status = 'trialing' and provider is null and trial_ends_at > public.trial_end();

-- The label goes: run by hand when the beta is over (select end_beta();).
create or replace function public.end_beta()
returns void
language sql
security definer
set search_path = public
as $$ update public.plan_config set beta_until = now() $$;
revoke execute on function public.end_beta() from anon, authenticated, public;

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

create or replace function public.storage_limit(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.plan_of(p_user) <> 'pro' then 0
    when exists (select 1 from public.subscriptions s
                  where s.user_id = p_user and s.status = 'trialing' and s.provider is null)
      then c.trial_storage_bytes
    else c.storage_bytes end
  from public.plan_config c
$$;
revoke execute on function public.storage_limit(uuid) from anon, authenticated, public;

create or replace function public.files_delete_at(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, storage
as $$
  select case
    when public.plan_of(p_user) = 'pro' or public.had_subscription(p_user) then null
    when not exists (select 1 from storage.objects o
                      where o.bucket_id = 'attachments'
                        and (storage.foldername(o.name))[1] = p_user::text) then null
    else coalesce((select trial_ends_at from public.subscriptions where user_id = p_user), now())
      + make_interval(days => c.free_files_days)
  end
  from public.plan_config c
$$;
revoke execute on function public.files_delete_at(uuid) from anon, authenticated, public;

create or replace function public.my_plan()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (select * from public.plan_config),
  s as (select * from public.subscriptions where user_id = auth.uid()),
  used as (select public.storage_used(auth.uid()) as bytes)
  select jsonb_build_object(
    'plan', public.plan_of(auth.uid()),
    'status', case
      when public.plan_of(auth.uid()) = 'pro' then (select status from s)
      else 'free' end,
    -- Only for the "Beta" label.
    'beta', coalesce(c.beta_until > now(), false),
    'beta_until', c.beta_until,
    'trial_ends_at', (select trial_ends_at from s),
    'current_period_end', (select current_period_end from s),
    'canceled', coalesce((select status = 'canceled' from s), false),
    'paid_before', public.had_subscription(auth.uid()),
    'files_delete_at', case when used.bytes > 0 then public.files_delete_at(auth.uid()) end,
    'ai', public.ai_status(auth.uid()),
    'storage', jsonb_build_object('used', used.bytes, 'limit', public.storage_limit(auth.uid())),
    -- What Pro did for the account, for the note at the end of the trial.
    'usage', jsonb_build_object(
      'notes', (select count(*) from public.notes where user_id = auth.uid() and deleted_at is null),
      'ai_answers', (select coalesce(sum(requests), 0) from public.ai_usage where user_id = auth.uid()),
      'files', used.bytes)
  )
  from c, used
$$;
revoke execute on function public.my_plan() from anon, public;
grant execute on function public.my_plan() to authenticated;
