# Fiscontrole — fundação do módulo Fiscal

## Escopo desta entrega

Adaptador server-side em `supabase/functions/_shared/fiscal/fiscontrole-provider.mjs`, sem endpoint público, sem migration, sem UI e sem alteração do ambiente de produção. Utiliza token de sessão fornecido por uma futura camada de credenciais. Não constitui uma autorização de acesso: o serviço chamador deverá resolver empresa, ambiente, usuário e permissões no servidor antes de qualquer chamada. Não importar no frontend nem repassar payloads arbitrários recebidos do navegador.

Contrato de referência: documentação Fiscontrole fornecida em 27/11/2026, incluindo a seção Emissão, cancelamento e carta de correção. A base de leitura continua /app/api/v1; a base de emissão é /app/api/v1/emissao-api/v1. Não confundir IDs de documentos capturados com UUIDs do módulo de emissão.

## Segurança operacional

- Todas as escritas fiscais são bloqueadas por padrão; a opção de homologação é exclusiva de um futuro serviço autorizado. Escritas de produção permanecem bloqueadas mesmo com essa opção ligada.
- Nenhuma operação externa é acionada implicitamente; issue, event e process_pending exigem confirmação no chamador. O contrato de issue/event exige chave de idempotência persistida; o adaptador não cria chaves ou repete chamadas.
- Erros de comunicação em mutações são tratados como incertos. Antes de qualquer repetição, reconciliar o rascunho/operação, mantendo o ID e chave original.
- A função de autorização recebe um objeto normalizado pelo futuro serviço. O esquema exato de detail e do protocolo precisa ser validado em homologação; não interpretar HTTP 200 ou processed:true como autorização.
- Não usar credencial de serviço isolada para emissão; login/token e manifestação têm contratos distintos.
- Não persistir ou registrar segredos em logs, nem retornar respostas brutas contendo dados fiscais sem controle de acesso.

## Conta fiscal compartilhada e liberação multiempresa

A contratação atual informada suporta até seis CNPJs por conta Fiscontrole. Esse valor é configurável por conta, nunca um limite global de empresas da Union World. A Artvideo é a única empresa autorizada para a implantação inicial; nenhuma outra empresa recebe acesso por padrão. Não há ativação real nesta entrega: o ID interno, o CNPJ e o ID externo da Artvideo ainda precisam ser verificados e vinculados em ambiente seguro.

A conta do provedor pertence à administração da plataforma. Cada vínculo fiscal pertence a uma empresa CRM e identifica seu CNPJ e ID externo autorizado. A mesma conta pode atender diversas empresas; credenciais e a lista completa de empresas do provedor não serão expostas aos usuários dos tenants. O inventário de CNPJs cadastrados/reservados no provedor, incluindo os não vinculados ao CRM, deve ser reconciliado antes de admitir novas empresas. Desativar acesso ao módulo não libera automaticamente uma vaga no contrato. A configuração deve permitir outras contas, limites e provedores no futuro.

A política pura server-side `account-policy.mjs` valida capacidade configurada por conta, conflitos de CNPJ/ID externo e acesso por empresa. É apenas uma fundação testável: não substitui autenticação real, RLS, permissões, persistência, locks transacionais ou auditoria. O serviço futuro deverá obter os dados exclusivamente de registros confiáveis, revalidar o inventário e reservar capacidade atomicamente por conta (evitando corrida pela última vaga), verificar titularidade e correspondência do CNPJ com o ID externo antes de vincular, e resolver o escopo em todas as operações, inclusive workers, downloads, filas e sincronização. Não disponibilizar listagem global de empresas do provedor aos tenants. A troca de provedor ou transferência de vínculo exige fluxo explícito, auditado e proteção dos documentos históricos.

A administração central deve poder habilitar/desabilitar o módulo por empresa, separadamente de permissões dos operadores e da autorização de emissão em produção. Empresas sem acesso não visualizam a navegação nem conseguem invocar o backend. O primeiro vínculo será Artvideo; as outras vagas não devem criar empresas fictícias nem autorizar acesso automaticamente.

## Verificação

`npm run test:fiscal` usa fetch simulado e não realiza chamadas externas. Também foi incluído em test:ci. Não substitui testes de contrato reais nem validações do autorizador.

## Próximas fases obrigatórias antes de disponibilizar o módulo

1. Mapear permissões e empresa ativa no CRM; definir vínculo entre empresa interna, CNPJ e ID externo. Criar armazenamento seguro das credenciais/sessões e regras de RLS. Revisar migrations e testar num ambiente separado.
2. Criar serviço autorizado com schemas estritos por operação, verificação de capacidades via bootstrap, controle de revisão e persistência de chaves, filas e estados. Nunca aceitar empresa/ambiente definidos pelo browser como autoridade.
3. Sincronizar documentos v2 com cursor isolado por empresa/conta/modelo/filtros, verificar sha256 e salvar XML original em storage privado. Parser XML seguro, deduplicação entre emissão e captura, eventos e conciliação.
4. Integrar configurações e telas fiscais ao design existente; permissões independentes para visualizar, emitir, cancelar, corrigir e conciliar.
5. Vincular OS, estoque, financeiro e cadastros sem gerar duplicidade de receitas/despesas/estoque. Autorizar emissão separadamente de pagamentos e baixas financeiras.
6. Confirmar contratos completos de NFS-e/NFC-e, cobertura municipal e Emissor Nacional, regras de perfis fiscais, impostos calculados pelo provedor e manutenção dessas regras. Não criar alíquotas arbitrárias.
7. Validar em homologação por empresa e modelo, incluindo timeout, rejeição e autorização/cancelamento/CC-e. Não emitir em produção sem aprovação específica, auditoria e liberação por empresa.

Rollback desta fundação: reverter seus commits. Não há mudanças no banco nem deployment nesta etapa.

## Reaproveitamento da NFS-e existente

A auditoria da main encontrou `src/features/nfse`, `docs/nfse-stage1.md` e as quatro tabelas existentes `fiscal_company_settings`, `fiscal_service_mappings`, `fiscal_documents`, `fiscal_document_items` no CRM. O módulo legado usa chave `nfse` e possui rascunhos de OS; as constraints bloqueiam emissão real. A navegação já contém uma regra que oculta a rota nfse. Não remover ou duplicar a estrutura de rascunhos; estender as tabelas existentes mediante migrations revisadas. Não relaxar constraints até que o fluxo de emissão seja homologado. Antes da liberação, revisar acesso a rotas/RPCs legadas e migrar permissões sem conceder acesso a empresas não autorizadas.

`fiscal_captured_documents` é um índice técnico de arquivos originais capturados, não uma segunda entidade de faturamento. O mesmo documento autorizado deve ser reconciliado com `fiscal_documents` antes de participar de indicadores ou gerar vínculos comerciais. A NFS-e capturada pode usar identificador interno; não igualar IDs de captura com UUIDs de emissão.

## Captura incremental e API de leitura

- `sync-worker.mjs`: página limitada, cursores independentes por filtros, verificação SHA-256, gravação original antes da persistência, revalidação de escopo e detecção de conflitos.
- `supabase-sync.mjs`: adaptador para o cliente privilegiado do Supabase, storage privado e RPC transacional. Não há agendamento nem função de worker publicada.
- `fiscal-read/index.ts`: endpoint autenticado de status e consulta paginada de metadados capturados; exige usuário ativo, vínculo ativo, módulo explícito `fiscal`, permissão `fiscal.documents.view`, CNPJ do cadastro da organização, inventário verificado e conta ativa. O vínculo é resolvido pelo servidor. Não retorna credenciais, inventário global nem caminhos de storage. Não realiza emissão.
- A função fica bloqueada por padrão via `FISCAL_READ_API_ENABLED`. O cadastro do módulo e permissões e o fluxo administrativo ainda não foram publicados.
- SQL em `docs/fiscal/sql` é uma proposta, não migrations registradas: executar em banco descartável/staging e revisar antes de transformar em migration. Inclui conta/vagas/vínculos, captura e commit transacional, bucket privado com políticas restritivas. Nenhum desses scripts foi aplicado.

A captura pode deixar objetos privados órfãos se a transação falhar; a repetição usa caminho determinístico e verifica bytes existentes. Criar política de reconciliação/retenção antes de qualquer limpeza. Não usar exclusão automática de arquivos fiscais.
