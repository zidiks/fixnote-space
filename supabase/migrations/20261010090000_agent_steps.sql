-- The assistant works in steps (it calls tools, gets their results, goes on). Every step costs
-- tokens, but only the question counts as a request against the daily limit: llm-proxy records a
-- step that only brings tool results back with p_requests = 0.

drop function if exists public.ai_record(uuid, integer);

create or replace function public.ai_record(p_user uuid, p_tokens integer, p_requests integer default 1)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage (user_id, day, tokens, requests)
  values (p_user, (now() at time zone 'utc')::date, greatest(p_tokens, 0), greatest(p_requests, 0))
  on conflict (user_id, day) do update
    set tokens = public.ai_usage.tokens + excluded.tokens,
        requests = public.ai_usage.requests + excluded.requests
$$;
revoke execute on function public.ai_record(uuid, integer, integer) from anon, authenticated, public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ai_record(uuid, integer, integer) to service_role;
  end if;
end $$;
