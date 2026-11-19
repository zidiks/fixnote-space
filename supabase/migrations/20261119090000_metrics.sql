-- Metrics for the daily report in Telegram (functions/metrics-digest). Counts only: no note
-- content (the server has none), no emails, no names. Two small tables keep what the existing
-- rows forget: the days each account was active, and the plan changes of each account.
-- Days are counted in Minsk time (UTC+3, no daylight saving), like the report.

-- ── Active days ──────────────────────────────────────────────────────────────

-- One row per account per day it was seen: a push of notes, or a session refreshed by an open
-- app (any plan, Free included, as long as it is signed in). History starts with this migration.
create table public.account_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  primary key (user_id, day)
);
alter table public.account_days enable row level security;
revoke all on public.account_days from anon, authenticated;
create index account_days_day on public.account_days (day);

create or replace function public.metrics_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Europe/Minsk')::date $$;

create or replace function public.note_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.account_days (user_id, day)
  values (new.user_id, public.metrics_today())
  on conflict do nothing;
  return null;
end $$;

create trigger notes_activity
  after insert or update on public.notes
  for each row execute function public.note_activity();

-- Accounts whose app refreshed its session in the last hour (each refresh makes a new refresh
-- token). Run every hour by pg_cron; Supabase deletes old tokens, so the history lives here.
create or replace function public.record_session_activity()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.account_days (user_id, day)
  select distinct u.id, public.metrics_today()
    from auth.refresh_tokens t
    join auth.users u on u.id::text = t.user_id
   where t.created_at > now() - interval '65 minutes'
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.record_session_activity() from anon, authenticated, public;

-- ── Plan changes ─────────────────────────────────────────────────────────────

-- trial: a trial began; paid: the first payment of the account; renewed: any later payment
-- (Suby renewal or more card time); canceled: the plan was set to end.
create table public.plan_events (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind    text not null check (kind in ('trial', 'paid', 'renewed', 'canceled')),
  at      timestamptz not null default now()
);
alter table public.plan_events enable row level security;
revoke all on public.plan_events from anon, authenticated;
create index plan_events_at on public.plan_events (at);
create index plan_events_user on public.plan_events (user_id, kind);

create or replace function public.subscriptions_plan_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_insert boolean := tg_op = 'INSERT';
  v_trial boolean;
  v_paid boolean;
begin
  v_trial := new.trial_ends_at is not null
    and (v_insert or old.trial_ends_at is null);
  -- A payment: Suby turned the row active or moved its period on, or card time grew.
  v_paid := (new.status = 'active'
             and (v_insert or old.status <> 'active'
                  or new.current_period_end > coalesce(old.current_period_end, '-infinity')))
         or (new.prepaid_until is not null
             and new.prepaid_until > coalesce(case when v_insert then null else old.prepaid_until end,
                                              '-infinity'));

  if v_trial then
    insert into public.plan_events (user_id, kind) values (new.user_id, 'trial');
  end if;
  if v_paid then
    insert into public.plan_events (user_id, kind)
    values (new.user_id,
            case when exists (select 1 from public.plan_events
                               where user_id = new.user_id and kind in ('paid', 'renewed'))
                 then 'renewed' else 'paid' end);
  end if;
  -- Not on insert: a card payment without a row inserts a 'canceled' one that only holds card time.
  if not v_insert and new.status = 'canceled' and old.status <> 'canceled' then
    insert into public.plan_events (user_id, kind) values (new.user_id, 'canceled');
  end if;
  return null;
end $$;

create trigger subscriptions_plan_events
  after insert or update on public.subscriptions
  for each row execute function public.subscriptions_plan_events();

-- What happened before this migration, as well as the rows tell it.
insert into public.plan_events (user_id, kind, at)
select user_id, 'trial', created_at from public.subscriptions where trial_ends_at is not null;

insert into public.plan_events (user_id, kind, at)
select user_id,
       case when row_number() over (partition by user_id order by paid_at) = 1
            then 'paid' else 'renewed' end,
       paid_at
  from public.card_orders
 where status = 'paid' and user_id is not null and paid_at is not null;

insert into public.plan_events (user_id, kind, at)
select s.user_id,
       case when exists (select 1 from public.plan_events e
                          where e.user_id = s.user_id and e.kind = 'paid')
            then 'renewed' else 'paid' end,
       s.updated_at
  from public.subscriptions s
 where s.provider = 'suby' and s.status in ('active', 'past_due');

insert into public.plan_events (user_id, kind, at)
select user_id, 'canceled', updated_at
  from public.subscriptions
 where status = 'canceled' and provider = 'suby';

-- ── AI by level ──────────────────────────────────────────────────────────────

-- Requests to the larger model ("hard" in Settings → AI); `requests` keeps counting all of them.
alter table public.ai_usage add column hard_requests integer not null default 0;

drop function public.ai_record(uuid, integer, integer);
create function public.ai_record(
  p_user uuid,
  p_tokens integer,
  p_requests integer default 1,
  p_hard boolean default false
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage (user_id, day, tokens, requests, hard_requests)
  values (p_user, (now() at time zone 'utc')::date, greatest(p_tokens, 0), greatest(p_requests, 0),
          case when p_hard then greatest(p_requests, 0) else 0 end)
  on conflict (user_id, day) do update
    set tokens = public.ai_usage.tokens + excluded.tokens,
        requests = public.ai_usage.requests + excluded.requests,
        hard_requests = public.ai_usage.hard_requests + excluded.hard_requests
$$;
revoke execute on function public.ai_record(uuid, integer, integer, boolean)
  from anon, authenticated, public;

-- ── The report ───────────────────────────────────────────────────────────────

-- One report a day, whoever calls the function (it needs no key), and the counters it compares
-- with the day before (downloads on GitHub are totals).
create table public.metrics_runs (
  day     date primary key,
  sent_at timestamptz not null default now(),
  -- Totals read from outside (GitHub downloads), to tell how much they grew.
  totals  jsonb not null default '{}'
);
alter table public.metrics_runs enable row level security;
revoke all on public.metrics_runs from anon, authenticated;

create or replace function public.metrics_claim(p_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev jsonb;
begin
  insert into public.metrics_runs (day) values (p_day) on conflict do nothing;
  if not found then
    return null;
  end if;
  select totals into v_prev from public.metrics_runs
   where day < p_day and totals <> '{}' order by day desc limit 1;
  return coalesce(v_prev, '{}');
end $$;
revoke execute on function public.metrics_claim(date) from anon, authenticated, public;

-- The totals of the last daily report, for a report asked for in the bot (it claims no day).
create or replace function public.metrics_last_totals()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select totals from public.metrics_runs
                    where totals <> '{}' order by day desc limit 1), '{}')
$$;
revoke execute on function public.metrics_last_totals() from anon, authenticated, public;

create or replace function public.metrics_save_totals(p_day date, p_totals jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.metrics_runs set totals = p_totals where day = p_day
$$;
revoke execute on function public.metrics_save_totals(date, jsonb) from anon, authenticated, public;

-- The numbers of one day (Minsk), plus totals as of now.
create or replace function public.metrics_day(p_day date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select (p_day::timestamp at time zone 'Europe/Minsk') as t0,
           ((p_day + 1)::timestamp at time zone 'Europe/Minsk') as t1
  ),
  ms as (
    select (extract(epoch from t0) * 1000)::bigint as m0,
           (extract(epoch from t1) * 1000)::bigint as m1
      from b
  )
  select jsonb_build_object(
    'day', p_day,
    'accounts', (select count(*) from auth.users),
    'signups', (select count(*) from auth.users, b where created_at >= t0 and created_at < t1),
    'active_day', (select count(*) from public.account_days where day = p_day),
    'active_7', (select count(distinct user_id) from public.account_days
                  where day > p_day - 7 and day <= p_day),
    'active_7_before', (select count(distinct user_id) from public.account_days
                         where day > p_day - 14 and day <= p_day - 7),
    'pro', (select count(*) from public.subscriptions s where public.plan_of(s.user_id) = 'pro'),
    'trialing', (select count(*) from public.subscriptions s
                  where s.status = 'trialing' and s.trial_ends_at > now()
                    and not public.prepaid_now(s.user_id)),
    'trials', (select count(*) from public.plan_events, b
                where kind = 'trial' and at >= t0 and at < t1),
    'first_paid', (select count(*) from public.plan_events, b
                    where kind = 'paid' and at >= t0 and at < t1),
    'renewed', (select count(*) from public.plan_events, b
                 where kind = 'renewed' and at >= t0 and at < t1),
    'canceled', (select count(*) from public.plan_events, b
                  where kind = 'canceled' and at >= t0 and at < t1),
    'card_payments', (select coalesce(jsonb_agg(jsonb_build_object(
                         'currency', paid_currency, 'count', n, 'sum', total)), '[]')
                        from (select paid_currency, count(*) as n, sum(paid_amount) as total
                                from public.card_orders, b
                               where status = 'paid' and paid_at >= t0 and paid_at < t1
                               group by paid_currency) c),
    'suby_payments', (select count(*) from public.billing_events, b
                       where type = 'payment.succeeded' and created_at >= t0 and created_at < t1),
    'notes_new', (select count(*) from public.notes, ms
                   where created_at >= m0 and created_at < m1 and deleted_at is null),
    'notes_changed', (select count(*) from public.notes, b
                       where server_updated_at >= t0 and server_updated_at < t1),
    'notes_accounts', (select count(distinct user_id) from public.notes, b
                        where server_updated_at >= t0 and server_updated_at < t1),
    'ai_requests', (select coalesce(sum(requests), 0) from public.ai_usage where day = p_day),
    'ai_hard', (select coalesce(sum(hard_requests), 0) from public.ai_usage where day = p_day),
    'ai_accounts', (select count(*) from public.ai_usage where day = p_day and requests > 0),
    'shared_new', (select count(*) from public.shared_notes, b
                    where created_at >= t0 and created_at < t1),
    'shared_total', (select count(*) from public.shared_notes),
    'links_new', (select count(*) from public.shares, b where created_at >= t0 and created_at < t1),
    'capture_new', (select coalesce(jsonb_object_agg(channel, n), '{}')
                      from (select channel, count(*) as n from public.capture_links, b
                             where created_at >= t0 and created_at < t1 group by channel) c),
    'capture_total', (select coalesce(jsonb_object_agg(channel, n), '{}')
                        from (select channel, count(*) as n from public.capture_links
                               group by channel) c)
  )
  from b
$$;
revoke execute on function public.metrics_day(date) from anon, authenticated, public;

-- Signups by week (Monday, Minsk) for the last `p_weeks` full weeks before `p_day`'s week:
-- the funnel, activation in each account's first 7 days, and the share active in each later week.
create or replace function public.metrics_cohorts(p_day date, p_weeks integer default 6)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with weeks as (
    select (date_trunc('week', p_day::timestamp)::date - 7 * g) as w
      from generate_series(1, p_weeks) g
  ),
  people as (
    select u.id,
           u.created_at,
           date_trunc('week', (u.created_at at time zone 'Europe/Minsk'))::date as w,
           (u.created_at at time zone 'Europe/Minsk')::date as d0
      from auth.users u
  ),
  per as (
    select p.w,
           p.id,
           exists (select 1 from public.plan_events e where e.user_id = p.id and e.kind = 'trial')
             as trial,
           exists (select 1 from public.plan_events e
                    where e.user_id = p.id and e.kind in ('paid', 'renewed')) as paid,
           exists (select 1 from public.plan_events e where e.user_id = p.id and e.kind = 'renewed')
             as renewed,
           exists (select 1 from public.plan_events e where e.user_id = p.id and e.kind = 'canceled')
             as canceled,
           (select count(*) from public.notes n
             where n.user_id = p.id
               and n.created_at < (extract(epoch from p.created_at + interval '7 days') * 1000)::bigint)
             >= 5 as notes5,
           (select count(*) from auth.sessions s
             where s.user_id = p.id and s.created_at < p.created_at + interval '7 days') >= 2
             as devices2,
           exists (select 1 from public.ai_usage a
                    where a.user_id = p.id and a.day < (p.created_at + interval '7 days')::date)
             as ai,
           exists (select 1 from public.capture_links c
                    where c.user_id = p.id and c.created_at < p.created_at + interval '7 days')
             as capture,
           array(select distinct ((d.day - p.w) / 7) from public.account_days d
                  where d.user_id = p.id and d.day >= p.w + 7 and d.day < p_day) as later_weeks
      from people p
     where p.w in (select w from weeks)
  )
  select coalesce(jsonb_agg(r order by r->>'week' desc), '[]')
    from (
      select jsonb_build_object(
        'week', w.w,
        'signups', count(per.id),
        'trial', count(*) filter (where per.trial),
        'paid', count(*) filter (where per.paid),
        'renewed', count(*) filter (where per.renewed),
        'canceled', count(*) filter (where per.canceled),
        'notes5', count(*) filter (where per.notes5),
        'devices2', count(*) filter (where per.devices2),
        'ai', count(*) filter (where per.ai),
        'capture', count(*) filter (where per.capture),
        -- Active in week 1, 2, ... after the signup week (only weeks that are over).
        'retention', (select coalesce(jsonb_agg(n order by k), '[]')
                        from (select k, count(*) filter (where k = any (per2.later_weeks)) as n
                                from generate_series(1, ((date_trunc('week', p_day::timestamp)::date - w.w) / 7) - 1) k
                                cross join per per2
                               where per2.w = w.w
                               group by k) r)
      ) as r
        from weeks w
        left join per on per.w = w.w
       group by w.w
    ) x
$$;
revoke execute on function public.metrics_cohorts(date, integer) from anon, authenticated, public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ai_record(uuid, integer, integer, boolean) to service_role;
    grant execute on function public.metrics_claim(date) to service_role;
    grant execute on function public.metrics_save_totals(date, jsonb) to service_role;
    grant execute on function public.metrics_last_totals() to service_role;
    grant execute on function public.metrics_day(date) to service_role;
    grant execute on function public.metrics_cohorts(date, integer) to service_role;
  end if;
end $$;

-- AI-app tokens never reach these tables (no grants), but every RLS table carries the policy.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_proc where proname = 'is_oauth_client') then
    foreach t in array array['account_days', 'plan_events', 'metrics_runs'] loop
      execute format(
        'create policy "no oauth clients" on public.%I as restrictive for all to authenticated
           using (not public.is_oauth_client()) with check (not public.is_oauth_client())', t);
    end loop;
  end if;
end $$;

-- Hosted project only (pg_cron, pg_net): sessions every hour, the report at 09:00 Minsk.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net with schema extensions;
    perform cron.schedule(
      'fixnote-session-activity',
      '58 * * * *',
      $cron$select public.record_session_activity()$cron$
    );
    perform cron.schedule(
      'fixnote-metrics-digest',
      '0 6 * * *',
      $cron$select net.http_post(url := 'https://nsteehqbmljuczxgkvae.supabase.co/functions/v1/metrics-digest')$cron$
    );
  end if;
end $$;
