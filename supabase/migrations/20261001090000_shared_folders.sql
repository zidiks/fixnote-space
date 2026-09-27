-- Shared folders, and invitations that expire (docs/CONCEPT.md, "Совместная правка").
--
-- A shared folder gives its members every note in it (its subfolders too, flattened for them). The
-- server keeps the folder's name sealed with the folder key, and each member gets that key sealed
-- to their public key, as with notes. A note in a shared folder is a shared note whose key is
-- sealed with the folder key (`folder_key`), so members need no row per note. Owner and editors
-- add notes and delete them for everyone; a deleted note stays as a tombstone (`deleted_at`) so
-- every device knows to delete it. A person's access to a note is the stronger of their own
-- membership and their folder's.
--
-- Invitations (to notes and folders) expire 30 days after they were sent: they can no longer be
-- accepted, and the app stops showing them. Inviting again starts the 30 days again.

-- ── Invitations expire ───────────────────────────────────────────────────────

alter table public.shared_note_members add column invited_at timestamptz not null default now();
update public.shared_note_members set invited_at = created_at;

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
    on conflict (note_id, user_id) do update set role = excluded.role,
      wrapped_key = excluded.wrapped_key,
      -- Inviting again someone who has not answered sends a fresh invitation.
      invited_at = case when shared_note_members.accepted then shared_note_members.invited_at
                        else now() end;
end $$;

create or replace function public.accept_shared_note(p_note uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shared_note_members set accepted = true
   where note_id = p_note and user_id = auth.uid()
     and (accepted or invited_at > now() - interval '30 days');
  if not found then raise exception 'not invited'; end if;
end $$;

-- ── Shared folders ───────────────────────────────────────────────────────────

create table public.shared_folders (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The owner's own folder, so the owner's devices link it back.
  origin_folder_id uuid not null,
  -- The folder's name, sealed with the folder key.
  name             text not null check (length(name) < 2048),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (owner_id, origin_folder_id)
);

create table public.shared_folder_members (
  folder_id   uuid not null references public.shared_folders (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  email       text not null check (length(email) < 320),
  role        text not null check (role in ('owner', 'edit', 'view')),
  -- The folder key sealed to this member's public key (crypto_box_seal).
  wrapped_key text not null check (length(wrapped_key) < 512),
  accepted    boolean not null default false,
  invited_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  primary key (folder_id, user_id)
);
create index shared_folder_members_user on public.shared_folder_members (user_id);

alter table public.shared_notes
  add column folder_id  uuid references public.shared_folders (id) on delete set null,
  -- The note key sealed with the folder key (only for notes in a shared folder).
  add column folder_key text check (length(folder_key) < 512),
  add column created_by uuid default auth.uid(),
  add column deleted_at timestamptz;
create index shared_notes_folder on public.shared_notes (folder_id);

-- The caller's role in a shared folder (accepted or not), or null.
create or replace function public.shared_folder_role(p_folder uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.shared_folder_members where folder_id = p_folder and user_id = auth.uid()
$$;

-- The caller's role in a shared folder they accepted, or null.
create or replace function public.shared_folder_active_role(p_folder uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.shared_folder_members
   where folder_id = p_folder and user_id = auth.uid() and accepted
$$;

-- The stronger of two roles.
create or replace function public.stronger_role(a text, b text)
returns text
language sql
immutable
as $$
  select case
    when a = 'owner' or b = 'owner' then 'owner'
    when a = 'edit' or b = 'edit' then 'edit'
    else coalesce(a, b)
  end
$$;

-- A note: the caller's own membership (even not yet accepted, so an invitation can be read) or
-- their accepted folder's.
create or replace function public.shared_role(p_note uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.stronger_role(
    (select role from public.shared_note_members where note_id = p_note and user_id = auth.uid()),
    (select public.shared_folder_active_role(n.folder_id)
       from public.shared_notes n where n.id = p_note))
$$;

-- A note, accepted memberships only: what saving and the live channel need.
create or replace function public.shared_active_role(p_note uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.stronger_role(
    (select role from public.shared_note_members
      where note_id = p_note and user_id = auth.uid() and accepted),
    (select public.shared_folder_active_role(n.folder_id)
       from public.shared_notes n where n.id = p_note))
$$;

alter table public.shared_folders enable row level security;
alter table public.shared_folder_members enable row level security;
create policy "shared_folders: members read" on public.shared_folders
  for select to authenticated using (public.shared_folder_role(id) is not null);
create policy "shared_folder_members: members read" on public.shared_folder_members
  for select to authenticated using (public.shared_folder_role(folder_id) is not null);
revoke all on public.shared_folders, public.shared_folder_members from anon;
revoke insert, update, delete, truncate on public.shared_folders, public.shared_folder_members
  from authenticated;

-- Shares one of the caller's folders (again: returns the existing one).
create or replace function public.share_folder(p_origin uuid, p_wrapped_key text, p_name text)
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
  select id into v_id from public.shared_folders
   where owner_id = auth.uid() and origin_folder_id = p_origin;
  if v_id is not null then return v_id; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.shared_folders (owner_id, origin_folder_id, name)
    values (auth.uid(), p_origin, p_name)
    returning id into v_id;
  insert into public.shared_folder_members (folder_id, user_id, email, role, wrapped_key, accepted)
    values (v_id, auth.uid(), coalesce(v_email, ''), 'owner', p_wrapped_key, true);
  return v_id;
end $$;

-- Owner: renames it (the name sealed again).
create or replace function public.rename_shared_folder(p_folder uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.shared_folder_role(p_folder) is distinct from 'owner' then
    raise exception 'not the owner';
  end if;
  update public.shared_folders set name = p_name, updated_at = now() where id = p_folder;
end $$;

-- Owner: invites a person (or changes their role and key).
create or replace function public.add_folder_member(
  p_folder uuid, p_user uuid, p_role text, p_wrapped_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if public.shared_folder_role(p_folder) is distinct from 'owner' then
    raise exception 'not the owner';
  end if;
  if p_role not in ('edit', 'view') then raise exception 'bad role'; end if;
  if p_user = auth.uid() then raise exception 'already the owner'; end if;
  select email into v_email from auth.users where id = p_user;
  if v_email is null then raise exception 'no such user'; end if;
  insert into public.shared_folder_members (folder_id, user_id, email, role, wrapped_key)
    values (p_folder, p_user, v_email, p_role, p_wrapped_key)
    on conflict (folder_id, user_id) do update set role = excluded.role,
      wrapped_key = excluded.wrapped_key,
      invited_at = case when shared_folder_members.accepted then shared_folder_members.invited_at
                        else now() end;
end $$;

create or replace function public.set_folder_role(p_folder uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.shared_folder_role(p_folder) is distinct from 'owner' then
    raise exception 'not the owner';
  end if;
  if p_role not in ('edit', 'view') then raise exception 'bad role'; end if;
  update public.shared_folder_members set role = p_role
   where folder_id = p_folder and user_id = p_user and role <> 'owner';
end $$;

-- Owner: removes someone. Anyone else: leaves (or declines the invitation).
create or replace function public.remove_folder_member(p_folder uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.shared_folder_role(p_folder);
begin
  if v_role is null then raise exception 'not a member'; end if;
  if v_role <> 'owner' and p_user <> auth.uid() then raise exception 'not the owner'; end if;
  delete from public.shared_folder_members
   where folder_id = p_folder and user_id = p_user and role <> 'owner';
end $$;

create or replace function public.accept_shared_folder(p_folder uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shared_folder_members set accepted = true
   where folder_id = p_folder and user_id = auth.uid()
     and (accepted or invited_at > now() - interval '30 days');
  if not found then raise exception 'not invited'; end if;
end $$;

-- Owner: stops sharing. Notes that were shared only through the folder go with it (the owner's
-- devices keep them as personal notes); notes also shared on their own stay shared.
create or replace function public.unshare_folder(p_folder uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.shared_folder_role(p_folder) is distinct from 'owner' then
    raise exception 'not the owner';
  end if;
  delete from public.shared_notes n
   where n.folder_id = p_folder
     and not exists (select 1 from public.shared_note_members m where m.note_id = n.id);
  delete from public.shared_folders where id = p_folder;
end $$;

-- Owner and editors: a note of theirs joins the folder. The folder's owner owns it on the server.
create or replace function public.share_note_in_folder(
  p_folder uuid, p_origin uuid, p_folder_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_owner uuid;
begin
  if coalesce(public.shared_folder_active_role(p_folder), '') not in ('owner', 'edit') then
    raise exception 'read only';
  end if;
  select owner_id into v_owner from public.shared_folders where id = p_folder;
  select id into v_id from public.shared_notes
   where owner_id = v_owner and origin_note_id = p_origin and folder_id = p_folder
     and deleted_at is null;
  if v_id is not null then return v_id; end if;
  insert into public.shared_notes (owner_id, origin_note_id, folder_id, folder_key, created_by)
    values (v_owner, p_origin, p_folder, p_folder_key, auth.uid())
    returning id into v_id;
  return v_id;
end $$;

-- The owner of both: a note already shared on its own joins the folder too.
create or replace function public.attach_note_to_folder(
  p_note uuid, p_folder uuid, p_folder_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select role from public.shared_note_members where note_id = p_note and user_id = auth.uid())
       is distinct from 'owner'
     or public.shared_folder_active_role(p_folder) is distinct from 'owner' then
    raise exception 'not the owner';
  end if;
  update public.shared_notes set folder_id = p_folder, folder_key = p_folder_key where id = p_note;
end $$;

-- The folder's owner moved a note out of it: members lose it (unless shared with them on its own).
create or replace function public.remove_note_from_folder(p_note uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folder uuid;
begin
  select folder_id into v_folder from public.shared_notes where id = p_note;
  if v_folder is null or public.shared_folder_active_role(v_folder) is distinct from 'owner' then
    raise exception 'not the owner';
  end if;
  if exists (select 1 from public.shared_note_members where note_id = p_note) then
    update public.shared_notes set folder_id = null, folder_key = null where id = p_note;
  else
    delete from public.shared_notes where id = p_note;
  end if;
end $$;

-- Owner and editors: deletes a note of the folder for everyone (kept as a tombstone).
create or replace function public.delete_folder_note(p_note uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folder uuid;
begin
  select folder_id into v_folder from public.shared_notes where id = p_note;
  if v_folder is null
     or coalesce(public.shared_folder_active_role(v_folder), '') not in ('owner', 'edit') then
    raise exception 'read only';
  end if;
  update public.shared_notes set deleted_at = now(), state = null, updated_at = now()
   where id = p_note and deleted_at is null;
end $$;

-- A deleted note takes no more saves.
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
  if coalesce(public.shared_active_role(p_note), '') not in ('owner', 'edit') then
    raise exception 'read only';
  end if;
  update public.shared_notes set state = p_state, version = version + 1, updated_at = now()
   where id = p_note and version = p_base_version and deleted_at is null
   returning * into v_row;
  if found then return jsonb_build_object('ok', true, 'version', v_row.version); end if;
  select * into v_row from public.shared_notes where id = p_note;
  if v_row.deleted_at is not null then raise exception 'deleted'; end if;
  return jsonb_build_object('ok', false, 'version', v_row.version, 'state', v_row.state);
end $$;

revoke execute on function public.shared_folder_role(uuid), public.shared_folder_active_role(uuid),
  public.share_folder(uuid, text, text), public.rename_shared_folder(uuid, text),
  public.add_folder_member(uuid, uuid, text, text), public.set_folder_role(uuid, uuid, text),
  public.remove_folder_member(uuid, uuid), public.accept_shared_folder(uuid),
  public.unshare_folder(uuid), public.share_note_in_folder(uuid, uuid, text),
  public.attach_note_to_folder(uuid, uuid, text), public.remove_note_from_folder(uuid),
  public.delete_folder_note(uuid)
  from anon, public;
grant execute on function public.shared_folder_role(uuid), public.shared_folder_active_role(uuid),
  public.share_folder(uuid, text, text), public.rename_shared_folder(uuid, text),
  public.add_folder_member(uuid, uuid, text, text), public.set_folder_role(uuid, uuid, text),
  public.remove_folder_member(uuid, uuid), public.accept_shared_folder(uuid),
  public.unshare_folder(uuid), public.share_note_in_folder(uuid, uuid, text),
  public.attach_note_to_folder(uuid, uuid, text), public.remove_note_from_folder(uuid),
  public.delete_folder_note(uuid)
  to authenticated;

-- Members hear about new members, renames and new notes right away.
alter publication supabase_realtime add table public.shared_folders, public.shared_folder_members;
