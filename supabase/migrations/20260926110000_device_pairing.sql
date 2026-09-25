-- Adding a device without typing the recovery phrase. The new device (signed in by email code)
-- posts a one-time X25519 public key; a device that is already set up shows the request with a
-- 6-digit code derived from that key, and on approval seals the account secret to it. The server
-- only ever holds the sealed secret. Comparing the codes on both screens defeats a server that
-- swaps in its own key. Requests expire after 10 minutes.

create table public.device_pairings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ephemeral_key text not null check (length(ephemeral_key) between 40 and 64),
  device_label  text not null default '' check (length(device_label) <= 128),
  sealed_secret text check (length(sealed_secret) <= 512),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '10 minutes'
);
create index device_pairings_user on public.device_pairings (user_id, created_at);

alter table public.device_pairings enable row level security;
create policy "device_pairings: read own" on public.device_pairings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "device_pairings: request own" on public.device_pairings
  for insert to authenticated with check (user_id = (select auth.uid()) and sealed_secret is null);
create policy "device_pairings: remove own" on public.device_pairings
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.device_pairings from anon;
revoke update on public.device_pairings from authenticated;

-- Approve a pending request of the same account: store the sealed secret once.
create or replace function public.approve_device_pairing(p_id uuid, p_sealed text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if length(p_sealed) > 512 then
    raise exception 'sealed secret too long' using errcode = '22023';
  end if;
  update public.device_pairings
     set sealed_secret = p_sealed
   where id = p_id and user_id = uid and sealed_secret is null and expires_at > now();
  return found;
end;
$$;
revoke all on function public.approve_device_pairing(uuid, text) from public, anon;
grant execute on function public.approve_device_pairing(uuid, text) to authenticated;

alter publication supabase_realtime add table public.device_pairings;
