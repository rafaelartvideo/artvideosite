begin;

-- A FK simples ficou redundante depois que o relacionamento passou a ser
-- garantido por (entity_id, organization_id). Mantê-la cria duas relações
-- possíveis entre entities e entity_addresses no PostgREST.
alter table public.entity_addresses
  drop constraint if exists entity_addresses_entity_id_fkey;

-- Cobre a FK composta e mantém consultas tenant-scoped eficientes.
create index if not exists entity_addresses_entity_organization_idx
  on public.entity_addresses (entity_id, organization_id);

-- Solicita recarga do cache de relacionamentos do PostgREST.
notify pgrst, 'reload schema';

commit;
