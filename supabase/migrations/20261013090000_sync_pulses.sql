-- Realtime sent every saved shared note and folder to each member as a whole row, sealed Yjs
-- document included, and each device then synced (fetching the documents again). That was most
-- of the project's egress. Now a save only touches a tiny row per member (`sync_pulses`), which
-- is what devices listen to; a sync then fetches a document only when its version moved.

create table public.sync_pulses (
  user_id uuid primary key references auth.users (id) on delete cascade,
  at      timestamptz not null default now()
);

alter table public.sync_pulses enable row level security;

create policy "sync_pulses: own" on public.sync_pulses
  for select using (user_id = auth.uid());

-- Everyone a shared note concerns: its owner, its members, and the members of its folder.
create or replace function public.pulse_shared_note(p_note uuid, p_owner uuid, p_folder uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.sync_pulses (user_id, at)
  select distinct u, now() from (
    select p_owner as u
    union all select m.user_id from public.shared_note_members m where m.note_id = p_note
    union all select fm.user_id from public.shared_folder_members fm where fm.folder_id = p_folder
    union all select f.owner_id from public.shared_folders f where f.id = p_folder
  ) s
  where u is not null
  on conflict (user_id) do update set at = excluded.at;
$$;

create or replace function public.shared_notes_pulse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then
    perform public.pulse_shared_note(old.id, old.owner_id, old.folder_id);
  end if;
  -- A note that moved between folders concerns the members of both.
  if tg_op <> 'DELETE'
     and (tg_op = 'INSERT' or new.folder_id is distinct from old.folder_id) then
    perform public.pulse_shared_note(new.id, new.owner_id, new.folder_id);
  end if;
  return null;
end $$;

create trigger shared_notes_pulse
  after insert or update or delete on public.shared_notes
  for each row execute function public.shared_notes_pulse();

create or replace function public.shared_folders_pulse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folder public.shared_folders := coalesce(new, old);
begin
  insert into public.sync_pulses (user_id, at)
  select distinct u, now() from (
    select v_folder.owner_id as u
    union all select m.user_id from public.shared_folder_members m where m.folder_id = v_folder.id
  ) s
  where u is not null
  on conflict (user_id) do update set at = excluded.at;
  return null;
end $$;

create trigger shared_folders_pulse
  after insert or update or delete on public.shared_folders
  for each row execute function public.shared_folders_pulse();

-- Devices listen to the pulses; the heavy rows no longer go out over Realtime.
alter publication supabase_realtime drop table public.shared_notes, public.shared_folders;
alter publication supabase_realtime add table public.sync_pulses;
