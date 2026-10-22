-- SECURITY INVOKER keeps current_user as service_role for the internal RPCs;
-- the public, anon, and authenticated roles have no EXECUTE grants.
alter function public.union_ai_reserve(uuid,uuid,uuid,text,text,text) security invoker;
alter function public.union_ai_finalize(uuid,text,integer,integer,text) security invoker;
