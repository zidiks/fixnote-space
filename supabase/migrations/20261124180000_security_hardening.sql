-- Security hardening (Wave 1 & Wave 3):
-- 1. `share_note_in_folder`: prevent non-owner folder editors from hijacking, moving or wiping
--    existing `shared_notes` rows (standalone or from other folders), and block OAuth clients.
-- 2. `notify_comment` / `mark_comments_read`: block OAuth clients (defense in depth), deduplicate
--    unread `(shared_note_id, thread_id, recipient_id)` notifications (upgrading to 'mention' when
--    applicable), and enforce a per-caller rate limit (30 events/min) before inserting and pulsing.
-- 3. `sync_pulses`: explicitly revoke write privileges from `anon` and `authenticated`.

-- ── 1. share_note_in_folder ──────────────────────────────────────────────────

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
  if public.is_oauth_client() then
    raise exception 'forbidden';
  end if;
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if coalesce(public.shared_folder_active_role(p_folder), '') not in ('owner', 'edit') then
    raise exception 'read only';
  end if;
  select owner_id into v_owner from public.shared_folders where id = p_folder;
  if not found then
    raise exception 'not found';
  end if;
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
  -- Existing row outside this folder or tombstoned: only the folder owner may re-home or reset it.
  -- An editor may only restore a tombstoned note that they themselves created in this same folder
  -- and that has no direct note memberships.
  if auth.uid() is distinct from v_owner
     and not (
       v_row.deleted_at is not null
       and v_row.folder_id = p_folder
       and v_row.created_by = auth.uid()
       and not exists (select 1 from public.shared_note_members m where m.note_id = v_row.id)
     ) then
    raise exception 'forbidden';
  end if;
  if v_row.deleted_at is null and (
       (v_row.folder_id is not null
          and public.shared_folder_active_role(v_row.folder_id) is distinct from 'owner')
       or exists (select 1 from public.shared_note_members m
                   where m.note_id = v_row.id and m.role <> 'owner')) then
    raise exception 'already shared';
  end if;
  if auth.uid() = v_owner then
    delete from public.shared_note_members where note_id = v_row.id;
  end if;
  update public.shared_notes
     set folder_id = p_folder, folder_key = p_folder_key, deleted_at = null, state = null,
         version = 0, created_by = auth.uid(), updated_at = now()
   where id = v_row.id;
  return v_row.id;
end $$;

revoke execute on function public.share_note_in_folder(uuid, uuid, text) from anon, public;
grant execute on function public.share_note_in_folder(uuid, uuid, text) to authenticated;

-- ── 2. comment_events rate-limit, deduplication & OAuth guard ────────────────

create index if not exists comment_events_actor_recent
  on public.comment_events (actor_id, created_at desc);

create index if not exists comment_events_unread_lookup
  on public.comment_events (shared_note_id, thread_id, recipient_id)
  where read_at is null;

create or replace function public.notify_comment(
  p_note uuid,
  p_thread text,
  p_mentions uuid[] default '{}',
  p_is_reply boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folder uuid;
  v_deleted timestamptz;
  v_email text;
  v_recent integer;
begin
  if public.is_oauth_client() then raise exception 'forbidden'; end if;
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce(public.shared_active_role(p_note), '') not in ('owner', 'edit') then
    raise exception 'read only';
  end if;
  select folder_id, deleted_at into v_folder, v_deleted from public.shared_notes where id = p_note;
  if not found or v_deleted is not null then raise exception 'deleted'; end if;

  select count(*) into v_recent
    from public.comment_events
   where actor_id = auth.uid()
     and created_at > now() - interval '1 minute';
  if v_recent >= 30 then
    raise exception 'rate limited' using errcode = 'P0001';
  end if;

  select coalesce(email, '') into v_email from auth.users where id = auth.uid();

  with recipients as (
    select
      u,
      case
        when u = any(coalesce(p_mentions, '{}'::uuid[])) then 'mention'
        when p_is_reply then 'reply'
        else 'comment'
      end as kind
    from (
      select distinct u from (
        select m.user_id as u
          from public.shared_note_members m
         where m.note_id = p_note and m.accepted
        union all
        select fm.user_id as u
          from public.shared_folder_members fm
         where v_folder is not null and fm.folder_id = v_folder and fm.accepted
      ) s
      where u is not null and u <> auth.uid()
    ) d
  ),
  upgraded as (
    update public.comment_events ce
       set kind = 'mention',
           actor_id = auth.uid(),
           actor_email = v_email,
           created_at = now()
      from recipients r
     where ce.shared_note_id = p_note
       and ce.thread_id = p_thread
       and ce.recipient_id = r.u
       and ce.read_at is null
       and r.kind = 'mention'
       and ce.kind <> 'mention'
    returning ce.recipient_id
  ),
  inserted as (
    insert into public.comment_events
      (shared_note_id, thread_id, actor_id, actor_email, recipient_id, kind)
    select p_note, p_thread, auth.uid(), v_email, r.u, r.kind
      from recipients r
     where not exists (
       select 1 from public.comment_events ce
        where ce.shared_note_id = p_note
          and ce.thread_id = p_thread
          and ce.recipient_id = r.u
          and ce.read_at is null
     )
    returning recipient_id
  ),
  pulsed as (
    select recipient_id from inserted
    union
    select recipient_id from upgraded
  )
  insert into public.sync_pulses (user_id, at)
  select distinct recipient_id, now() from pulsed
  on conflict (user_id) do update set at = excluded.at;
end $$;

create or replace function public.mark_comments_read(
  p_note uuid default null,
  p_thread text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_oauth_client() then raise exception 'forbidden'; end if;
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.comment_events
     set read_at = now()
   where recipient_id = auth.uid()
     and read_at is null
     and (p_note is null or shared_note_id = p_note)
     and (p_thread is null or thread_id = p_thread);
  if found then
    insert into public.sync_pulses (user_id, at)
    values (auth.uid(), now())
    on conflict (user_id) do update set at = excluded.at;
  end if;
end $$;

revoke execute on function
  public.notify_comment(uuid, text, uuid[], boolean),
  public.mark_comments_read(uuid, text)
  from anon, public;

grant execute on function
  public.notify_comment(uuid, text, uuid[], boolean),
  public.mark_comments_read(uuid, text)
  to authenticated;

-- ── 3. sync_pulses write privileges ──────────────────────────────────────────

revoke all on public.sync_pulses from anon;
revoke insert, update, delete, truncate on public.sync_pulses from anon, authenticated;
