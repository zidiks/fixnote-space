-- Connecting the browser extension the way AI apps are connected: the extension asks, the app
-- confirms (functions/capture-extension, apps/extension, ExtensionConnectDialog in the app).
--
-- 1. The extension (no account) calls capture-extension /request: a row here with a random id, the
--    SHA-256 of a secret only the extension holds, its label ("Chrome · Windows") and a short code
--    it shows. It opens the app with that id (app.fixnote.space/?extension=<id> or
--    fixnote://extension?id=<id>).
-- 2. The app, signed in, reads the request (extension_request) and the person compares the code
--    with the one in the extension; Connect or Deny answers it (answer_extension_request).
-- 3. The extension polls /poll with its secret; once approved, the function makes its token
--    (capture_links, channel 'extension') and the row goes. A token only ever reaches the holder of
--    the secret, never the page that opened the link.
--
-- Rows live 10 minutes. Nobody reads the table directly: only these functions and the service role.

create table public.extension_requests (
  id          uuid primary key default gen_random_uuid(),
  secret_hash text not null check (length(secret_hash) = 64),
  label       text not null default '' check (length(label) <= 128),
  code        text not null check (length(code) between 4 and 8),
  user_id     uuid references auth.users (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '10 minutes'
);
create index extension_requests_expires on public.extension_requests (expires_at);

alter table public.extension_requests enable row level security;
revoke all on public.extension_requests from anon, authenticated;
create policy "no oauth clients" on public.extension_requests
  as restrictive for all to authenticated
  using (not public.is_oauth_client()) with check (not public.is_oauth_client());

-- What the app's dialog shows: the browser's label and the code; nothing once answered or expired.
create or replace function public.extension_request(p_id uuid)
returns table (label text, code text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  return query
    select r.label, r.code, r.created_at
      from public.extension_requests r
     where r.id = p_id and r.status = 'pending' and r.expires_at > now();
end;
$$;
revoke all on function public.extension_request(uuid) from public, anon;
grant execute on function public.extension_request(uuid) to authenticated;

-- Connect or Deny, as the signed-in account. False when the request is gone, expired or answered.
create or replace function public.answer_extension_request(p_id uuid, p_allow boolean)
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
  if p_allow and not exists (select 1 from public.user_keys where user_id = uid) then
    raise exception 'account keys missing' using errcode = '22023';
  end if;
  update public.extension_requests
     set status = case when p_allow then 'approved' else 'denied' end,
         user_id = case when p_allow then uid else null end
   where id = p_id and status = 'pending' and expires_at > now();
  return found;
end;
$$;
revoke all on function public.answer_extension_request(uuid, boolean) from public, anon;
grant execute on function public.answer_extension_request(uuid, boolean) to authenticated;
