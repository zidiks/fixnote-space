-- Notes shared with other people, edited live (docs/CONCEPT.md, "Совместная правка").
-- The server keeps, per shared note, its sealed Yjs state and, per member, the note key sealed to
-- that member's public key. It never sees the text or the key. Live edits travel through private
-- Realtime channels "shared:<id>": members may listen, only owner and editors may send.

create table public.shared_notes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The owner's own note, so the owner's other devices link the shared note back to it.
  origin_note_id uuid not null,
  -- Sealed Yjs update (base64) of the whole note; null until the first save.
  state          text check (length(state) < 8 * 1024 * 1024),
  version        integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, origin_note_id)
);

create table public.shared_note_members (
  note_id     uuid not null references public.shared_notes (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Shown to the other members, so they know who is in the note.
  email       text not null check (length(email) < 320),
  role        text not null check (role in ('owner', 'edit', 'view')),
  -- The note key sealed to this member's public key (crypto_box_seal).
  wrapped_key text not null check (length(wrapped_key) < 512),
  created_at  timestamptz not null default now(),
  primary key (note_id, user_id)
);
create index shared_note_members_user on public.shared_note_members (user_id);

-- The caller's role in a shared note, or null. Security definer, so the policies below can use it
-- without the members table checking itself.
create or replace function public.shared_role(p_note uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.shared_note_members where note_id = p_note and user_id = auth.uid()
$$;

alter table public.shared_notes enable row level security;
alter table public.shared_note_members enable row level security;
create policy "shared_notes: members read" on public.shared_notes
  for select to authenticated using (public.shared_role(id) is not null);
create policy "shared_note_members: members read" on public.shared_note_members
  for select to authenticated using (public.shared_role(note_id) is not null);
revoke all on public.shared_notes, public.shared_note_members from anon;
revoke insert, update, delete, truncate on public.shared_notes, public.shared_note_members
  from authenticated;

-- ── Finding people ───────────────────────────────────────────────────────────
-- The account and public key behind an email, to seal the note key to it. Signed-in users only;
-- it does tell whether an email has an account, like any "invite by email".
create or replace function public.find_user_key(p_email text)
returns table (user_id uuid, public_key text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, k.public_key
    from auth.users u join public.user_keys k on k.user_id = u.id
   where auth.uid() is not null and lower(u.email) = lower(trim(p_email))
   limit 1
$$;

-- ── Writes ───────────────────────────────────────────────────────────────────

-- Shares one of the caller's notes (again: returns the existing one). The caller becomes its owner.
create or replace function public.share_note(p_origin uuid, p_wrapped_key text, p_state text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into v_id from public.shared_notes where owner_id = auth.uid() and origin_note_id = p_origin;
  if v_id is not null then return v_id; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.shared_notes (owner_id, origin_note_id, state, version)
    values (auth.uid(), p_origin, p_state, case when p_state is null then 0 else 1 end)
    returning id into v_id;
  insert into public.shared_note_members (note_id, user_id, email, role, wrapped_key)
    values (v_id, auth.uid(), coalesce(v_email, ''), 'owner', p_wrapped_key);
  return v_id;
end $$;

-- Owner: adds a person (or changes their role and key).
create or replace function public.add_shared_member(
  p_note uuid, p_user uuid, p_role text, p_wrapped_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if public.shared_role(p_note) is distinct from 'owner' then raise exception 'not the owner'; end if;
  if p_role not in ('edit', 'view') then raise exception 'bad role'; end if;
  if p_user = auth.uid() then raise exception 'already the owner'; end if;
  select email into v_email from auth.users where id = p_user;
  if v_email is null then raise exception 'no such user'; end if;
  insert into public.shared_note_members (note_id, user_id, email, role, wrapped_key)
    values (p_note, p_user, v_email, p_role, p_wrapped_key)
    on conflict (note_id, user_id) do update set role = excluded.role, wrapped_key = excluded.wrapped_key;
end $$;

-- Owner: changes someone's role.
create or replace function public.set_shared_role(p_note uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.shared_role(p_note) is distinct from 'owner' then raise exception 'not the owner'; end if;
  if p_role not in ('edit', 'view') then raise exception 'bad role'; end if;
  update public.shared_note_members set role = p_role
   where note_id = p_note and user_id = p_user and role <> 'owner';
end $$;

-- Owner: removes someone. Anyone else: leaves (removes themselves).
create or replace function public.remove_shared_member(p_note uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.shared_role(p_note);
begin
  if v_role is null then raise exception 'not a member'; end if;
  if v_role <> 'owner' and p_user <> auth.uid() then raise exception 'not the owner'; end if;
  delete from public.shared_note_members where note_id = p_note and user_id = p_user and role <> 'owner';
end $$;

-- Owner: stops sharing; everyone else loses the note.
create or replace function public.unshare_note(p_note uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.shared_role(p_note) is distinct from 'owner' then raise exception 'not the owner'; end if;
  delete from public.shared_notes where id = p_note;
end $$;

-- Owner and editors: stores the merged Yjs state if nobody saved since `p_base_version`.
-- Result: {"ok": true, "version": n} or {"ok": false, "version": n, "state": "..."} to merge and retry.
create or replace function public.save_shared_state(p_note uuid, p_state text, p_base_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.shared_notes;
begin
  -- coalesce: a non-member's role is null, and `null not in (...)` would let them through.
  if coalesce(public.shared_role(p_note), '') not in ('owner', 'edit') then
    raise exception 'read only';
  end if;
  update public.shared_notes set state = p_state, version = version + 1, updated_at = now()
   where id = p_note and version = p_base_version
   returning * into v_row;
  if found then return jsonb_build_object('ok', true, 'version', v_row.version); end if;
  select * into v_row from public.shared_notes where id = p_note;
  return jsonb_build_object('ok', false, 'version', v_row.version, 'state', v_row.state);
end $$;

revoke execute on function public.find_user_key(text), public.share_note(uuid, text, text),
  public.add_shared_member(uuid, uuid, text, text), public.set_shared_role(uuid, uuid, text),
  public.remove_shared_member(uuid, uuid), public.unshare_note(uuid),
  public.save_shared_state(uuid, text, integer), public.shared_role(uuid)
  from anon, public;
grant execute on function public.find_user_key(text), public.share_note(uuid, text, text),
  public.add_shared_member(uuid, uuid, text, text), public.set_shared_role(uuid, uuid, text),
  public.remove_shared_member(uuid, uuid), public.unshare_note(uuid),
  public.save_shared_state(uuid, text, integer), public.shared_role(uuid)
  to authenticated;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- New shares and saved states reach members right away.
alter publication supabase_realtime add table public.shared_notes, public.shared_note_members;

-- Live editing: private channels "shared:<note id>". Members listen; owner and editors send.
create or replace function public.shared_role_by_topic(p_topic text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_topic ~ '^shared:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.shared_role(substring(p_topic from 8)::uuid)
  end
$$;
revoke execute on function public.shared_role_by_topic(text) from anon, public;
grant execute on function public.shared_role_by_topic(text) to authenticated;

create policy "shared notes: members listen" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast'
         and public.shared_role_by_topic(realtime.topic()) is not null);
create policy "shared notes: editors send" on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension = 'broadcast'
              and public.shared_role_by_topic(realtime.topic()) in ('owner', 'edit'));
