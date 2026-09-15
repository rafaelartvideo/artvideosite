# Verificação — Checklists por Equipamento e OS

Data: 2026-09-15

## Implementado

- Operação > Checklists com perfis, etapas, itens, tipos de resposta, N/A, regras de foto/observação, ativação e edição.
- Etapas vinculáveis a Situações da OS.
- Gates server-side para saída da Situação, Resolver OS e Concluir OS; cancelamento permanece independente.
- Equipamentos vinculados a um perfil único, com itens adicionais por etapa.
- Snapshot histórico por OS e substituição auditável quando o equipamento muda.
- Execução pela rota `/admin/orders/:id/checklists`, com progresso, respostas, observações, fotos, conclusão e reabertura.
- Fotos reutilizam `service-images`, `media`, `service_order_media` e, quando houver Situação vinculada, `service_order_situation_media`.
- Permissões, RLS multiempresa, Query Cache e Realtime integrados.
- Migration versionada em `supabase/migrations/20260915124141_equipment_order_checklists.sql`.

## Verificação de banco executada

Consulta estrutural no projeto Supabase confirmou:

- 9/9 tabelas de checklist presentes.
- 9/9 tabelas com RLS habilitado.
- 7 RPCs públicos esperados presentes.
- 2 triggers de OS presentes (`service_orders_checklist_snapshot` e `service_orders_checklist_gates`).
- 5 permissões novas presentes.
- módulo `checklists` ativo.
- coluna `equipment_types.checklist_profile_id` presente.

## Observação de build

O ambiente de execução local desta sessão não conseguiu acessar o repositório via rede para executar `npm run build`. Por solicitação do usuário, não foi feita consulta repetida de workflow/deploy. Este commit final, sem `[skip ci]`, deixa o fluxo normal do repositório executar a validação/deploy configurados.
