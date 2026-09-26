-- Pinned notes: pinned_at = when the note was pinned (null = not pinned), pin_updated_at = when
-- the pin last changed, so each device keeps the latest pin change. Plain metadata like the dates:
-- it says nothing about the note's text. push_note gains the two fields; a push from an older app
-- that does not send them keeps the pin as it is.

alter table public.notes add column pinned_at bigint, add column pin_updated_at bigint;

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
                              created_at, updated_at, deleted_at, pinned_at, pin_updated_at, version)
    values (note_id, uid, (p_row ->> 'folder_id')::uuid, p_row ->> 'type', p_row ->> 'daily_date',
            p_row ->> 'wrapped_key', p_row ->> 'ciphertext', (p_row ->> 'created_at')::bigint,
            (p_row ->> 'updated_at')::bigint, (p_row ->> 'deleted_at')::bigint,
            (p_row ->> 'pinned_at')::bigint, (p_row ->> 'pin_updated_at')::bigint, p_base_version + 1)
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
    pinned_at = case when p_row ? 'pin_updated_at'
                     then (p_row ->> 'pinned_at')::bigint else cur.pinned_at end,
    pin_updated_at = case when p_row ? 'pin_updated_at'
                          then (p_row ->> 'pin_updated_at')::bigint else cur.pin_updated_at end,
    version = cur.version + 1,
    seq = nextval('public.sync_seq'),
    server_updated_at = now()
  where id = note_id
  returning * into res;
  return jsonb_build_object('ok', true, 'version', res.version, 'seq', res.seq);
end;
$$;
