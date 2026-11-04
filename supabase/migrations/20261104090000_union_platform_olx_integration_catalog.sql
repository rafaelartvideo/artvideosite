begin;

-- OLX permanece em homologação: a distribuição do módulo não habilita publicação
-- automática nem cria credenciais. A configuração da aplicação pertence à Union.
insert into public.system_modules (key, name, description, category, sort_order, is_active)
values (
  'olx',
  'OLX',
  'Disponibilização da futura integração OLX; depende de homologação e OAuth individual por empresa.',
  'operation',
  95,
  true
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active;

commit;
