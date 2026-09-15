# Checklists por equipamento e OS — implementação concluída

Implementação finalizada em 15/09/2026 diretamente na `main`.

## Entregue

- Módulo **Operação > Checklists** em `/admin/operation/checklists`.
- Perfis com etapas Entrada, Diagnóstico, Saída/QC e etapas personalizadas.
- Vínculo opcional de cada etapa com uma Situação da OS.
- Bloqueios server-side para saída da situação, Resolver OS e Concluir OS.
- Tipos de resposta: conformidade, Sim/Não, confirmação, texto e número.
- N/A configurável por item.
- Foto: nenhuma, opcional, obrigatória e obrigatória em falha.
- Observação: nenhuma, opcional, obrigatória e obrigatória em falha.
- Um perfil por tipo de equipamento e itens adicionais específicos por equipamento.
- Snapshot imutável do perfil na OS; troca de equipamento preserva o checklist anterior como superseded e cria um novo snapshot.
- Rota real da execução: `/admin/orders/:id/checklists`.
- Progresso por etapa e geral calculado apenas a partir de respostas válidas.
- Câmera e anexo de imagem separados no mobile/desktop.
- Fotos vinculadas ao item do checklist, à mídia geral da OS e à situação quando aplicável.
- Conclusão e reabertura de etapas com responsável/data e trilha de eventos.
- Permissões específicas e agrupamento na tela de Funções e Permissões.
- RLS multiempresa e RPCs SECURITY DEFINER com validação de acesso.
- TanStack Query + sincronização Realtime; nove tabelas de checklist publicadas em `supabase_realtime`.
- Perfil inativo já vinculado ao equipamento continua válido até ser substituído, mas não aparece como nova opção para outros equipamentos.
- Migrations versionadas no repositório:
  - `20260915124141_equipment_order_checklists.sql`
  - `20260915130456_checklist_equipment_profile_read_policy.sql`
  - `20260915130809_harden_equipment_order_checklists.sql`
  - `20260915132259_enable_checklist_realtime.sql`

## Verificações executadas

- 9/9 tabelas esperadas presentes no Supabase com RLS ativo.
- 7/7 RPCs públicas esperadas presentes.
- Triggers `service_orders_checklist_snapshot` e `service_orders_checklist_gates` presentes.
- 5/5 permissões novas presentes.
- FK Equipamento → Perfil confirmada com `ON DELETE RESTRICT`.
- Policies de leitura dos perfis confirmadas para Checklists e para o cadastro de Equipamentos.
- 9/9 tabelas novas confirmadas na publicação `supabase_realtime`.
- Rotas de Checklists confirmadas no shell administrativo e na OS.
- Tipo `OrderDetailSubpage` alinhado com a subrota `checklists` em `TabOrders` e `OrderDetailsPage`.

O commit final dispara o workflow normal do repositório. O status do deploy não é acompanhado aqui, conforme solicitado.
