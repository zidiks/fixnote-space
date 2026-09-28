-- Files of shared notes (images, attachments), for every member. A shared note's files live at
-- `shared/<shared note id>/<file id>` in the attachments bucket, sealed with the note's key (the
-- app encrypts, the server stores ciphertext). Members read them; the owner and editors add them,
-- and they count against the owner's storage, like the note itself rides on the owner's plan.
-- Files in a member's own folder (`<user id>/…`) stay theirs alone, as before.

-- The shared note a path belongs to (`shared/<uuid>/…`), or null.
create or replace function public.shared_file_note(p_name text)
returns uuid
language sql
stable
as $$
  select case
    when (storage.foldername(p_name))[1] = 'shared'
     and (storage.foldername(p_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(p_name))[2])::uuid
  end
$$;

-- Bytes an account uses: its own files and those of the shared notes it owns.
create or replace function public.storage_used(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = public, storage
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o
   where o.bucket_id = 'attachments'
     and ((storage.foldername(o.name))[1] = p_user::text
       or exists (select 1 from public.shared_notes n
                   where n.id = public.shared_file_note(o.name) and n.owner_id = p_user))
$$;
revoke execute on function public.storage_used(uuid) from anon, authenticated, public;

-- The caller may add a file to this shared note: the owner or an editor (accepted), the note not
-- deleted, and room in the owner's plan.
create or replace function public.can_upload_shared(p_note uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.shared_active_role(p_note), '') in ('owner', 'edit')
     and exists (
       select 1 from public.shared_notes n
        where n.id = p_note and n.deleted_at is null
          and public.is_pro(n.owner_id)
          and public.storage_used(n.owner_id) < public.storage_limit(n.owner_id))
$$;
revoke execute on function public.can_upload_shared(uuid) from anon, public;
grant execute on function public.can_upload_shared(uuid) to authenticated;

create policy "attachments: read shared" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments'
    and public.shared_active_role(public.shared_file_note(name)) is not null);

create policy "attachments: add shared" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments'
    and public.can_upload_shared(public.shared_file_note(name)));

create policy "attachments: replace shared" on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments'
    and public.can_upload_shared(public.shared_file_note(name)))
  with check (bucket_id = 'attachments'
    and public.can_upload_shared(public.shared_file_note(name)));

-- Files of shared notes are not removed with an account's own (storage-cleanup): other members
-- use them. The removal date is shown only to accounts that have files of their own.
create or replace function public.files_delete_at(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, storage
as $$
  select case
    when public.plan_of(p_user) = 'pro' or public.had_subscription(p_user) then null
    when not exists (select 1 from storage.objects o
                      where o.bucket_id = 'attachments'
                        and (storage.foldername(o.name))[1] = p_user::text) then null
    else greatest(
      coalesce((select trial_ends_at from public.subscriptions where user_id = p_user), '-infinity'),
      coalesce(c.beta_until, '-infinity')
    ) + make_interval(days => c.free_files_days)
  end
  from public.plan_config c
$$;
revoke execute on function public.files_delete_at(uuid) from anon, authenticated, public;
