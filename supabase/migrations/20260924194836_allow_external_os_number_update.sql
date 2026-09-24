begin;

drop trigger if exists prevent_external_os_number_update
on public.service_orders;

drop function if exists public.prevent_external_os_number_update();

commit;
