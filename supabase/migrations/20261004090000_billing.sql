-- Payments through Suby (supabase/functions/billing, supabase/functions/suby-webhook). Checkout
-- opens a Suby subscription for the account's email with the account id in its metadata; Suby's
-- signed webhooks then set `subscriptions` (see *_plans.sql) from the subscription's own state.

-- Webhook events already handled (Suby retries and may send one twice).
create table public.billing_events (
  id         text primary key,
  type       text not null,
  created_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

create index subscriptions_provider_subscription on public.subscriptions (provider_subscription_id);
create index subscriptions_provider_customer on public.subscriptions (provider_customer_id);

-- The account behind an email (a subscription bought without our metadata, found by its email).
create or replace function public.user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1
$$;
revoke execute on function public.user_id_by_email(text) from anon, authenticated, public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.billing_events to service_role;
    grant execute on function public.user_id_by_email(text) to service_role;
  end if;
end $$;
