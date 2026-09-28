-- A shared folder's subfolders reach its members (docs/CONCEPT.md, "Совместная правка").
-- The layout (subfolders, their names and parents, and which subfolder each note is in) is a Yjs
-- document sealed with the folder key, saved like a shared note: optimistic by version, and a
-- client that lost the race merges and saves again. The server never reads it.

alter table public.shared_folders
  add column layout text check (length(layout) < 2 * 1024 * 1024),
  add column layout_version integer not null default 0;

-- Owner and editors: stores the merged layout if nobody saved since `p_base_version`.
-- Result: {"ok": true, "version": n} or {"ok": false, "version": n, "state": "..."} to merge and retry.
create or replace function public.save_folder_layout(
  p_folder uuid, p_layout text, p_base_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.shared_folders;
begin
  if coalesce(public.shared_folder_active_role(p_folder), '') not in ('owner', 'edit') then
    raise exception 'read only';
  end if;
  update public.shared_folders
     set layout = p_layout, layout_version = layout_version + 1, updated_at = now()
   where id = p_folder and layout_version = p_base_version
   returning * into v_row;
  if found then return jsonb_build_object('ok', true, 'version', v_row.layout_version); end if;
  select * into v_row from public.shared_folders where id = p_folder;
  return jsonb_build_object('ok', false, 'version', v_row.layout_version, 'state', v_row.layout);
end $$;

revoke execute on function public.save_folder_layout(uuid, text, integer) from anon, public;
grant execute on function public.save_folder_layout(uuid, text, integer) to authenticated;
