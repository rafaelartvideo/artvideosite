begin;


revoke execute on function public.save_product_inventory_settings(uuid,uuid,text,integer,numeric,text,text,text) from authenticated;
revoke execute on function public.initialize_product_inventory_balance(uuid,uuid,numeric,numeric) from authenticated;

commit;
