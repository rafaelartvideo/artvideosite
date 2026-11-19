begin;
insert into public.union_whatsapp_permission_definitions
  (key,label,category,manager_default,operator_default,sort_order)
values ('manage_groups','Gerenciar grupos','Administração',true,false,21)
on conflict (key) do update set
  label=excluded.label,category=excluded.category,
  manager_default=excluded.manager_default,operator_default=excluded.operator_default,
  sort_order=excluded.sort_order;
commit;
