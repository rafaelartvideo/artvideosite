-- Tipo padrao para anexar comprovantes na conclusao de OS em todas as empresas.
-- Reutiliza tipos ja cadastrados (case-insensitive); nao altera tipos existentes.
insert into public.attachment_types (organization_id, name, is_active)
select organization.id, 'Comprovante de pagamento', true
from public.organizations as organization
where not exists (
  select 1 from public.attachment_types as attachment
  where attachment.organization_id = organization.id
    and lower(btrim(attachment.name)) = 'comprovante de pagamento'
);
