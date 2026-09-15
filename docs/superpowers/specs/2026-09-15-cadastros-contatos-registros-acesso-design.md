# Cadastros — Toolbar, Contatos, Registros e Acesso do Funcionário

## Objetivo

Evoluir a tela de detalhes de Cadastros para concentrar ações relacionadas à pessoa/empresa sem duplicar padrões existentes no sistema, mantendo ativação/inativação de usuário apenas nas ações rápidas da listagem e adicionando contatos múltiplos, registros permanentes e uma toolbar alinhada ao padrão visual dos detalhes da OS.

Também corrigir o fluxo de "Acesso ao sistema" do vínculo Funcionário com investigação de causa raiz, preservando a separação entre cadastro da entidade, usuário de autenticação, perfil e vínculo com a organização.

## Escopo

A alteração cobre:

1. detalhes do cadastro;
2. toolbar de ações dos detalhes;
3. contatos múltiplos por cadastro;
4. registros permanentes por cadastro;
5. permissões correspondentes;
6. persistência multiempresa;
7. correção do fluxo de acesso ao sistema do funcionário;
8. reutilização dos padrões visuais e componentes administrativos existentes.

Não faz parte deste escopo criar um novo módulo independente no menu lateral para Contatos ou Registros.

## Regras de negócio

### Ativar / inativar usuário

- O botão `Ativar usuário` / `Inativar usuário` deve ser removido dos detalhes do cadastro.
- Ativação e inativação permanecem disponíveis apenas nas ações rápidas da listagem de Cadastros.
- O fluxo já existente de ativação/inativação continua preservando histórico e vínculos.
- O detalhe do funcionário apenas informa o estado atual do acesso.

### Toolbar dos detalhes

Nos detalhes de um cadastro, a área superior deve seguir o padrão visual já utilizado nos detalhes da OS:

- tags de vínculo (`Cliente`, `Funcionário`, `Fornecedor`);
- divisória visual entre as tags e a toolbar;
- ações compactas e responsivas;
- quebra adequada no mobile sem overflow;
- uso de componentes administrativos compartilhados sempre que já existirem.

A toolbar deve oferecer, conforme contexto e permissão:

- `Contatos`;
- `Registros`;
- `Acessos e permissões` quando o cadastro possuir vínculo Funcionário e usuário associado.

A ação de editar cadastro continua no fluxo existente e não precisa ser duplicada dentro da toolbar se já estiver disponível no rodapé/padrão atual.

## Contatos múltiplos

### Estrutura

Criar uma relação própria de contatos vinculada a `entities`, isolada por `organization_id`.

Tabela sugerida: `entity_contacts`.

Campos mínimos:

- `id uuid`;
- `organization_id uuid`;
- `entity_id uuid`;
- `name text`;
- `role_label text` para função/cargo/identificação do contato;
- `phone text`;
- `whatsapp text`;
- `email text`;
- `is_primary boolean`;
- `is_active boolean`;
- `created_at timestamptz`;
- `updated_at timestamptz`;
- `created_by uuid` quando aplicável.

### Compatibilidade

Os campos atuais de telefone, WhatsApp e e-mail em `entities` permanecem existindo e continuam sendo considerados o contato principal do cadastro para não quebrar:

- Ordens de Serviço;
- Clientes;
- integrações existentes;
- buscas e listagens atuais;
- documentos e impressões que ainda leem os campos diretos da entidade.

Contatos adicionais são armazenados em `entity_contacts`.

Ao exibir contatos, o sistema deve apresentar primeiro o contato principal da entidade e depois os contatos adicionais ativos.

### Comportamento

A tela de Contatos deve permitir:

- listar contatos;
- adicionar contato;
- editar contato;
- ativar/inativar contato adicional sem exclusão física;
- definir um contato adicional como principal quando o fluxo for implementado de forma segura, sincronizando os campos principais da entidade na mesma operação.

Neste escopo, a prioridade é suportar múltiplos contatos sem quebrar o contato principal legado.

## Registros do cadastro

### Estrutura

Criar um histórico próprio de registros vinculados à entidade, separado do histórico da OS.

Tabela sugerida: `entity_records`.

Campos mínimos:

- `id uuid`;
- `organization_id uuid`;
- `entity_id uuid`;
- `created_by uuid`;
- `record_type text` com valor inicial `note`;
- `title text`;
- `content text`;
- `created_at timestamptz`.

Registros manuais não devem ser editados ou excluídos pelo fluxo normal do admin.

### Interface

O visual e comportamento devem reutilizar o padrão do `OrderHistoryPage`:

- página/modal administrativo consistente;
- filtro por usuário;
- filtro por data;
- ordenação crescente/decrescente;
- cards de timeline;
- autor;
- data/hora;
- título/tipo;
- conteúdo;
- botão `Novo registro`;
- contador e limite de texto;
- mensagem de que o registro é permanente.

A implementação deve extrair/reutilizar componentes compartilhados quando isso reduzir duplicação real sem provocar refatoração ampla não relacionada ao escopo.

## Permissões

Adicionar chaves específicas dentro da taxonomia de Cadastros, preservando as permissões atuais de clientes/funcionários.

Chaves propostas:

- `registrations.contacts.view` — visualizar contatos;
- `registrations.contacts.manage` — criar/editar/ativar/inativar contatos;
- `registrations.records.view` — visualizar registros;
- `registrations.records.create` — adicionar registro permanente.

`Acessos e permissões` continua usando as permissões existentes relacionadas a funcionários/funções.

Ativar/inativar usuário continua usando `employees.toggle_active`.

## Multiempresa e segurança

Toda nova tabela deve:

- possuir `organization_id` obrigatório;
- possuir FK para a organização e para a entidade;
- impedir acesso cruzado entre organizações;
- usar RLS compatível com as permissões efetivas do projeto;
- validar que `entity_id` pertence ao mesmo `organization_id` antes de gravar;
- impedir exclusão física dos registros de histórico;
- evitar confiar apenas em filtros do frontend.

As operações de escrita sensíveis devem preferir RPC quando for necessário garantir atomicidade ou validação de vínculo organização ↔ entidade.

## Acesso ao sistema do funcionário

### Arquitetura existente preservada

O fluxo permanece separado em:

1. cadastro da entidade (`entities`);
2. vínculo Funcionário (`employees` / `entity_employee_details`);
3. usuário Supabase Auth;
4. `profiles`;
5. `organization_members`;
6. função/permissões;
7. Edge Function `employee-access` como orquestradora do provisionamento de acesso.

Não criar usuário Auth diretamente pelo frontend.

### Correção do erro de e-mail/senha

A correção deve seguir investigação de causa raiz antes de alterar comportamento.

Devem ser verificados, em ordem:

1. estado enviado pelo `UserAccessSection`;
2. validação de `accessDirty`, e-mail, senha e função em `TabRegistrations`;
3. payload enviado por `saveEmployeeAccess`;
4. resposta HTTP e corpo retornado pela Edge Function `employee-access`;
5. validações de e-mail e senha na Edge Function;
6. `auth.admin.createUser` / `updateUserById`;
7. criação/atualização de `profiles`;
8. criação/atualização de `organization_members`;
9. sincronização com `employees` e `entity_employee_details`;
10. propagação da mensagem real do backend para o toast do frontend.

A UI deve mostrar a mensagem real e útil retornada pelo backend quando disponível, em vez de reduzir todos os erros a uma mensagem genérica da invocação da Function.

### Validações esperadas

Para novo acesso habilitado:

- e-mail obrigatório e válido;
- função obrigatória;
- senha obrigatória;
- senha com mínimo de 8 caracteres;
- mensagem específica para e-mail já cadastrado;
- rollback do usuário Auth recém-criado se etapas posteriores falharem.

Para acesso existente:

- senha em branco mantém a senha atual;
- nova senha, quando informada, precisa ter ao menos 8 caracteres;
- alteração de e-mail deve ser validada;
- regras de proprietário e auto-bloqueio permanecem preservadas.

## Componentes e organização de código

Preferir unidades pequenas e focadas.

Possíveis arquivos novos:

- `src/features/registrations/infrastructure/registration-contacts.repository.ts`;
- `src/features/registrations/infrastructure/registration-records.repository.ts`;
- `src/features/registrations/presentation/RegistrationDetailsToolbar.tsx`;
- `src/features/registrations/presentation/RegistrationContactsPage.tsx`;
- `src/features/registrations/presentation/RegistrationRecordsPage.tsx`;
- hooks específicos em `src/features/registrations/application/` quando necessários.

Arquivos existentes esperados para alteração:

- `src/features/registrations/presentation/RegistrationDetails.tsx`;
- `src/features/registrations/presentation/TabRegistrations.tsx`;
- `src/features/registrations/presentation/RegistrationEditor.tsx` apenas se necessário para o ajuste de acesso;
- `src/features/access/presentation/UserAccessSection.tsx`;
- `src/features/access/infrastructure/user-access.repository.ts`;
- `supabase/functions/employee-access/index.ts`;
- taxonomia/permissões e migrations relacionadas.

Evitar transformar `RegistrationDetails.tsx` ou `TabRegistrations.tsx` em arquivos ainda maiores; novos fluxos de Contatos e Registros devem viver em componentes/repositórios próprios.

## Experiência mobile

A toolbar e páginas novas devem respeitar o padrão responsivo atual:

- botões compactos;
- ícones quando o espaço for limitado;
- sem overflow horizontal;
- suporte a safe-area na parte inferior quando houver toolbar fixa/sticky;
- labels e conteúdo legíveis em cards;
- nenhuma ação importante escondida atrás da barra do navegador móvel.

## Testes e critérios de aceite

A implementação só é considerada concluída quando:

1. os detalhes não exibem mais Ativar/Inativar usuário;
2. ações rápidas da listagem continuam ativando/inativando corretamente;
3. toolbar aparece ao lado das tags com divisória e comportamento responsivo;
4. um cadastro pode ter múltiplos contatos adicionais;
5. contatos não vazam entre organizações;
6. registros podem ser adicionados e consultados por cadastro;
7. registros são permanentes pelo fluxo normal;
8. filtros e ordenação dos registros funcionam;
9. permissões ocultam/bloqueiam ações corretamente;
10. criação de funcionário sem acesso continua funcionando;
11. criação de funcionário com acesso válido cria Auth/Profile/Membership e vínculos corretamente;
12. e-mail inválido apresenta erro específico;
13. senha curta apresenta erro específico;
14. e-mail duplicado apresenta erro específico;
15. falha após criar Auth não deixa usuário órfão;
16. edição de acesso existente sem nova senha mantém a senha atual;
17. build TypeScript/Vite passa sem novos erros;
18. nenhuma regressão é introduzida nos fluxos Cliente/Fornecedor do cadastro.

## Fora de escopo

- excluir fisicamente contatos ou registros;
- transformar contatos em usuários do sistema;
- criar módulo independente de CRM;
- alterar o histórico da OS além de eventual extração de componente reutilizável;
- refatorar globalmente toda a arquitetura de Cadastros;
- mudar a regra de ativação/inativação de usuário já aprovada.
