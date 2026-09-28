-- The trial needs a card: a new account starts on Free, and the 7 days of Pro come from a Suby
-- subscription whose product has a trial (the card is taken at checkout, the first charge comes
-- after the trial). One trial per account: whoever already had a Suby subscription gets the
-- products without one (supabase/functions/billing).

drop trigger if exists subscriptions_start_trial on auth.users;
drop function if exists public.start_trial();

-- Trials given at sign-up before this change (without a card) end here; the beta covers everyone.
delete from public.subscriptions where provider is null and status = 'trialing';

-- Whether the account already had a subscription through Suby (then no second trial).
create or replace function public.had_subscription(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.subscriptions where user_id = p_user and provider is not null)
$$;
revoke execute on function public.had_subscription(uuid) from anon, authenticated, public;

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
    'trial_used', public.had_subscription(auth.uid()),
    'trial_days', c.trial_days,
    'ai', public.ai_status(auth.uid()),
    'storage', jsonb_build_object(
      'used', public.storage_used(auth.uid()),
      'limit', case when public.plan_of(auth.uid()) = 'pro' then c.storage_bytes else 0 end)
  )
  from c
$$;
revoke execute on function public.my_plan() from anon, public;
grant execute on function public.my_plan() to authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.had_subscription(uuid) to service_role;
  end if;
end $$;
