-- Remote MCP (docs/remote-mcp.md): ChatGPT, claude.ai and other AI apps reach the notes through
-- the relay at mcp.fixnote.space, which forwards each call to the person's own device. They sign
-- in with Supabase Auth's OAuth 2.1 server ([auth.oauth_server] in config.toml).
--
-- Such a token is an ordinary `authenticated` JWT of the user plus a `client_id` claim. Without the
-- rules below an AI app could use the whole API as the user (sealed rows, files, RPCs). It may do
-- exactly one thing here: ask whether the account may use remote access. No tables: the relay keeps
-- which apps connected in its Durable Object, the grants live in Supabase Auth.

-- True for a token Supabase Auth issued to an OAuth client (an AI app), not the FixNote app.
create or replace function public.is_oauth_client()
returns boolean
language sql
stable
as $$ select coalesce(auth.jwt() ->> 'client_id', '') <> '' $$;

-- What the relay asks, with an AI app's token or a device session: may this account use remote
-- access right now? It goes through our server, so it is part of Pro.
create or replace function public.remote_mcp_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select auth.uid() is not null and public.is_pro(auth.uid()) $$;
revoke execute on function public.remote_mcp_allowed() from anon, public;
grant execute on function public.remote_mcp_allowed() to authenticated;

-- PostgREST runs this before every request (tables and RPCs alike): an AI app's token reaches only
-- remote_mcp_allowed. The app's own sessions have no client_id and pass untouched.
create or replace function public.guard_oauth_clients()
returns void
language plpgsql
stable
as $$
begin
  if public.is_oauth_client()
     and coalesce(current_setting('request.path', true), '') <> '/rpc/remote_mcp_allowed' then
    raise exception 'oauth_client_not_allowed'
      using errcode = '42501', hint = 'AI apps reach FixNote through mcp.fixnote.space';
  end if;
end $$;

alter role authenticator set pgrst.db_pre_request = 'public.guard_oauth_clients';
notify pgrst, 'reload config';

-- The same rule on every row, for what does not go through PostgREST (Realtime, Storage) and in
-- case the pre-request hook is ever lost: a restrictive policy on each table with RLS. A table
-- added later needs it too (see CLAUDE.md).
do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists "no oauth clients" on public.%I', t.relname);
    execute format(
      'create policy "no oauth clients" on public.%I as restrictive for all to authenticated
         using (not public.is_oauth_client()) with check (not public.is_oauth_client())',
      t.relname
    );
  end loop;
end $$;

create policy "no oauth clients" on storage.objects
  as restrictive for all to authenticated
  using (not public.is_oauth_client()) with check (not public.is_oauth_client());

create policy "no oauth clients" on realtime.messages
  as restrictive for all to authenticated
  using (not public.is_oauth_client()) with check (not public.is_oauth_client());
