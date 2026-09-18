begin;
revoke all on function public.create_employee_record(uuid,text,text,text,text,uuid) from public;
revoke all on function public.create_employee_record(uuid,text,text,text,text,uuid) from anon;
revoke all on function public.create_employee_record(uuid,text,text,text,text,uuid) from authenticated;
commit;
