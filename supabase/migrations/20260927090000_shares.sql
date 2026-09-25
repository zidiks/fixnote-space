-- Shared links. A shared note is a copy sealed on the owner's device with a key that exists only in
-- the link's #fragment (browsers never send it to a server), so the server stores ciphertext it
-- cannot read. Anyone with the link reads it through get_share(); only the owner lists, updates or
-- deletes their links. Deleting the row is how a link is revoked.

create table public.shares (
  id         text primary key check (id ~ '^[A-Za-z0-9_-]{22}$'),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_id    uuid not null,
  payload    text not null check (octet_length(payload) <= 6 * 1024 * 1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shares_user_note on public.shares (user_id, note_id);

alter table public.shares enable row level security;
create policy "shares: read own" on public.shares
  for select to authenticated using (user_id = (select auth.uid()));
create policy "shares: create own" on public.shares
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "shares: update own" on public.shares
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "shares: remove own" on public.shares
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.shares from anon;
-- Only the sealed copy changes after creation.
revoke update on public.shares from authenticated;
grant update (payload) on public.shares to authenticated;

create or replace function public.shares_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.shares where user_id = new.user_id) >= 1000 then
      raise exception 'too many shared links' using errcode = '54000';
    end if;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger shares_before_write before insert or update on public.shares
  for each row execute function public.shares_before_write();

-- The only way to read someone's link: by its exact id, which is 128 random bits.
create or replace function public.get_share(p_id text)
returns table (payload text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.payload, s.updated_at from public.shares s where s.id = p_id;
$$;
revoke all on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated;
