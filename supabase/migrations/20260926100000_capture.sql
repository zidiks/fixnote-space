-- Capture channels: send a thought to the Telegram bot, find it in FixNote. The bot never keeps
-- plaintext: it seals each message to the user's public key (user_keys.public_key, X25519,
-- crypto_box_seal) and stores it in inbox_items; only the user's devices can open it. A device
-- turns items into notes and deletes them. See docs/CONCEPT.md, section 4.9.

-- ── Linked chats ────────────────────────────────────────────────────────────
create table public.capture_links (
  channel     text not null check (channel in ('telegram')),
  external_id text not null check (length(external_id) between 1 and 64),
  user_id     uuid not null references auth.users (id) on delete cascade,
  label       text check (length(label) <= 128),
  created_at  timestamptz not null default now(),
  primary key (channel, external_id)
);
create index capture_links_user on public.capture_links (user_id);

alter table public.capture_links enable row level security;
create policy "capture_links: read own" on public.capture_links
  for select to authenticated using (user_id = (select auth.uid()));
create policy "capture_links: unlink own" on public.capture_links
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.capture_links from anon;
revoke insert, update on public.capture_links from authenticated;

-- ── One-time link codes (deep link t.me/<bot>?start=<code>) ─────────────────
create table public.capture_codes (
  code       text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.capture_codes enable row level security;
revoke all on public.capture_codes from anon, authenticated;

-- A fresh code for the signed-in user, valid 15 minutes. Older codes of the user are dropped.
create or replace function public.create_capture_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_code text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.user_keys where user_id = uid) then
    raise exception 'account keys missing' using errcode = '22023';
  end if;
  delete from public.capture_codes where user_id = uid or expires_at < now();
  -- 24 url-safe characters from 18 random bytes; fits Telegram's 64-char start parameter.
  new_code := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
  insert into public.capture_codes (code, user_id, expires_at)
  values (new_code, uid, now() + interval '15 minutes');
  return new_code;
end;
$$;
revoke all on function public.create_capture_code() from public, anon;
grant execute on function public.create_capture_code() to authenticated;

-- ── Sealed items waiting for a device ───────────────────────────────────────
create table public.inbox_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  channel    text not null check (channel in ('telegram')),
  -- base64url crypto_box_seal of the JSON payload (packages/core/src/capture).
  sealed     text not null check (length(sealed) <= 16000000),
  created_at timestamptz not null default now()
);
create index inbox_items_user on public.inbox_items (user_id, created_at);

alter table public.inbox_items enable row level security;
create policy "inbox_items: read own" on public.inbox_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "inbox_items: remove own" on public.inbox_items
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.inbox_items from anon;
revoke insert, update on public.inbox_items from authenticated;

alter publication supabase_realtime add table public.inbox_items;
