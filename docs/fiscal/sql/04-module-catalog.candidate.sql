-- Candidate migration. No account, permission grant, module entitlement or
-- secret is seeded. Apply only after staging validation.
begin;
insert into public.system_modules(key,name,description,category,sort_order,is_active)
values('fiscal','Fiscal','Documentos fiscais e integração por empresa','management',155,true)
on conflict(key) do nothing;
insert into public.permissions(key,label,description,module_name,sort_order) values
 ('fiscal.documents.view','Consultar documentos fiscais','Consultar documentos fiscais da empresa','Fiscal',5300),
 ('fiscal.documents.download','Baixar documentos fiscais','Baixar documentos fiscais originais da empresa','Fiscal',5301),
 ('fiscal.sync.manage','Sincronizar documentos fiscais','Sincronizar documentos fiscais da empresa','Fiscal',5302)
on conflict(key) do nothing;
-- Current permission_required_module_keys maps unknown prefixes to the
-- prefix (fiscal.* -> fiscal). Existing Gestor provisioning triggers may
-- assign permission entries according to existing module rules.
-- Do not enable the module or grant any write/issuance permission here.
-- Backend additionally requires explicit organization_modules.is_enabled,
-- verified binding, active company, account and membership.
commit;
