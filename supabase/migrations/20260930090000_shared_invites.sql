-- Shared notes are invitations until accepted (docs/CONCEPT.md, "Совместная правка"): an invited
-- person sees who invites them and to what, and the note joins their notes only when they accept.
-- Until then they may read the invitation (their row, the members, the sealed state for its title)
-- but not save or join the live channel. Declining is leaving (remove_shared_member on oneself).

alter table public.shared_note_members add column accepted boolean not null default false;
-- Everyone already in a note joined it before invitations existed.
update public.shared_note_members set accepted = true;

-- The caller's role in a shared note they accepted, or null.
create or replace function public.shared_active_role(p_note uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.shared_note_members
   where note_id = p_note and user_id = auth.uid() and accepted
$$;
revoke execute on function public.shared_active_role(uuid) from anon, public;
grant execute on function public.shared_active_role(uuid) to authenticated;

-- The owner is in from the start.
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
  insert into public.shared_note_members (note_id, user_id, email, role, wrapped_key, accepted)
    values (v_id, auth.uid(), coalesce(v_email, ''), 'owner', p_wrapped_key, true);
  return v_id;
end $$;

-- The invited person accepts.
create or replace function public.accept_shared_note(p_note uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shared_note_members set accepted = true
   where note_id = p_note and user_id = auth.uid();
  if not found then raise exception 'not invited'; end if;
end $$;
revoke execute on function public.accept_shared_note(uuid) from anon, public;
grant execute on function public.accept_shared_note(uuid) to authenticated;

-- Saving needs an accepted membership.
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
   where id = p_note and version = p_base_version
   returning * into v_row;
  if found then return jsonb_build_object('ok', true, 'version', v_row.version); end if;
  select * into v_row from public.shared_notes where id = p_note;
  return jsonb_build_object('ok', false, 'version', v_row.version, 'state', v_row.state);
end $$;

-- The live channel, too (the realtime.messages policies call this).
create or replace function public.shared_role_by_topic(p_topic text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_topic ~ '^shared:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.shared_active_role(substring(p_topic from 8)::uuid)
  end
$$;
