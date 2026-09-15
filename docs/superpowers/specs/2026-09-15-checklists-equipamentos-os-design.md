# Sistema de Checklists por Equipamento e OS — Design

## Objetivo

Criar um subsistema de checklist técnico integrado a **Operação > Checklists**, **Equipamentos** e **Ordens de Serviço**, mantendo o padrão atual do admin: multiempresa, permissões, rotas reais para páginas completas, TanStack Query para cache e Supabase para persistência/segurança.

O sistema deve permitir que cada tipo de equipamento use um único **Perfil de Checklist**, composto por etapas como **Entrada**, **Diagnóstico** e **Saída / Controle de Qualidade (QC)**. Cada etapa pode ser vinculada a uma **Situação da OS** e, opcionalmente, bloquear a saída dessa situação enquanto os itens obrigatórios não estiverem válidos.

A OS deve receber um **snapshot imutável** do checklist vigente no momento da criação/vinculação do equipamento, para que alterações futuras no perfil não modifiquem o histórico técnico de ordens antigas.

## Decisão de arquitetura

A estrutura recomendada é:

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

Rota principal:

```text
/admin/operation/checklists
```

Rotas de página completa:

```text
/admin/operation/checklists
/admin/operation/checklists/new
/admin/operation/checklists/:profileId/edit
```

O módulo deve seguir o padrão visual dos demais cadastros operacionais e usar `AdminPage` apenas para a página ativa.

### Lista de perfis

A listagem deve exibir pelo menos:

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

Cada etapa deve possuir:

- `title`: título apresentado ao usuário;
- `code`: código estável dentro do perfil, usado para associar itens adicionais do equipamento;
- `stage_type`: `entry`, `diagnosis`, `qc` ou `custom`;
- `situation_id`: Situação da OS vinculada, opcional;
- `block_situation_exit`: se a OS fica impedida de sair dessa situação enquanto a etapa obrigatória estiver incompleta;
- `sort_order`;
- `is_active`.

### Vínculo com Situação da OS

No editor da etapa haverá um seletor de situações ativas da empresa.

Exemplo:

```text
Etapa: Diagnóstico
Situação vinculada: Em diagnóstico
[x] Bloquear saída da situação enquanto o checklist estiver incompleto
```

O vínculo é opcional. Sem situação vinculada, a etapa fica disponível manualmente no checklist da OS e nunca bloqueia troca de situação.

Se várias etapas forem vinculadas à mesma situação e estiverem configuradas para bloqueio, todas as etapas bloqueadoras precisam estar válidas antes da saída dessa situação.

O bloqueio deve ser aplicado no banco, não apenas na interface. Isso é necessário porque hoje a situação também pode ser alterada por Kanban e por outros fluxos que atualizam `service_orders.situation_id` diretamente.

## Itens de checklist

Cada item deve conter:

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

O modelo não deve depender apenas de uma checkbox binária, porque itens técnicos precisam distinguir conformidade, falha e não aplicabilidade.

### Foto

Configuração:

- `none`: não solicita;
- `optional`: permite foto;
- `required`: foto obrigatória para concluir o item.

Isso substitui uma simples opção Foto Sim/Não e cobre os dois casos sem alterar o modelo depois.

### Observação

Configuração:

- `none`;
- `optional`;
- `required`;
- `required_on_failure`.

Para `conformity`, falha é `not_ok`. Para `yes_no`, o valor `no` é tratado como falha quando o item usa `required_on_failure`.

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
- seção "Checklist" no editor;
- seletor de Perfil de Checklist;
- resumo de etapas do perfil selecionado;
- área "Itens adicionais deste equipamento".

Exemplo:

```text
Equipamento: Televisor
Perfil: Televisor — Padrão

Itens adicionais
- Controle remoto acompanha o aparelho
- Tela OLED sem burn-in visível
```

### Itens adicionais do equipamento

O usuário pode acrescentar itens exclusivos daquele tipo de equipamento sem duplicar ou alterar o perfil global.

Cada item adicional deve escolher em qual etapa será inserido. O vínculo é feito pelo `stage_code` do perfil, permitindo que o perfil seja revisado sem depender do UUID da etapa.

Os itens adicionais usam as mesmas propriedades dos itens do perfil: tipo de resposta, obrigatório, foto, observação e ordem.

Se o perfil do equipamento for trocado e algum `stage_code` usado por itens extras deixar de existir, a UI deve exigir que o usuário remapeie esses itens antes de salvar.

## Versionamento do perfil

`checklist_profiles.version` é incrementado quando houver alteração estrutural em etapas ou itens.

Não é necessário manter uma cópia completa de cada versão configurável em tabelas separadas, porque a OS mantém o snapshot completo da configuração que recebeu.

A listagem exibe a versão atual para facilitar suporte e auditoria.

## Snapshot na Ordem de Serviço

Uma OS com `equipment_type_id` que tenha Perfil de Checklist recebe um snapshot completo.

O snapshot deve ocorrer automaticamente após a criação da OS e também deve existir um fluxo `ensure` ao abrir Checklists para cobrir OS antigas que ainda não tenham snapshot.

O snapshot copia:

- nome e versão do perfil;
- tipo de equipamento;
- etapas;
- Situação vinculada e nome da situação naquele momento;
- regras de bloqueio;
- itens do perfil;
- itens adicionais do equipamento;
- requisitos de resposta/foto/observação;
- ordem.

Alterar o perfil depois não altera uma OS já existente.

### Mudança do equipamento de uma OS

Se `equipment_type_id` mudar:

- o checklist ativo anterior é marcado como `superseded`;
- nunca é apagado;
- é criado um novo snapshot para o novo equipamento, se houver perfil;
- o checklist superseded continua disponível para auditoria, mas não bloqueia o fluxo atual.

Isso evita perda de dados quando uma OS já teve respostas e o equipamento foi corrigido posteriormente.

## Execução do checklist na OS

Adicionar uma subrota real:

```text
/admin/orders/:orderId/checklists
```

Não é necessário criar uma terceira camada de rota por etapa na primeira versão. A página de Checklists mostra todas as etapas em cards expansíveis, preservando o padrão atual `resourceId + subpage` do admin.

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

- Etapa sem situação: disponível a qualquer momento;
- Etapa vinculada à situação atual: destacada como etapa atual;
- Etapas de outras situações permanecem visíveis para consulta, mas edição deve seguir permissões e regras do fluxo;
- Uma etapa concluída permanece somente leitura, salvo permissão específica de reabertura.

## Regra de conclusão

A etapa pode ser concluída quando todos os itens obrigatórios estiverem válidos.

Um item obrigatório está válido quando:

- possui resposta compatível com seu tipo;
- se foto for `required`, possui pelo menos uma mídia vinculada;
- se observação for `required`, possui texto;
- se observação for `required_on_failure`, possui texto quando a resposta representa falha.

Itens opcionais podem permanecer sem resposta. O progresso visual continua mostrando respondidos/total.

A conclusão deve ocorrer por RPC/função transacional, que revalida as condições no banco antes de marcar a etapa como concluída.

## Bloqueio de avanço da Situação

Criar uma validação server-side em mudança de `service_orders.situation_id`.

Quando `OLD.situation_id` for diferente de `NEW.situation_id`, o banco verifica o checklist ativo da OS.

Se houver etapa:

- vinculada à situação atual (`OLD.situation_id`);
- `block_situation_exit = true`;
- ainda não concluída;

a alteração é rejeitada com mensagem clara, por exemplo:

```text
Conclua o checklist "Diagnóstico" antes de sair da situação "Em diagnóstico".
```

A mesma regra vale para alteração pelo detalhe da OS e pelo Kanban.

A regra não bloqueia cancelamento da OS. Cancelamento é um fluxo administrativo distinto e deve permanecer possível conforme permissão existente.

## Fotos e Documentos da OS

Não criar um novo bucket.

Usar o bucket existente `service-images` e o repositório compartilhado de mídia, com path semelhante a:

```text
orders/{orderId}/checklists/{checklistId}/{itemId}/...
```

Criar vínculo específico entre item de checklist e `media`.

Quando a etapa possui Situação vinculada, a mesma mídia também deve ser ligada a `service_order_situation_media`, para aparecer automaticamente em **Documentos da OS** agrupada pela situação correspondente.

Assim a foto continua acessível por dois contextos:

- dentro do item do checklist;
- dentro dos Documentos/Imagens da OS.

Não duplicar o arquivo físico.

## Auditoria

Registrar:

- quem respondeu cada item;
- `answered_at`;
- quem concluiu cada etapa;
- `completed_at`;
- quem reabriu uma etapa;
- superseding do checklist por troca de equipamento;
- alterações relevantes de resposta.

Além dos campos atuais de resposta, usar uma tabela append-only de eventos do checklist para eventos relevantes (`snapshot_created`, `item_changed`, `stage_completed`, `stage_reopened`, `checklist_superseded`).

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
sort_order integer NOT NULL
is_active boolean NOT NULL default true
```

Restrição única por `(profile_id, code)`.

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

Itens extras por tipo de equipamento:

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

`response_value` aceita formato simples por tipo sem alterar schema a cada novo tipo de resposta.

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

## RLS e segurança

Todas as tabelas `public` novas devem nascer com RLS habilitado.

Configuração de perfil:

- leitura depende de `checklists.view`;
- escrita depende de `checklists.manage`.

Execução na OS:

- leitura exige que `private.can_view_service_order(service_order_id)` seja verdadeira e `orders.checklists.view`;
- resposta exige `orders.checklists.fill` e acesso à OS;
- concluir exige `orders.checklists.complete`;
- reabrir exige `orders.checklists.reopen`.

As funções internas de validação e snapshot devem ficar em schema `private` quando precisarem de privilégios elevados. Não expor `SECURITY DEFINER` em `public` sem necessidade.

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

O módulo Operação > Checklists usa `checklists.view` como permissão principal.

## Módulo multiempresa

Adicionar chave de módulo `checklists` ao catálogo de módulos operacionais e ao mapeamento do admin.

Não é uma integração exclusiva da ArtVideo: o subsistema deve ser multiempresa desde o início e respeitar `organization_id` em todas as tabelas e queries.

## Cache e Realtime

Adicionar família de query keys:

```text
checklists.all
checklists.profiles()
checklists.profile(organizationId, profileId)
checklists.equipmentItems(organizationId, equipmentTypeId)
orders.checklists(orderId)
```

Perfis, etapas, itens e vínculos do equipamento usam TanStack Query.

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

`loadEquipmentCatalog` deve carregar o vínculo de perfil e somente os dados necessários para o editor.

O editor de Equipamentos não deve incorporar o editor inteiro do perfil. Ele apenas:

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

A mudança de situação continua usando o fluxo atual de `updateServiceOrderSituation`; se o banco bloquear a transição por checklist incompleto, o optimistic update existente deve ser revertido e a mensagem retornada pelo banco mostrada ao usuário.

O mesmo comportamento vale para drag-and-drop do Kanban, porque ele usa a mesma mutação de situação.

## UX da página de execução

Desktop e mobile devem priorizar uso rápido de bancada.

Cada etapa mostra:

- Situação relacionada;
- Progresso;
- Estado;
- responsável/conclusão;
- itens expansíveis.

Cada item mostra resposta grande e fácil de tocar, observação quando aplicável e ações de foto.

No mobile:

- botões de resposta com altura confortável;
- ações Câmera/Anexar como ícones compactos onde necessário;
- barra inferior respeitando `safe-area-inset-bottom` e `visualViewport`, igual às páginas atuais da OS.

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

Mensagens de validação devem apontar exatamente o item ausente, quando possível:

```text
Adicione uma foto em "Estado da tela" antes de concluir a etapa.
```

ou:

```text
Conclua o checklist "Saída / QC" antes de sair da situação "Pronto para retirada".
```

## Fluxo de criação de OS

Não adicionar campos de checklist na criação da OS.

O usuário escolhe o equipamento normalmente. O perfil vem automaticamente de `equipment_types.checklist_profile_id`.

Após a criação atômica da OS, o backend cria/garante o snapshot. A criação da OS não deve falhar apenas porque o equipamento não tem perfil configurado.

OS sem perfil simplesmente não exibe checklist ativo até que exista um snapshot aplicável.

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
- automação de mudança de situação ao concluir checklist;
- checklist no site público.

Essas extensões podem ser adicionadas depois sem alterar o núcleo de snapshot/execução.

## Critérios de aceite

1. Operação possui módulo Checklists com permissão própria.
2. É possível criar perfil com múltiplas etapas.
3. Cada etapa pode selecionar uma Situação da OS ou ficar manual.
4. Cada etapa pode bloquear a saída da Situação vinculada.
5. É possível criar itens com tipos de resposta diferentes.
6. Foto pode ser nenhuma, opcional ou obrigatória.
7. Observação pode ser opcional, obrigatória ou obrigatória em falha.
8. Um equipamento pode escolher exatamente um perfil.
9. Um equipamento pode possuir itens adicionais por etapa.
10. OS criada com equipamento configurado recebe snapshot.
11. Alterar perfil depois não altera OS existente.
12. Trocar equipamento da OS preserva checklist antigo como superseded e cria novo quando aplicável.
13. `/admin/orders/:id/checklists` funciona com deep-link/F5 e volta para o detalhe da OS.
14. Página da OS mostra progresso por etapa.
15. Usuário pode responder item conforme permissão.
16. Foto de item é vinculada ao checklist sem duplicar arquivo físico.
17. Foto de etapa vinculada a Situação aparece também em Documentos da OS.
18. Etapa só conclui quando requisitos obrigatórios estiverem válidos.
19. Banco impede saída de Situação bloqueadora incompleta.
20. Bloqueio funciona também no Kanban.
21. Cancelamento da OS não fica bloqueado pelo checklist.
22. Auditoria registra responsáveis e eventos relevantes.
23. Todas as tabelas são isoladas por `organization_id` e RLS.
24. Cache usa o QueryClient existente, sem cache manual paralelo.
25. OS antigas sem snapshot continuam funcionando.
26. Build Vite deve passar após implementação.

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
- `src/features/admin-shell/domain/admin.types.ts`
- `src/features/admin-shell/admin-routes.ts`
- `src/features/admin-shell/navigation-config.ts`
- `src/app/Admin.tsx`
- `src/infrastructure/query/query-keys.ts`
- `src/infrastructure/query/QueryRealtimeSync.tsx`
- permission taxonomy
- migration SQL do checklist

A implementação deve ser feita diretamente na `main`, em commits agrupados e coerentes, sem branch/PR intermediário e sem acompanhamento contínuo de deploy.