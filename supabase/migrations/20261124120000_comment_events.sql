-- Unread comment & @mention notifications for shared notes.
-- Comment text itself lives inside the note's E2EE Yjs document (`comments` Y.Map); this table
-- stores only delivery metadata (who commented, in which shared note & thread, and whether the
-- recipient was @mentioned) so clients can show unread badges and jump straight to the thread.

create table public.comment_events (
  id             uuid primary key default gen_random_uuid(),
  shared_note_id uuid not null references public.shared_notes (id) on delete cascade,
  thread_id      text not null check (length(thread_id) between 1 and 128),
  actor_id       uuid not null references auth.users (id) on delete cascade,
  actor_email    text not null default '' check (length(actor_email) < 320),
  recipient_id   uuid not null references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('comment', 'reply', 'mention')),
  created_at     timestamptz not null default now(),
  read_at        timestamptz
);

create index comment_events_recipient_unread
  on public.comment_events (recipient_id, created_at desc)
  where read_at is null;

alter table public.comment_events enable row level security;
revoke all on public.comment_events from anon;
revoke insert, update, delete, truncate on public.comment_events from authenticated;

create policy "comment_events: own" on public.comment_events
  for select to authenticated
  using (recipient_id = auth.uid());

create policy "no oauth clients" on public.comment_events
  as restrictive for all to authenticated
  using (not public.is_oauth_client())
  with check (not public.is_oauth_client());

-- Owner and editors: notify other accepted members of a new comment or reply.
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
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce(public.shared_active_role(p_note), '') not in ('owner', 'edit') then
    raise exception 'read only';
  end if;
  select folder_id, deleted_at into v_folder, v_deleted from public.shared_notes where id = p_note;
  if not found or v_deleted is not null then raise exception 'deleted'; end if;
  select coalesce(email, '') into v_email from auth.users where id = auth.uid();

  with recipients as (
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
  ),
  inserted as (
    insert into public.comment_events
      (shared_note_id, thread_id, actor_id, actor_email, recipient_id, kind)
    select
      p_note,
      p_thread,
      auth.uid(),
      v_email,
      r.u,
      case
        when r.u = any(coalesce(p_mentions, '{}'::uuid[])) then 'mention'
        when p_is_reply then 'reply'
        else 'comment'
      end
    from recipients r
    returning recipient_id
  )
  insert into public.sync_pulses (user_id, at)
  select distinct recipient_id, now() from inserted
  on conflict (user_id) do update set at = excluded.at;
end $$;

-- Any recipient: mark their unread comment notifications as read (all, per note, or per thread).
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
