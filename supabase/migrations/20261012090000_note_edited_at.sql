-- When a note's text last changed. updated_at moves with any change (a move, a delete, a pin), so a
-- device that only had updated_at showed a moved or synced note as just edited. edited_at is what
-- the apps show and sort by; like the other dates it says nothing about the text itself.
-- push_note takes it; a push from an older app that does not send it keeps the old behaviour (the
-- text's time is the update's time).

alter table public.notes add column edited_at bigint;
update public.notes set edited_at = updated_at where edited_at is null;

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
  edited bigint := coalesce((p_row ->> 'edited_at')::bigint, (p_row ->> 'updated_at')::bigint);
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into cur from public.notes where id = note_id for update;

  if not found then
    insert into public.notes (id, user_id, folder_id, type, daily_date, wrapped_key, ciphertext,
                              created_at, updated_at, edited_at, deleted_at, pinned_at,
                              pin_updated_at, version)
    values (note_id, uid, (p_row ->> 'folder_id')::uuid, p_row ->> 'type', p_row ->> 'daily_date',
            p_row ->> 'wrapped_key', p_row ->> 'ciphertext', (p_row ->> 'created_at')::bigint,
            (p_row ->> 'updated_at')::bigint, edited, (p_row ->> 'deleted_at')::bigint,
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
    edited_at = edited,
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
