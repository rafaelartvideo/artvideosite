create index if not exists entity_contacts_entity_org_fk_idx
  on public.entity_contacts(entity_id, organization_id);

create index if not exists entity_contacts_created_by_idx
  on public.entity_contacts(created_by);

create index if not exists entity_records_entity_org_fk_idx
  on public.entity_records(entity_id, organization_id);
