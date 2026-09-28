-- The trial without a card, again (replaces the card trial of *_card_trial.sql): a new account gets
-- Pro for `trial_days` from sign-up, or from the end of the beta when it signs up during it. Kept
-- cheap so a fresh account is not worth making for it: `trial_storage_bytes` of files, the trial AI
-- allowance of *_plans.sql. Addresses of throwaway mail services get no trial (straight to Free,
-- without a word). The files of accounts that never paid leave the server `free_files_days` after
-- their Pro ended (functions/storage-cleanup); the app keeps a copy on the device before that.

alter table public.plan_config
  add column trial_storage_bytes bigint not null default 1073741824,
  add column free_files_days integer not null default 90;

-- ── Throwaway mail services ──────────────────────────────────────────────────

-- Domains of services that hand out an inbox for minutes (a subdomain counts too). Not the
-- forwarding services people keep for years (SimpleLogin, Firefox Relay, DuckDuckGo): those are
-- exactly who a private notes app is for. Add more with an insert.
create table public.disposable_domains (domain text primary key check (domain = lower(domain)));
alter table public.disposable_domains enable row level security;
revoke all on public.disposable_domains from anon, authenticated;

insert into public.disposable_domains (domain) values
  ('10minemail.com'), ('10minutemail.co.uk'), ('10minutemail.com'), ('10minutemail.net'),
  ('1secmail.com'), ('1secmail.net'), ('1secmail.org'), ('20minutemail.com'), ('anonbox.net'),
  ('armyspy.com'), ('bccto.me'), ('burnermail.io'), ('byom.de'), ('chacuo.net'),
  ('crazymailing.com'), ('cuvox.de'), ('dayrep.com'), ('discard.email'), ('discardmail.com'),
  ('dispostable.com'), ('dropmail.me'), ('einrot.com'), ('emailfake.com'), ('emailondeck.com'),
  ('emltmp.com'), ('esiix.com'), ('fakeinbox.com'), ('fakemail.net'), ('fakemailgenerator.com'),
  ('fleckens.hu'), ('getairmail.com'), ('getnada.com'), ('grr.la'), ('guerrillamail.biz'),
  ('guerrillamail.com'), ('guerrillamail.de'), ('guerrillamail.info'), ('guerrillamail.net'),
  ('guerrillamail.org'), ('guerrillamailblock.com'), ('gustr.com'), ('harakirimail.com'),
  ('inboxkitten.com'), ('incognitomail.org'), ('jourrapide.com'), ('kurzepost.de'),
  ('mail-temp.com'), ('mail.gw'), ('mail.tm'), ('mailcatch.com'), ('maildrop.cc'),
  ('mailexpire.com'), ('mailforspam.com'), ('mailinator.com'), ('mailinator.net'),
  ('mailnesia.com'), ('mailpoof.com'), ('mailsac.com'), ('minuteinbox.com'), ('mintemail.com'),
  ('mohmal.com'), ('mytemp.email'), ('nada.email'), ('pokemail.net'), ('rhyta.com'),
  ('sharklasers.com'), ('spam4.me'), ('spambox.us'), ('spamgourmet.com'), ('superrito.com'),
  ('teleworm.us'), ('temp-mail.io'), ('temp-mail.org'), ('tempail.com'), ('tempinbox.com'),
  ('tempmail.com'), ('tempmail.dev'), ('tempmail.net'), ('tempmail.plus'), ('tempmailo.com'),
  ('tempr.email'), ('throwawaymail.com'), ('tmail.ws'), ('tmpmail.net'), ('tmpmail.org'),
  ('trash-mail.at'), ('trashmail.at'), ('trashmail.com'), ('trashmail.de'), ('trashmail.io'),
  ('trashmail.me'), ('trashmail.net'), ('trbvm.com'), ('wegwerfemail.de'), ('wegwerfmail.de'),
  ('wegwerfmail.net'), ('wwjmp.com'), ('xojxe.com'), ('yopmail.com'), ('yopmail.fr'),
  ('yopmail.net'), ('zetmail.com');

create or replace function public.is_disposable_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with d as (select lower(split_part(trim(coalesce(p_email, '')), '@', 2)) as host)
  select exists (
    select 1 from public.disposable_domains x, d
     where d.host = x.domain or d.host like '%.' || x.domain)
$$;
revoke execute on function public.is_disposable_email(text) from anon, authenticated, public;

-- ── The trial ────────────────────────────────────────────────────────────────

-- When a trial starting now ends: `trial_days` after today, or after the beta while it runs.
create or replace function public.trial_end()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select greatest(now(), coalesce(beta_until, now())) + make_interval(days => trial_days)
    from public.plan_config
$$;
revoke execute on function public.trial_end() from anon, authenticated, public;

create or replace function public.start_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_disposable_email(new.email) then
    insert into public.subscriptions (user_id, status, trial_ends_at)
    values (new.id, 'trialing', public.trial_end())
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.start_trial() from anon, authenticated, public;
drop trigger if exists subscriptions_start_trial on auth.users;
create trigger subscriptions_start_trial after insert on auth.users
  for each row execute function public.start_trial();

-- Accounts made during the beta: their trial comes after it (trials given before were removed by
-- *_card_trial.sql, or ran out inside the beta).
insert into public.subscriptions (user_id, status, trial_ends_at)
select u.id, 'trialing', public.trial_end()
  from auth.users u, public.plan_config c
 where coalesce(c.beta_until > now(), false)
   and not public.is_disposable_email(u.email)
on conflict (user_id) do update
  set status = 'trialing', trial_ends_at = excluded.trial_ends_at, updated_at = now()
  where public.subscriptions.provider is null;

-- Ends the beta now; the trials waiting for it start today. Run by hand: select end_beta();
create or replace function public.end_beta()
returns void
language sql
security definer
set search_path = public
as $$
  update public.plan_config set beta_until = now();
  update public.subscriptions
     set trial_ends_at = public.trial_end(), updated_at = now()
   where status = 'trialing' and provider is null and trial_ends_at > public.trial_end();
$$;
revoke execute on function public.end_beta() from anon, authenticated, public;

-- ── Files: 1 GB on the trial ─────────────────────────────────────────────────

create or replace function public.storage_limit(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.plan_of(p_user) <> 'pro' then 0
    when coalesce(c.beta_until > now(), false) then c.storage_bytes
    when exists (select 1 from public.subscriptions s
                  where s.user_id = p_user and s.status = 'trialing' and s.provider is null)
      then c.trial_storage_bytes
    else c.storage_bytes end
  from public.plan_config c
$$;
revoke execute on function public.storage_limit(uuid) from anon, authenticated, public;

create or replace function public.can_upload()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_pro(auth.uid())
     and public.storage_used(auth.uid()) < public.storage_limit(auth.uid())
$$;

-- ── Files of accounts that never paid ────────────────────────────────────────

-- When the server copy of the account's files goes: `free_files_days` after its Pro (trial or
-- beta) ended. Null while on Pro, and for anyone who paid even once.
create or replace function public.files_delete_at(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.plan_of(p_user) = 'pro' or public.had_subscription(p_user) then null
    else greatest(
      coalesce((select trial_ends_at from public.subscriptions where user_id = p_user), '-infinity'),
      coalesce(c.beta_until, '-infinity')
    ) + make_interval(days => c.free_files_days)
  end
  from public.plan_config c
$$;
revoke execute on function public.files_delete_at(uuid) from anon, authenticated, public;

-- storage-cleanup: accounts whose files are due to go (a batch at a time).
create or replace function public.files_due(p_limit integer default 200)
returns setof uuid
language sql
stable
security definer
set search_path = public, storage
as $$
  select u.id
    from auth.users u
   where exists (select 1 from storage.objects o
                  where o.bucket_id = 'attachments'
                    and (storage.foldername(o.name))[1] = u.id::text)
     and public.files_delete_at(u.id) <= now()
  limit p_limit
$$;
revoke execute on function public.files_due(integer) from anon, authenticated, public;

-- storage-cleanup runs at most once an hour, whoever calls it (it needs no key: it only removes
-- what is due anyway).
create table public.cleanup_runs (
  id       boolean primary key default true check (id),
  last_run timestamptz not null default '-infinity'
);
insert into public.cleanup_runs default values;
alter table public.cleanup_runs enable row level security;
revoke all on public.cleanup_runs from anon, authenticated;

create or replace function public.claim_cleanup()
returns boolean
language sql
security definer
set search_path = public
as $$
  with claimed as (
    update public.cleanup_runs set last_run = now()
     where last_run < now() - interval '1 hour'
    returning 1)
  select exists (select 1 from claimed)
$$;
revoke execute on function public.claim_cleanup() from anon, authenticated, public;

-- ── What the app shows ───────────────────────────────────────────────────────

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
      when coalesce(c.beta_until > now(), false) then 'beta'
      when public.plan_of(auth.uid()) = 'pro' then (select status from s)
      else 'free' end,
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

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.files_due(integer) to service_role;
    grant execute on function public.claim_cleanup() to service_role;
  end if;
end $$;

-- Every night: storage-cleanup (only on the hosted project, where pg_cron and pg_net exist).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net with schema extensions;
    perform cron.schedule(
      'fixnote-storage-cleanup',
      '23 3 * * *',
      $cron$select net.http_post(url := 'https://nsteehqbmljuczxgkvae.supabase.co/functions/v1/storage-cleanup')$cron$
    );
  end if;
end $$;
