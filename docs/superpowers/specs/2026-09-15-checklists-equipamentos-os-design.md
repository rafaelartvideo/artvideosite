# Sistema de Checklists por Equipamento e OS — Design

## Objetivo

Criar um subsistema de checklist técnico integrado a **Operação > Checklists**, **Equipamentos** e **Ordens de Serviço**, mantendo o padrão atual do admin: multiempresa, permissões, rotas reais para páginas completas, TanStack Query para cache e Supabase para persistência/segurança.

O sistema deve permitir que cada tipo de equipamento use um único **Perfil de Checklist**, composto por etapas como **Entrada**, **Diagnóstico** e **Saída / Controle de Qualidade (QC)**. Cada etapa pode ser vinculada a uma **Situação da OS** e, opcionalmente, controlar a saída da situação, a resolução técnica ou a conclusão financeira da OS.

A OS deve receber um **snapshot imutável** do checklist vigente no momento da criação/vinculação do equipamento, para que alterações futuras no perfil não modifiquem o histórico técnico de ordens antigas.

## Decisão de arquitetura

A estrutura é:

```text
Perfil de Checklist
  -> Etapas
     -> Itens

Equipamento
  -> 1 Perfil de Checklist
  -> Itens adicionais próprios

OS
  -> Snapshot do Perfil + Itens adicionais
     -> Etapas executáveis
        -> Respostas / observações / fotos / auditoria
```

Não haverá um checklist genérico único para todas as OS e não serão mantidos três perfis independentes para Entrada/Diagnóstico/Saída. Um único perfil agrega as etapas e pode ser reutilizado por vários equipamentos.

## Operação > Checklists

Adicionar o módulo **Checklists** ao hub de Operação, logo após Equipamentos.

Rotas:

```text
/admin/operation/checklists
/admin/operation/checklists/new
/admin/operation/checklists/:profileId/edit
```

O módulo segue o padrão visual dos demais cadastros operacionais e usa `AdminPage` apenas para a página ativa.

### Lista de perfis

Exibir pelo menos:

- Nome;
- Versão atual;
- Quantidade de etapas;
- Quantidade de itens;
- Equipamentos vinculados;
- Status Ativo/Inativo;
- Ações.

Não usar exclusão destrutiva como fluxo principal. Perfil usado em OS deve ser inativado, preservando histórico.

### Editor do perfil

Campos gerais:

- Nome do perfil;
- Descrição opcional;
- Ativo/Inativo;
- Versão interna;
- Etapas ordenáveis.

Exemplo:

```text
Televisor — Padrão

1. Entrada
2. Diagnóstico
3. Saída / QC
```

Pode existir etapa personalizada além das três sugeridas.

## Etapas do perfil

Cada etapa possui:

- `name`: título apresentado ao usuário;
- `code`: código estável dentro do perfil, usado por itens adicionais do equipamento;
- `stage_type`: `entry`, `diagnosis`, `qc` ou `custom`;
- `situation_id`: Situação da OS vinculada, opcional;
- `block_situation_exit`: bloqueia saída da Situação vinculada enquanto a etapa estiver incompleta;
- `block_order_resolution`: bloqueia **Resolver OS** enquanto a etapa estiver incompleta;
- `block_order_completion`: bloqueia **Concluir OS** enquanto a etapa estiver incompleta;
- `sort_order`;
- `is_active`.

As três travas são independentes. Por padrão recomendado:

- Entrada: pode bloquear saída da situação de recepção;
- Diagnóstico: pode bloquear saída de diagnóstico e/ou Resolver OS;
- Saída/QC: pode bloquear saída da situação final e Concluir OS.

### Vínculo com Situação da OS

No editor da etapa haverá um seletor de situações ativas da empresa.

Exemplo:

```text
Etapa: Diagnóstico
Situação vinculada: Em diagnóstico
[x] Bloquear saída da situação
[x] Bloquear Resolver OS
[ ] Bloquear Concluir OS
```

O vínculo é opcional. Sem situação vinculada, a etapa fica disponível manualmente e `block_situation_exit` deve permanecer desabilitado.

Se várias etapas forem vinculadas à mesma situação e estiverem configuradas para bloqueio, todas as etapas bloqueadoras precisam estar concluídas antes da saída dessa situação.

O bloqueio deve ser aplicado no banco, não apenas na interface, porque a Situação também pode mudar via Kanban e outros fluxos que atualizam `service_orders.situation_id`.

## Itens de checklist

Cada item contém:

- Título;
- Descrição/instrução opcional;
- Tipo de resposta;
- Obrigatório Sim/Não;
- Permite N/A Sim/Não;
- Exigência de foto;
- Exigência de observação;
- Ordem;
- Status Ativo/Inativo.

### Tipos de resposta

Versão inicial:

- `conformity`: Conforme / Não conforme / N/A;
- `yes_no`: Sim / Não / N/A;
- `confirmation`: caixa de confirmação;
- `text`: resposta textual;
- `number`: valor numérico.

O modelo não depende apenas de uma checkbox binária, porque itens técnicos precisam distinguir conformidade, falha e não aplicabilidade.

### Foto

Configuração:

- `none`: não solicita;
- `optional`: permite foto;
- `required`: foto obrigatória para considerar o item válido;
- `required_on_failure`: foto obrigatória apenas quando a resposta representa falha.

Para `conformity`, falha é `not_ok`. Para `yes_no`, falha é `no`.

### Observação

Configuração:

- `none`;
- `optional`;
- `required`;
- `required_on_failure`.

Exemplo:

```text
Estado da tela
[ Conforme ] [ Não conforme ] [ N/A ]

Não conforme:
Observação *
Foto *
```

## Equipamentos

O cadastro existente de Equipamentos continua sendo a fonte do tipo técnico (`equipment_types`).

Cada tipo recebe:

- `checklist_profile_id` opcional;
- seção **Checklist** no editor;
- seletor de Perfil de Checklist;
- resumo das etapas do perfil selecionado;
- área **Itens adicionais deste equipamento**.

Exemplo:

```text
Equipamento: Televisor
Perfil: Televisor — Padrão

Itens adicionais
- Controle remoto acompanha o aparelho
- Tela OLED sem burn-in visível
```

### Itens adicionais do equipamento

O usuário pode acrescentar itens exclusivos daquele tipo de equipamento sem duplicar nem alterar o perfil global.

Cada item adicional escolhe em qual etapa será inserido. O vínculo usa o `stage_code` do perfil, permitindo revisar o perfil sem depender do UUID da etapa.

Os itens adicionais usam as mesmas propriedades dos itens do perfil: tipo de resposta, obrigatório, N/A, foto, observação e ordem.

Se o perfil do equipamento for trocado e algum `stage_code` usado por itens extras deixar de existir, a UI exige remapeamento desses itens antes de salvar.

## Versionamento do perfil

`checklist_profiles.version` é incrementado quando houver mudança que afete o snapshot: etapas, itens, Situação vinculada, regras de bloqueio ou conteúdo técnico.

Ativar/inativar o perfil por si só não precisa incrementar a versão.

Não é necessário manter cópia completa de cada versão configurável em tabelas separadas, porque cada OS mantém seu próprio snapshot completo.

## Snapshot na Ordem de Serviço

Uma OS com `equipment_type_id` cujo tipo possua Perfil de Checklist recebe um snapshot completo.

O snapshot ocorre automaticamente dentro do fluxo transacional de criação da OS. A ausência de perfil não é erro e não impede a criação. Se existe um perfil aplicável e a criação do snapshot falha por inconsistência real de dados, a transação deve falhar em vez de deixar uma OS parcialmente configurada.

Também existe um fluxo `ensure` ao abrir Checklists para cobrir OS antigas sem snapshot.

O snapshot copia:

- nome e versão do perfil;
- tipo de equipamento;
- etapas;
- Situação vinculada e nome da situação naquele momento;
- regras de bloqueio de situação/resolução/conclusão;
- itens do perfil;
- itens adicionais do equipamento;
- requisitos de resposta/foto/observação;
- ordem.

Alterar o perfil depois não altera uma OS já existente.

### Mudança do equipamento de uma OS

Se `equipment_type_id` mudar:

- o checklist ativo anterior é marcado como `superseded`;
- nunca é apagado;
- é criado novo snapshot para o novo equipamento, se houver perfil;
- o checklist superseded continua disponível para auditoria, mas não bloqueia o fluxo atual.

Isso evita perda de dados mesmo quando a OS já teve respostas antes da correção do equipamento.

## Execução do checklist na OS

Adicionar subrota real:

```text
/admin/orders/:orderId/checklists
```

Não criar uma terceira camada de rota por etapa na primeira versão. A página mostra todas as etapas em cards expansíveis e preserva o contrato atual `resourceId + subpage` do admin.

Na toolbar da OS haverá botão **Checklists**, com badge de progresso.

Exemplo:

```text
Checklists  7/18
```

A página mostra:

```text
Entrada
12/12 respondidos     Concluído
Responsável: João
15/09/2026 08:31

Diagnóstico
7/14 respondidos      Em andamento
Situação: Em diagnóstico

Saída / QC
0/10                  Pendente
Situação: Pronto para retirada
```

### Disponibilidade das etapas

- Etapa sem Situação: disponível a qualquer momento;
- Etapa vinculada à Situação atual: destacada como etapa atual;
- Etapas de outras situações permanecem visíveis e podem ser preenchidas por usuário com `orders.checklists.fill`, permitindo correções e OS antigas;
- Uma etapa concluída fica somente leitura até ser reaberta por usuário com `orders.checklists.reopen`.

A Situação serve para contexto e bloqueio de fluxo, não para esconder dados históricos.

## Regra de validade e conclusão

A etapa pode ser concluída quando todos os itens obrigatórios estiverem válidos.

Um item obrigatório está válido quando:

- possui resposta compatível com seu tipo;
- se foto for `required`, possui pelo menos uma mídia vinculada;
- se foto for `required_on_failure`, possui mídia quando a resposta representa falha;
- se observação for `required`, possui texto;
- se observação for `required_on_failure`, possui texto quando a resposta representa falha.

Itens opcionais podem permanecer sem resposta. O progresso visual continua mostrando respondidos/total.

A conclusão ocorre por RPC/função transacional, que revalida todas as condições no banco antes de marcar a etapa como concluída.

## Bloqueio de avanço da Situação

Criar validação server-side em mudança de `service_orders.situation_id`.

Quando `OLD.situation_id` for diferente de `NEW.situation_id`, o banco verifica o checklist ativo da OS.

Se houver etapa:

- vinculada à situação atual (`OLD.situation_id`);
- `block_situation_exit = true`;
- ainda não concluída;

a alteração é rejeitada com mensagem clara:

```text
Conclua o checklist "Diagnóstico" antes de sair da situação "Em diagnóstico".
```

A mesma regra vale para detalhe da OS e Kanban.

A regra não bloqueia cancelamento da OS. Cancelamento continua sendo fluxo administrativo separado.

## Bloqueio de Resolver e Concluir OS

A função/RPC usada para **Resolver OS** deve verificar etapas ativas com `block_order_resolution_snapshot = true`. Se alguma estiver incompleta, a resolução é rejeitada com mensagem indicando a etapa.

A função/RPC usada para **Concluir OS** deve verificar etapas ativas com `block_order_completion_snapshot = true`. Se alguma estiver incompleta, a conclusão é rejeitada.

Assim uma etapa de Diagnóstico pode impedir resolução prematura e uma etapa de QC pode impedir conclusão financeira sem depender de uma troca posterior de Situação.

## Fotos e Documentos da OS

Não criar novo bucket.

Usar `service-images` e o repositório compartilhado de mídia, com path semelhante a:

```text
orders/{orderId}/checklists/{checklistId}/{itemId}/...
```

Cada foto possui vínculo em `service_order_checklist_item_media`.

Além disso, toda foto de checklist deve ser ligada a `service_order_media`, garantindo que pertença à OS e seja encontrada pelos fluxos gerais de mídia/documentos.

Quando a etapa possuir Situação vinculada, a mesma mídia também é ligada a `service_order_situation_media`, para aparecer agrupada pela Situação correspondente em **Documentos da OS**.

O arquivo físico não é duplicado. Apenas são criados os vínculos necessários.

## Auditoria

Registrar:

- quem respondeu cada item;
- `answered_at`;
- quem concluiu cada etapa;
- `completed_at`;
- quem reabriu etapa;
- substituição do checklist por troca de equipamento;
- alterações relevantes de resposta.

Além dos campos de estado, usar uma tabela append-only de eventos para `snapshot_created`, `item_changed`, `stage_completed`, `stage_reopened` e `checklist_superseded`.

Não permitir apagar histórico de execução.

## Estrutura de banco proposta

### `checklist_profiles`

```text
id uuid PK
organization_id uuid NOT NULL
name text NOT NULL
description text
version integer NOT NULL default 1
is_active boolean NOT NULL default true
created_by uuid
created_at timestamptz
updated_at timestamptz
```

### `checklist_profile_stages`

```text
id uuid PK
organization_id uuid NOT NULL
profile_id uuid NOT NULL FK
code text NOT NULL
stage_type text NOT NULL
name text NOT NULL
situation_id uuid FK -> os_situations
block_situation_exit boolean NOT NULL default false
block_order_resolution boolean NOT NULL default false
block_order_completion boolean NOT NULL default false
sort_order integer NOT NULL
is_active boolean NOT NULL default true
```

Unique `(profile_id, code)`.

### `checklist_profile_items`

```text
id uuid PK
organization_id uuid NOT NULL
stage_id uuid NOT NULL FK
title text NOT NULL
description text
response_type text NOT NULL
allow_na boolean NOT NULL default false
is_required boolean NOT NULL default true
photo_requirement text NOT NULL default 'none'
observation_requirement text NOT NULL default 'none'
sort_order integer NOT NULL
is_active boolean NOT NULL default true
```

### `equipment_checklist_items`

```text
id uuid PK
organization_id uuid NOT NULL
equipment_type_id uuid NOT NULL FK
stage_code text NOT NULL
title text NOT NULL
description text
response_type text NOT NULL
allow_na boolean NOT NULL default false
is_required boolean NOT NULL default true
photo_requirement text NOT NULL default 'none'
observation_requirement text NOT NULL default 'none'
sort_order integer NOT NULL
is_active boolean NOT NULL default true
```

### `equipment_types`

Adicionar:

```text
checklist_profile_id uuid NULL FK -> checklist_profiles
```

O banco deve garantir que equipamento e perfil pertençam à mesma `organization_id`.

### `service_order_checklists`

```text
id uuid PK
organization_id uuid NOT NULL
service_order_id uuid NOT NULL FK
equipment_type_id uuid
source_profile_id uuid
profile_name_snapshot text NOT NULL
profile_version_snapshot integer NOT NULL
status text NOT NULL -- pending/in_progress/completed/superseded
created_by uuid
created_at timestamptz
completed_by uuid
completed_at timestamptz
superseded_at timestamptz
```

Índice parcial para permitir somente um checklist não-superseded ativo por OS.

### `service_order_checklist_stages`

```text
id uuid PK
organization_id uuid NOT NULL
checklist_id uuid NOT NULL FK
source_stage_id uuid
stage_code_snapshot text NOT NULL
stage_type_snapshot text NOT NULL
name_snapshot text NOT NULL
situation_id_snapshot uuid
situation_name_snapshot text
block_situation_exit_snapshot boolean NOT NULL
block_order_resolution_snapshot boolean NOT NULL
block_order_completion_snapshot boolean NOT NULL
sort_order integer NOT NULL
status text NOT NULL -- pending/in_progress/completed/reopened
completed_by uuid
completed_at timestamptz
```

### `service_order_checklist_items`

```text
id uuid PK
organization_id uuid NOT NULL
stage_id uuid NOT NULL FK
source_item_id uuid
source_kind text NOT NULL -- profile/equipment_extra
title_snapshot text NOT NULL
description_snapshot text
response_type_snapshot text NOT NULL
allow_na_snapshot boolean NOT NULL
is_required_snapshot boolean NOT NULL
photo_requirement_snapshot text NOT NULL
observation_requirement_snapshot text NOT NULL
sort_order integer NOT NULL
response_value jsonb
observation text
answered_by uuid
answered_at timestamptz
updated_at timestamptz
```

### `service_order_checklist_item_media`

```text
id uuid PK
organization_id uuid NOT NULL
checklist_item_id uuid NOT NULL FK
media_id uuid NOT NULL FK
created_by uuid
created_at timestamptz
```

Unique `(checklist_item_id, media_id)`.

### `service_order_checklist_events`

```text
id uuid PK
organization_id uuid NOT NULL
service_order_id uuid NOT NULL
checklist_id uuid NOT NULL
stage_id uuid
item_id uuid
event_type text NOT NULL
payload jsonb NOT NULL default '{}'
created_by uuid
created_at timestamptz NOT NULL
```

Append-only.

Todas as relações multi-tenant devem impedir vínculo entre registros de organizações diferentes, por FK composta, validação ou função segura conforme o padrão já existente no projeto.

## RLS e segurança

Todas as tabelas `public` novas nascem com RLS habilitado.

Configuração de perfil:

- leitura depende de `checklists.view`;
- escrita depende de `checklists.manage`.

Execução na OS:

- leitura exige `private.can_view_service_order(service_order_id)` e `orders.checklists.view`;
- resposta exige `orders.checklists.fill` e acesso à OS;
- concluir etapa exige `orders.checklists.complete`;
- reabrir exige `orders.checklists.reopen`.

Funções internas de snapshot, validação e auditoria ficam no schema `private` quando precisarem de privilégio elevado. Não expor `SECURITY DEFINER` em `public` sem necessidade.

## Permissões

Adicionar:

```text
checklists.view
checklists.manage
orders.checklists.view
orders.checklists.fill
orders.checklists.complete
orders.checklists.reopen
```

`checklists.manage` cobre criar/editar/inativar perfis, etapas e itens.

## Módulo multiempresa

Adicionar chave de módulo `checklists` ao catálogo de módulos operacionais e ao mapeamento do admin.

Não é exclusivo da ArtVideo: o subsistema é multiempresa desde o início e respeita `organization_id` em todas as tabelas e queries.

## Cache e Realtime

Adicionar família de query keys:

```text
checklists.all
checklists.profiles()
checklists.profile(organizationId, profileId)
checklists.equipmentItems(organizationId, equipmentTypeId)
orders.checklists(orderId)
```

Perfis, etapas, itens e vínculos usam TanStack Query.

Adicionar ao `QueryRealtimeSync`:

```text
checklist_profiles
checklist_profile_stages
checklist_profile_items
equipment_checklist_items
service_order_checklists
service_order_checklist_stages
service_order_checklist_items
service_order_checklist_item_media
```

A invalidação deve ser granular por organização/perfil/equipamento/OS quando o payload permitir.

## Integração com Equipamentos

`EquipmentDraft` e `EquipmentTypeRow` passam a incluir `checklist_profile_id`.

`loadEquipmentCatalog` carrega o vínculo de perfil e apenas os dados necessários para o editor.

O editor de Equipamentos não incorpora o editor inteiro do perfil. Ele apenas:

- seleciona perfil;
- mostra resumo;
- gerencia itens adicionais.

Perfis são criados e administrados em Operação > Checklists.

## Integração com OS

Adicionar `checklists` a `OrderDetailSubpage`.

A toolbar da OS exibe botão Checklists quando `orders.checklists.view` estiver permitido.

O clique navega para:

```text
/admin/orders/:id/checklists
```

A subpágina usa uma única `AdminPage` e volta para `/admin/orders/:id`.

A mudança de Situação continua usando o fluxo atual de `updateServiceOrderSituation`; se o banco bloquear a transição por checklist incompleto, o optimistic update existente é revertido e a mensagem retornada pelo banco é mostrada ao usuário.

O mesmo vale para drag-and-drop do Kanban.

As RPCs atuais de Resolver e Concluir OS passam a chamar a validação do checklist antes de efetivar a operação.

## UX da página de execução

Desktop e mobile priorizam uso rápido de bancada.

Cada etapa mostra:

- Situação relacionada;
- Progresso;
- Estado;
- responsável/conclusão;
- itens expansíveis.

Cada item mostra resposta grande e fácil de tocar, observação quando aplicável e ações de foto.

No mobile:

- botões de resposta com altura confortável;
- ações Câmera/Anexar compactas;
- barra inferior respeitando `safe-area-inset-bottom` e `visualViewport`, como as páginas atuais da OS.

## Estado e mensagens

Estados do checklist:

- Pendente;
- Em andamento;
- Concluído;
- Substituído.

Estados da etapa:

- Pendente;
- Em andamento;
- Concluído;
- Reaberto.

Mensagens de validação devem apontar o requisito ausente quando possível:

```text
Adicione uma foto em "Estado da tela" antes de concluir a etapa.
```

```text
Conclua o checklist "Saída / QC" antes de concluir a OS.
```

## Fluxo de criação de OS

Não adicionar campos de checklist na criação da OS.

O usuário escolhe o equipamento normalmente e o perfil vem de `equipment_types.checklist_profile_id`.

A criação atômica da OS deve garantir o snapshot quando houver perfil aplicável. Equipamento sem perfil continua sendo uma configuração válida.

## Compatibilidade com OS existentes

Ao abrir `/admin/orders/:id/checklists` para uma OS antiga:

1. consultar checklist ativo;
2. se não houver e o equipamento atual possuir perfil, chamar `ensure_service_order_checklist`;
3. carregar o snapshot criado;
4. se o equipamento não possuir perfil, exibir estado vazio explicando que não há checklist configurado.

Não fazer backfill obrigatório de todas as OS históricas na migration.

## Fora de escopo da primeira versão

- envio automático de WhatsApp/e-mail ao concluir etapas;
- assinatura digital do cliente;
- impressão específica de checklist;
- regras condicionais complexas entre itens;
- perfis específicos por marca/modelo;
- editor visual drag-and-drop avançado;
- automação de mudança de Situação ao concluir checklist;
- checklist no site público.

Essas extensões podem ser adicionadas depois sem alterar o núcleo de snapshot/execução.

## Critérios de aceite

1. Operação possui módulo Checklists com permissão própria.
2. É possível criar perfil com múltiplas etapas.
3. Cada etapa pode selecionar uma Situação da OS ou ficar manual.
4. Cada etapa pode bloquear saída da Situação, Resolver OS e/ou Concluir OS de forma independente.
5. É possível criar itens com tipos de resposta diferentes.
6. Foto pode ser nenhuma, opcional, obrigatória ou obrigatória em falha.
7. Observação pode ser nenhuma, opcional, obrigatória ou obrigatória em falha.
8. Um equipamento pode escolher exatamente um perfil.
9. Um equipamento pode possuir itens adicionais por etapa.
10. OS criada com equipamento configurado recebe snapshot.
11. Alterar perfil depois não altera OS existente.
12. Trocar equipamento da OS preserva checklist antigo como superseded e cria novo quando aplicável.
13. `/admin/orders/:id/checklists` funciona com deep-link/F5 e volta para o detalhe da OS.
14. Página da OS mostra progresso por etapa.
15. Usuário pode responder item conforme permissão.
16. Foto de item é vinculada ao checklist e também à mídia geral da OS sem duplicar arquivo físico.
17. Foto de etapa vinculada a Situação também aparece agrupada em Documentos da OS.
18. Etapa só conclui quando requisitos obrigatórios estiverem válidos.
19. Banco impede saída de Situação bloqueadora incompleta.
20. Bloqueio funciona também no Kanban.
21. Resolver OS respeita etapas configuradas para bloquear resolução.
22. Concluir OS respeita etapas configuradas para bloquear conclusão.
23. Cancelamento da OS não fica bloqueado pelo checklist.
24. Auditoria registra responsáveis e eventos relevantes.
25. Todas as tabelas são isoladas por `organization_id`, RLS e integridade multi-tenant.
26. Cache usa o QueryClient existente, sem cache manual paralelo.
27. OS antigas sem snapshot continuam funcionando.
28. Build Vite deve passar após implementação.

## Arquivos/áreas esperadas na implementação

- `src/features/checklists/domain/*`
- `src/features/checklists/infrastructure/*`
- `src/features/checklists/presentation/*`
- `src/features/equipment/domain/equipment.ts`
- `src/features/equipment/infrastructure/equipment.repository.ts`
- `src/features/equipment/presentation/EquipmentAdminPanel.tsx`
- `src/features/orders/presentation/TabOrders.tsx`
- `src/features/orders/presentation/OrderDetailsPage.tsx`
- nova página `OrderChecklistsPage.tsx` e hook/repositório correspondente
- `src/features/orders/infrastructure/orders.repository.ts`
- `src/features/admin-shell/domain/admin.types.ts`
- `src/features/admin-shell/admin-routes.ts`
- `src/features/admin-shell/navigation-config.ts`
- `src/app/Admin.tsx`
- `src/infrastructure/query/query-keys.ts`
- `src/infrastructure/query/QueryRealtimeSync.tsx`
- taxonomy de permissões
- migration SQL do checklist

A implementação será feita diretamente na `main`, em commits agrupados e coerentes, sem branch/PR intermediário e sem acompanhamento contínuo de deploy.