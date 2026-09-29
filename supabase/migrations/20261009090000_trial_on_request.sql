-- The trial is the account's choice: signing up gives Free, and the 7 days of Pro start when the
-- account asks (the offer after sign-in, the Pro card, Settings → Plan): begin_trial(). One trial
-- per account, none for throwaway mail addresses. Accounts that already have a trial keep it.

drop trigger if exists subscriptions_start_trial on auth.users;
drop function if exists public.start_trial();

-- The account may still start its trial: it never had one (nor a subscription) and its address is
-- not a throwaway one.
create or replace function public.trial_available(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null
     and not exists (select 1 from public.subscriptions where user_id = p_user)
     and not public.is_disposable_email((select email from auth.users where id = p_user))
$$;
revoke execute on function public.trial_available(uuid) from anon, authenticated, public;

-- Starts the caller's trial; raises 'trial_unavailable' when it may not.
create or replace function public.begin_trial()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_end timestamptz;
begin
  if not public.trial_available(auth.uid()) then
    raise exception 'trial_unavailable' using errcode = 'P0001';
  end if;
  insert into public.subscriptions (user_id, status, trial_ends_at)
  values (auth.uid(), 'trialing', public.trial_end())
  returning trial_ends_at into v_end;
  return v_end;
end $$;
revoke execute on function public.begin_trial() from anon, public;
grant execute on function public.begin_trial() to authenticated;

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
  from c, used
$$;
revoke execute on function public.my_plan() from anon, public;
grant execute on function public.my_plan() to authenticated;
