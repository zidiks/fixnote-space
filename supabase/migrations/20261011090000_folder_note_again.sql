-- A note that comes back into a shared folder (restored after being deleted there, put back after
-- the owner took it out, moved from another of the owner's shared folders) has a server record
-- already: one per owner and origin note. share_note_in_folder looked only in this folder among
-- live notes, tried to add a second record and failed on the unique key, stopping the sync. The
-- record now starts over in this folder (new key, no state yet), unless people still have it on
-- its own or it is in a folder the caller does not own.

create or replace function public.share_note_in_folder(
  p_folder uuid, p_origin uuid, p_folder_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_row public.shared_notes;
begin
  if coalesce(public.shared_folder_active_role(p_folder), '') not in ('owner', 'edit') then
    raise exception 'read only';
  end if;
  select owner_id into v_owner from public.shared_folders where id = p_folder;
  select * into v_row from public.shared_notes
   where owner_id = v_owner and origin_note_id = p_origin
   for update;
  if not found then
    insert into public.shared_notes (owner_id, origin_note_id, folder_id, folder_key, created_by)
      values (v_owner, p_origin, p_folder, p_folder_key, auth.uid())
      returning id into v_row.id;
    return v_row.id;
  end if;
  if v_row.folder_id is not distinct from p_folder and v_row.deleted_at is null then
    return v_row.id;
  end if;
  if v_row.deleted_at is null and (
       (v_row.folder_id is not null
          and public.shared_folder_active_role(v_row.folder_id) is distinct from 'owner')
       or exists (select 1 from public.shared_note_members m
                   where m.note_id = v_row.id and m.role <> 'owner')) then
    raise exception 'already shared';
  end if;
  delete from public.shared_note_members where note_id = v_row.id;
  update public.shared_notes
     set folder_id = p_folder, folder_key = p_folder_key, deleted_at = null, state = null,
         version = 0, created_by = auth.uid(), updated_at = now()
   where id = v_row.id;
  return v_row.id;
end $$;
revoke execute on function public.share_note_in_folder(uuid, uuid, text) from anon, public;
grant execute on function public.share_note_in_folder(uuid, uuid, text) to authenticated;
