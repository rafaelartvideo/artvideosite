-- Remover exclusivamente auditorias técnicas criadas pelo backfill automático
-- e pela seleção automática do segmento em 13/10/2026.
-- Não atingir auditoria de edição manual: todos os horários abaixo correspondem
-- às execuções automáticas verificadas e as demais operações são preservadas.
-- As notificações referenciadas são removidas via ON DELETE CASCADE.

delete from public.organization_audit_logs a
where a.operation='insert'
and a.table_name in ('technical_fields','equipment_type_technical_fields')
and (
  (
    a.source='system'
    and date_trunc('second',a.created_at) in (
      '2026-10-13 14:11:57+00'::timestamptz,
      '2026-10-13 14:18:17+00'::timestamptz,
      '2026-10-13 14:20:55+00'::timestamptz
    )
  )
  or (
    a.source='authenticated_user'
    and date_trunc('second',a.created_at)='2026-10-13 14:17:53+00'::timestamptz
    and exists(select 1 from public.organizations o
      where o.id=a.organization_id and o.name='Teste')
  )
);
