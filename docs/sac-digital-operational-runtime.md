# SAC Digital na Union: operação de conversas

O runtime ativo contém apenas Conversas, Clientes e Grupos do WhatsApp.
Contatos e grupos são consultados somente ao abrir suas respectivas seções.
O navegador recebe um catálogo reduzido com nove contratos de leitura; o
catálogo completo de 92 endpoints permanece preservado no servidor.

As telas legadas de configurações, menus, histórico administrativo de envios,
SMS, campanhas, etiquetas, carteira de clientes, cupons, serviços e demais
recursos não são importadas pelo aplicativo ativo. A antiga rota de integrações
redireciona para o SAC operacional. Os arquivos legados permanecem no repositório.

A política compartilhada `supabase/functions/_shared/sac-runtime.mjs` bloqueia
as ações extras na API antes de consultas ao banco ou chamadas ao fornecedor.
Callbacks SMS ou desconhecidos recebem ACK e são ignorados antes de persistência
ou processamento. O callback legado de menus retorna indisponibilidade sem
consultar banco ou fornecedor. Reativação exige uma alteração explícita no código.

Credenciais existentes, autenticação, canais e templates necessários ao envio,
vínculo do operador, controle de protocolos, recebimento de webhooks, leitura de
histórico/anexos e reconciliação de conversas continuam ativos. São dependências
da operação solicitada, não telas administrativas adicionais. A sincronização
automática consulta somente contatos e protocolos. Nenhum dado foi excluído.

Validação: 99 testes, build do CRM e navegador isolado com três seções, chamadas
somente aos endpoints 2 e 42 ao abrir Clientes/Grupos, nenhuma chamada de
configurações e nenhum erro de página. Verificação SQL somente de leitura:
zero menus legados ativos e zero jobs SMS pendentes. Não foram enviadas mensagens
a clientes durante os testes.
