-- FixNote sync schema. The server stores only ciphertext and the metadata needed to route it;
-- see docs/CONCEPT.md section 6.3. Clients read their rows directly (RLS) and write only through
-- push_note / push_folder, which enforce optimistic concurrency and stamp the pull cursor (seq).

create sequence if not exists public.sync_seq;

-- ── Account keys ─────────────────────────────────────────────────────────────
-- public_key: X25519 key for capture channels (e.g. the Telegram bot seals messages to it).
-- key_check:  a constant sealed with a key derived from the recovery phrase; lets a new device
--             tell a right phrase from a wrong one without the server learning anything.
create table public.user_keys (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  public_key text not null check (length(public_key) between 40 and 64),
  key_check  text not null check (length(key_check) < 512),
  created_at timestamptz not null default now()
);

alter table public.user_keys enable row level security;
create policy "user_keys: read own" on public.user_keys
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_keys: create own" on public.user_keys
  for insert to authenticated with check (user_id = (select auth.uid()));
revoke all on public.user_keys from anon;
revoke update, delete on public.user_keys from authenticated;

-- ── Folders ──────────────────────────────────────────────────────────────────
create table public.folders (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id   uuid,
  name_sealed text not null check (length(name_sealed) < 4096),
  sort        double precision not null default 0,
  created_at  bigint not null,
  updated_at  bigint not null,
  deleted_at  bigint,
  version     integer not null default 1,
  seq         bigint not null default nextval('public.sync_seq'),
  server_updated_at timestamptz not null default now()
);
create index folders_user_seq on public.folders (user_id, seq);

-- ── Notes ────────────────────────────────────────────────────────────────────
create table public.notes (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id   uuid,
  type        text not null check (type in ('text', 'daily')),
  daily_date  text check (daily_date ~ '^\d{4}-\d{2}-\d{2}$'),
  wrapped_key text not null check (length(wrapped_key) < 512),
  ciphertext  text not null check (length(ciphertext) < 4 * 1024 * 1024),
  created_at  bigint not null,
  updated_at  bigint not null,
  deleted_at  bigint,
  version     integer not null default 1,
  seq         bigint not null default nextval('public.sync_seq'),
  server_updated_at timestamptz not null default now()
);
create index notes_user_seq on public.notes (user_id, seq);

alter table public.folders enable row level security;
alter table public.notes enable row level security;
create policy "folders: read own" on public.folders
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notes: read own" on public.notes
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.folders, public.notes from anon;
revoke insert, update, delete, truncate on public.folders, public.notes from authenticated;

-- ── Writes ───────────────────────────────────────────────────────────────────
-- Result: {"ok": true, "version": n, "seq": n} or {"ok": false, "current": <row>} on a stale base.

create or replace function public.push_note(p_row jsonb, p_base_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  note_id uuid := (p_row ->> 'id')::uuid;
  cur public.notes;
  res public.notes;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into cur from public.notes where id = note_id for update;

  if not found then
    insert into public.notes (id, user_id, folder_id, type, daily_date, wrapped_key, ciphertext,
                              created_at, updated_at, deleted_at, version)
    values (note_id, uid, (p_row ->> 'folder_id')::uuid, p_row ->> 'type', p_row ->> 'daily_date',
            p_row ->> 'wrapped_key', p_row ->> 'ciphertext', (p_row ->> 'created_at')::bigint,
            (p_row ->> 'updated_at')::bigint, (p_row ->> 'deleted_at')::bigint, p_base_version + 1)
    returning * into res;
    return jsonb_build_object('ok', true, 'version', res.version, 'seq', res.seq);
  end if;

  if cur.user_id <> uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if cur.version <> p_base_version then
    return jsonb_build_object('ok', false, 'current', to_jsonb(cur) - 'user_id');
  end if;

  update public.notes set
    folder_id = (p_row ->> 'folder_id')::uuid,
    type = p_row ->> 'type',
    daily_date = p_row ->> 'daily_date',
    wrapped_key = p_row ->> 'wrapped_key',
    ciphertext = p_row ->> 'ciphertext',
    updated_at = (p_row ->> 'updated_at')::bigint,
    deleted_at = (p_row ->> 'deleted_at')::bigint,
    version = cur.version + 1,
    seq = nextval('public.sync_seq'),
    server_updated_at = now()
  where id = note_id
  returning * into res;
  return jsonb_build_object('ok', true, 'version', res.version, 'seq', res.seq);
end;
$$;

create or replace function public.push_folder(p_row jsonb, p_base_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  folder_id uuid := (p_row ->> 'id')::uuid;
  cur public.folders;
  res public.folders;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into cur from public.folders where id = folder_id for update;

  if not found then
    insert into public.folders (id, user_id, parent_id, name_sealed, sort, created_at, updated_at,
                                deleted_at, version)
    values (folder_id, uid, (p_row ->> 'parent_id')::uuid, p_row ->> 'name_sealed',
            coalesce((p_row ->> 'sort')::double precision, 0), (p_row ->> 'created_at')::bigint,
            (p_row ->> 'updated_at')::bigint, (p_row ->> 'deleted_at')::bigint, p_base_version + 1)
    returning * into res;
    return jsonb_build_object('ok', true, 'version', res.version, 'seq', res.seq);
  end if;

  if cur.user_id <> uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if cur.version <> p_base_version then
    return jsonb_build_object('ok', false, 'current', to_jsonb(cur) - 'user_id');
  end if;

  update public.folders set
    parent_id = (p_row ->> 'parent_id')::uuid,
    name_sealed = p_row ->> 'name_sealed',
    sort = coalesce((p_row ->> 'sort')::double precision, 0),
    updated_at = (p_row ->> 'updated_at')::bigint,
    deleted_at = (p_row ->> 'deleted_at')::bigint,
    version = cur.version + 1,
    seq = nextval('public.sync_seq'),
    server_updated_at = now()
  where id = folder_id
  returning * into res;
  return jsonb_build_object('ok', true, 'version', res.version, 'seq', res.seq);
end;
$$;

revoke all on function public.push_note(jsonb, integer), public.push_folder(jsonb, integer)
  from public, anon;
grant execute on function public.push_note(jsonb, integer), public.push_folder(jsonb, integer)
  to authenticated;

-- ── Realtime: other devices learn about changes instantly (RLS applies) ──────
alter publication supabase_realtime add table public.notes, public.folders;
