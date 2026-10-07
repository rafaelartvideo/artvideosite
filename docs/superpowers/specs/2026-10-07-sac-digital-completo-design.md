# SAC Digital completo na Union World — especificação
Data: 07/10/2026. Estado: proposta para revisão; implementação ainda não iniciada.

## Objetivo e limite da entrega
Concluir o módulo SAC Digital de ponta a ponta, usando a auditoria de 92 endpoints como matriz de cobertura. A entrega abrange os fluxos de atendimento e todos os demais recursos publicados, organizados em áreas próprias. A Union deve administrar essas ferramentas e as empresas parceiras devem acessá-las conforme os módulos liberados e as permissões de seus usuários.

“Completo” significa interface utilizável, operação autorizada no backend, persistência/reconciliação quando necessária, tratamento de falhas e evidência de teste. Um wrapper genérico ou um botão sem fluxo funcional não constitui entrega. Recurso que exige módulo do fornecedor não contratado permanece identificado como indisponível na conta, sem fingir sucesso.

Nenhuma implantação ou envio a cliente ocorreu na preparação desta especificação. Durante implementação, usar fixtures e destinatários explicitamente de teste; não realizar campanhas, SMS, chamadas, envios ou finalizações em registros reais para validar o trabalho.

## Base verificada
- Repositório: rafaelartvideo/artvideosite, main no commit 00da4846069a3eddbefd4d25d134666ca3b27e90. A árvore consultada não contém AGENTS.md.
- Relatório de entrada: Auditoria_API_SAC_Digital_Alertrack.html, 34 itens principais, 91 subseções, 92 endpoints. Referências numéricas abaixo são as fichas desse relatório.
- Projeto Supabase do CRM: wmjmtcjpunmzvonlkjcu, rafaelartvideo's Project, ativo. Foi consultado diretamente pelo identificador do código; a listagem resumida das conexões não o apresentou.
- sac-digital-api v40, sac-digital-webhook v7 e sac-digital-media v1 estão ativos. O conteúdo implantado de sac-digital-api coincide integralmente com o arquivo do commit auditado.
- O banco já possui contatos, integrações, mensagens, vínculos de operadores, inícios de conversa, leituras, protocolos e eventos do SAC. As oito tabelas públicas SAC observadas têm RLS habilitada.
- pg_cron 1.6.4 está presente; pgmq e pg_net não foram encontrados na consulta de extensões. O desenho usa tabelas duráveis existentes/novas, sem depender da instalação de uma nova extensão.
- Hoje existem 15 rotas externas utilizadas. O backend fixa /v2/client, inclusive em fluxos operacionais. Os problemas de importação, limite de mídia, ausência de notification_id e atualização de status continuam presentes.
- O push em main aciona o deploy HostGator sem exclusão de docs. Preparação documental não deve provocar build/deploy da aplicação. Alterações de produto serão reunidas em uma entrega verificada.

## Escolha de arquitetura
Três caminhos foram considerados:
1. Acrescentar todos os ramos à função monolítica atual. Resolve rapidamente pequenos casos, mas repete seleção, validação, paginação e tratamento de estado, agravando a manutenção.
2. Preservar as telas e tabelas existentes, extrair adaptadores e serviços por responsabilidade e acrescentar os fluxos ausentes. Escolha recomendada: permite corrigir o atendimento primeiro e expandir sem reescrever o CRM.
3. Recriar todo o módulo. Introduz migração e regressões maiores sem necessidade identificada; não é a escolha proposta.

O desenho segue o segundo caminho. As áreas compartilham um cliente SAC com contratos explícitos, duas modalidades de autenticação e uma matriz de capacidades. Nenhum endpoint arbitrário fornecido pelo navegador é encaminhado ao fornecedor: somente ações permitidas e rotas cadastradas.

## Componentes e responsabilidades
| Componente | Responsabilidade e interface |
|---|---|
| Cliente HTTP SAC | Base /v2, método/path definidos por catálogo, Bearer no servidor, JSON válido, timeout, erros tipados e validação de resposta por operação. |
| Sessão Gestor | Catálogos, importação, protocolos de autoatendimento, notificações e recursos administrativos. Cache por empresa; credencial fora do frontend. |
| Sessão Operador | Autenticação do operador vinculado ao usuário, seleção e operações por protocolo. Cache e isolamento por empresa/usuário/operador/versão do vínculo. |
| Serviço de atendimento | Decide modalidade a partir de estado confirmado no SAC; assume, direciona, transfere, envia e finaliza com a rota correspondente. |
| Serviço de contatos/canais | Pesquisa paginada, normalização de número, perfil, edição, enriquecimento e seleção de canal ativo compatível. |
| Ledger de envios | Registra cada tentativa/intenção, notification_id ou message_id, modalidade, estado, correlação e erro; diferencia fila de entrega. |
| Sincronização | Bootstrap paginado, cursores, histórico atual/anterior, reconciliação incremental e deduplicação. |
| Ingestão de eventos | Valida origem configurada, grava evento durável, responde ao fornecedor no prazo e agenda processamento idempotente. |
| Worker | Processa eventos/jobs com lease, retomada, limites por empresa e erros recuperáveis. waitUntil acelera; não é a única garantia de continuidade. |
| Áreas de recursos | Telas específicas para contatos, respostas rápidas, etiquetas, grupos, campanhas e demais capacidades da matriz. |
| Menus externos | Callback configurável e autenticado, com fontes de dados da Union explicitamente permitidas e respostas validadas. |

Dividir arquivos novos por esses limites. Manter a função sac-digital-api como entrada autenticada e roteadora compatível com as ações existentes, sem expandir indefinidamente o arquivo de mais de 3.000 linhas. Compartilhar tipos/validadores de protocolo, mídia, estado e erro entre frontend e backend quando o runtime permitir.

## Autenticação, autorização e concorrência
- Resolver o usuário pelo JWT Supabase no servidor, confirmar organização ativa, módulo habilitado e permissão da ação. Não aceitar user_id/operator_id arbitrários do navegador como autorização.
- Reutilizar sac_digital_operator_links. Uma sessão operacional só pode usar o operador vinculado àquele usuário na empresa. Alterar o vínculo invalida a sessão correspondente.
- Separar token Gestor de token Operador. Não trocar somente /client por /operator usando o mesmo token.
- O fluxo de login de Operador é ambíguo no documento: Authorization Code na introdução, password/operator_id e scopes ou scope nos exemplos. Essa compatibilidade deve ser validada com o fornecedor ou por autenticação controlada sem operação de negócio. Falha de autenticação não autoriza fallback de envio para uma rota incorreta.
- Scopes mínimos por capacidade, mantendo o comportamento atual até haver comprovação de que a redução não impede operações legítimas. manager não é padrão silencioso de nova configuração.
- A seleção do protocolo é estado externo. Operações concorrentes do mesmo operador precisam de serialização compartilhada entre instâncias, por lease durável: selecionar e executar dentro da mesma operação coordenada, renovar/expirar lease e liberar após resultado. Um Map local não resolve concorrência entre workers.
- Refresh de token considera erro documentado e resposta real. Repetição de mutação após timeout de resultado desconhecido só ocorre depois de reconciliar; não enviar duas vezes automaticamente.
- Preservar administração da Union e controles internos por cargo; não conceder todas as ações às empresas parceiras.

## Atendimento: comportamento resultante
| Situação | Operação e regra |
|---|---|
| Contato sem protocolo, envio inicial | Notificação contact ou direct conforme existência do contato. Pode ficar na lista como conversa pendente até existir protocolo real. |
| Protocolo de autoatendimento aberto | Envio pelo Gestor /client/protocol/send. Direcionamento inicial por /client/contact/forward. |
| Protocolo operacional disponível | Selecionar por /operator/att/select/{protocol} antes de operar. |
| Protocolo operacional selecionado | Envio por /operator/att/send/{protocol}, legenda caption, operador autenticado. |
| Transferência operacional | Usar /operator/att/operators e /departments para opções disponíveis; executar /operator/att/forward/{protocol}. |
| Encaminhar para recados | Permitir /client/protocol/to_inbox somente no autoatendimento. |
| Finalização | Gestor DELETE /client/protocol/finish quando aplicável; Operador PATCH /operator/att/finish com nota conforme contrato validado. Não provocar aviso ao cliente em testes. |
| Protocolo encerrado | Preservar histórico. “Iniciar novo atendimento” recupera/direciona contato ou notifica; não inventa reabertura do mesmo ID. |

Interface preserva lista de conversas com busca, filtros, não lidas, status, operador/departamento e scroll independente. Ações são disponibilizadas conforme estado e permissão confirmados. Falhas externas mantêm a mensagem/intenção visível com possibilidade de recuperação adequada, sem limpar o texto digitado nem mostrar falso sucesso.

Nova conversa aceita número ainda ausente do CRM e da SAC. Não exige cadastro local antes de iniciar o fluxo. Normaliza DDI/DDD sem alterar telefone cadastrado do cliente; variantes brasileiras com/sem nono dígito são de consulta, sem tentar números locais fora do contrato. “Validação inconclusiva”, “número sem WhatsApp”, “canal inativo” e “contato existente” são estados diferentes.

Canal ativo precisa ser escolhido antes da importação/notificação. Callcenter utiliza canal secundário. WhatsApp Cloud API utiliza template aprovado quando exigido, com variáveis e prévia compreensível. Não contornar regra de validação com texto livre. error_valid_wpp não elimina a tentativa que usa o canal correto.

## Mensagens, mídia e status
Suportar texto/link, imagem, áudio, vídeo, arquivo, localização e contato/vCard. Incluir legenda apropriada à modalidade, visualização/download, reprodução de áudio/vídeo, horários e rolagem para a mensagem atual.

Limites do Gestor: imagem 1 MB, áudio 3 MB, vídeo/arquivo 5 MB. Frontend e backend validam o mesmo tipo/limite. O teto operacional precisa de confirmação porque a seção só publica size_url; não declarar 25 MB como suportado. Não depender de data URL/base64 não documentado.

Servir mídia por URL acessível pelo fornecedor, com validade suficiente e isolamento por empresa. Preferir URL temporária ou proxy autorizado ao projetar retenção; não remover arquivos de conversas existentes nem tornar novos dados públicos por conveniência. Limpeza deve ser agendada e observável, não depender de um novo envio. Nenhuma limpeza de dados existentes é parte desta preparação.

Persistir notification_id e message_id reais. request_id serve à auditoria técnica. A interface distingue preparando, em fila, enviada, entregue, lida, falha e resultado desconhecido somente quando há evidência para a transição. Retorno 200/aceite de fila não prova entrega. /notification/status acompanha a fila; status de histórico já indexado deve ser atualizado sem regredir uma evidência mais recente.

Manter um ledger por envio, mesmo que a conversa pendente seja agrupada por contato. O upsert atual por empresa/contato não pode apagar o registro da tentativa anterior. Reenvio de mensagem operacional utiliza ID e rota própria; retry de notificação não equivale a resend de mensagem.

## Sincronização e eventos
- Importar todos os protocolos e contatos necessários ao módulo, paginando até conclusão com checkpoint e limite de chamadas. Catálogos de operadores também devem percorrer todas as páginas.
- Filtros da caixa combinam consulta local paginada e atualização do SAC; não apresentar apenas eventos recentes como uma lista completa.
- /client/protocol/messages representa um protocolo. /operator/att/historic cobre protocolos anteriores com permissão e término historic_complete. Identificar esses dois históricos na implementação.
- Preferir IDs SAC para deduplicação. Fallback de hash é versionado e conservador; mensagens idênticas próximas não são automaticamente o mesmo envio.
- Webhook grava evento durável e agenda trabalho antes do ACK de sucesso. Trabalho de enriquecimento e histórico ocorre depois. Recuperação deve funcionar após queda da instância.
- Usar event_id do fornecedor se existir; na ausência, hash canônico do payload mais identidade/tipo/tempo conhecidos. Não usar somente formatação bruta do JSON para deduplicar.
- Projetar os oito eventos documentados: protocol_opened, protocol_finished, protocol_in_att, protocol_forward, protocol_new_message, protocol_new_inbox, contact_new e smsideal_reply. Evento SMS atualiza o módulo de SMS quando habilitado.
- Em mídia com legenda, classificar mídia antes de text. Aplicar guardas de atualização por tempo/versão para não regredir atendimento encerrado por evento antigo, preservando mensagens tardias legítimas.
- Realtime Supabase atualiza a interface por organização. Mensagens enviadas por outro operador e status externos exigem fonte externa: WebSocket do Operador com eventos validados ou reconciliação incremental limitada.
- Não prometer evento de saída/entrega/leitura pelo webhook quando ele não está documentado. O catálogo WebSocket completo precisa ser obtido do fornecedor. Um relay server-side evita expor token de Operador ao navegador.
- Reconexão WebSocket usa backoff, retoma reconciliação e respeita limite do runtime. Não manter conexão sem plano de recuperação.
- Evitar consulta de todo histórico por cada evento; agregar jobs por protocolo e cursor. Preservar dados entre retomadas; limite do fornecedor é 1.000 requests/min, sem tratar esse teto como meta.
- Auditoria registra empresa, ação, rota sem query sensível, HTTP/type/correlation e resultado. Não registrar token, senha, telefone ou conteúdo integral das conversas em logs operacionais.

## Dados propostos e compatibilidade
Reutilizar contatos, protocolos, mensagens, leituras e vínculos existentes. Acrescentar estrutura para ledger de envios, estado de sessão/capacidade, checkpoints de sincronização e jobs com lease/tentativas/resultado. Catálogos remotos recebem cache por empresa com expiração; campanhas e outros recursos só são persistidos quando houver necessidade de consulta, rastreamento ou edição.

Todas as entidades têm organization_id, chaves externas textuais e índices conforme filtros reais. Aplicar RLS e grants mínimos. Credenciais e tokens ficam em esquema privado/Vault; metadados públicos não carregam segredo. Funções privilegiadas têm escopo explícito e execução restrita.

Migrações são aditivas; preservam mensagens, protocolos, clientes e configurações. Não truncar, sobrescrever empresas, aplicar exclusões em lote ou alterar a identidade de protocolos antigos. SQL de mudança é revisável no Studio, conforme o fluxo usado no projeto. Validar o schema efetivo antes de aplicar migração para evitar duplicar alterações já implantadas.

## Cobertura funcional de toda a documentação
| Área | Fichas da auditoria | Fluxo exigido na Union |
|---|---|---|
| Gestor | 01 | Configurar/testar autenticação, credenciais protegidas e diagnóstico. |
| Contatos | 02–11 | Listagem/busca/paginação, perfil, protocolos, mídias/status, edição, enriquecimento, importação e direcionamento. |
| Recados | 12–13 | Caixa de recados e detalhes reais da SAC. |
| Canais e Enterprise | 14–15 | Canais ativos, modalidade e templates aprovados/variáveis. |
| Departamentos/operadores/monitores | 16–18 | Catálogos completos, vínculos e disponibilidade quando aplicável. |
| Grupos de contatos | 19–22 | Listar grupos/membros, vincular e remover vínculo com permissão. |
| Campanhas | 23–26 | Listar, resumo, mensagens, criar broadcast/status com validação, filtros e prévia. Tipo grupos em desenvolvimento não oferecido como funcional. |
| Etiquetas | 27–29 | Catálogo, vincular e remoção com a semântica publicada; não simular remoção de uma tag quando a rota remove todas. |
| Protocolos Gestor | 30–38 | Carga/busca/detalhes/mensagens/observações, envio de autoatendimento, recados e finalização. |
| Notificações | 39–41 | Contato existente/número novo, fila e status por notification_id. |
| Grupos WhatsApp | 42–44 | Grupos, participantes e histórico paginado. Não inventar envio a grupo nesta área. |
| Cupons | 45–47 | Catálogo, códigos/contatos e marcação de uso. |
| SMSIDEAL | 48–49 | Envio para contato/número, rota de serviço/flash e respostas recebidas. Sem disparos de validação a clientes reais. |
| Produtos SAC | 50–51 | Categorias/produtos do fornecedor; não confundir com o estoque Union. |
| Correios | 52–53 | Vincular código a contato e consultar rastreamento. |
| Portabilidade | 54 | Consultar operadora/portabilidade por número. |
| Agendamento | 55 | Consulta por operador, período e página. |
| Carteira de clientes | 56–58 | Consulta, vínculo e desvínculo por operador. |
| Telefonia | 59–60 | Ramais e solicitação de chamada após contrato validado, com disponibilidade do módulo. |
| Login Operador | 61 | Sessão do operador correto e diagnóstico sem exposição de token. |
| Perfil | 62–64 | Perfil, apelido, disponibilidade/motivo e módulos habilitados. |
| Respostas rápidas | 65–67 | Listar/cadastrar/remover e inserir no compositor; validar grafia/prefixos antes de certificar. |
| Recuperação | 68–70 | Últimos, busca e recuperação de contato, mantendo histórico anterior. |
| Atendimento operacional | 71–92 | Acesso/fila/seleção; protocolo/contato/mensagens/histórico; envio/consulta/reenvio; observações; grupos; etiquetas; opções de operadores/departamentos; transferência; edição; finalização com nota. |
| WebHook | Contrato reverso | Os oito eventos, ACK, processamento durável, saúde e recuperação. |
| WebSocket | Contrato reverso | Atualização externa com catálogo de eventos confirmado e reconciliação após desconexão. |
| Menus personalizados | Contrato reverso | Configuração, callback GET/POST conforme integração, parâmetros/menus/retornos validados e fontes de dados da Union explicitamente permitidas. |

As áreas adicionais usam o padrão de navegação, busca, paginação e modais do CRM. “Todas as ferramentas” não significa expor uma tela de HTTP/JSON ao usuário. A área administrativa mostra capacidades ativadas na SAC e permissões da Union; recurso indisponível explica a dependência do fornecedor, sem ocultar silenciosamente a existência da capacidade.

## Contratos incompletos: decisão de implementação
A auditoria identificou 89 endpoints sem schema de resposta completo. Não preencher esses contratos com tipos inventados nem certificar um parser apenas porque ele compila.

Cada adaptador terá schema tolerante a extensões, mas rigoroso nos campos necessários à ação. Resposta inesperada gera diagnóstico recuperável; não vira objeto vazio de sucesso. Fixtures iniciais registram os exemplos publicados e payloads controlados/redigidos obtidos em consultas autorizadas. Mutações sem exemplo exigem validação em ambiente/destinatário de teste antes de serem marcadas como verificadas.

Pontos específicos que precisam de confirmação:
- Login Operador: Authorization Code versus password, scopes versus scope.
- Produtos: /products/cat/all sem /client.
- Respostas rápidas: /answers/all e /answers/add sem /operator; quick_anwser versus quick_awnser.
- Busca de protocolos: posição/serialização de filter e body dos filtros.
- Grupos WhatsApp: p versus page.
- vote número versus string; limites numéricos de mídia do Operador.
- Telefonia: contact/extension versus operator/contact e resposta ausente.
- protocol_forward com event incorreto no exemplo e catálogo de eventos WebSocket.
- Tipos/IDs/respostas de listagem, envio, notificações e histórico que não têm schema formal.

A funcionalidade final pode ficar indisponível pela configuração externa, mas sua lógica e tratamento devem estar implementados e testados. Um contrato ambíguo ainda sem validação é dependência real de conclusão, não motivo para afirmar 100% de funcionamento.

## Frentes de entrega e dependências
1. **Atendimento e novas conversas:** cliente HTTP, sessão Gestor/Operador, seleção/transferência/envio correto, canal, importação, templates e limites de mídia. É a primeira frente por corrigir os erros atuais.
2. **Integridade e atualização:** ledger/status, bootstrap/paginação/histórico, jobs duráveis, projeção dos oito eventos, tempo real e recuperação.
3. **Operação cotidiana:** contatos/edição/enriquecimento, recados, respostas rápidas, observações, etiquetas, grupos, perfil e carteira.
4. **Todos os demais recursos:** campanhas, grupos WA, cupons, SMS, produtos SAC, Correios, portabilidade, agendamento, telefonia e menus.
5. **Verificação e implantação:** matriz dos 92 contratos, regressões de permissão/multitenancy, checks do CRM, atualização coordenada de funções/banco/frontend e relatório de resultado.

Cada frente pode ter tarefas independentes depois do plano detalhado, mas sessão/contrato e persistência vêm antes de telas consumidoras. Ao final, a matriz registra cada ficha como implementada, validada, indisponível por conta ou pendente de contrato externo, com evidência. Não encerrar a entrega após apenas a primeira correção.

## Critérios de aceitação
1. Nova conversa com número ausente da SAC/CRM segue pelo canal correto e aparece na caixa com estado verdadeiro, sem bloqueio por exigência de cadastro local.
2. Callcenter usa canal secundário; validação inconclusiva não equivale a número sem WhatsApp.
3. Operador pode assumir/selecionar, enviar todos os tipos, transferir e finalizar conforme disponibilidade/permissão.
4. Protocolo fechado não recebe envio pelo endpoint de autoatendimento; novo atendimento preserva o ID e histórico anteriores.
5. Limites de mídia são consistentes em todas as entradas, inclusive envio pela OS; legenda e download/reprodução funcionam.
6. notification_id persiste por envio; consulta de status atualiza a interface e mensagens já indexadas, sem inventar entrega/leitura.
7. Dados existentes no painel SAC entram pelo bootstrap, inclusive páginas além da primeira; histórico anterior carrega até término permitido.
8. Respostas pelo painel externo aparecem na Union sem botão Atualizar; reconexão recupera alterações perdidas.
9. Eventos duplicados, JSON com ordem diferente e eventos fora de ordem não duplicam mensagens nem regressam estado. Mídia com legenda aparece como mídia.
10. ACK webhook respeita 20 segundos em teste medido; jobs persistem/reprocessam após interrupção.
11. Nenhum usuário atua como operador ou em empresa alheios; mudanças de vínculo/empresa invalidam a sessão apropriada.
12. Union dispõe das áreas administrativas, com permissões por usuário e liberação controlada às parceiras.
13. Todas as fichas 01–92 têm fluxo correspondente ou dependência externa explicitamente comprovada; não há botões simulados como sucesso.
14. Nenhum teste faz disparo real, exclusão destrutiva ou finalização de atendimento real. Fixtures cobrem erros e estados antes de teste controlado.

## Verificação prevista
Testes focados de contratos e domínio: modalidade de rota, seleção concorrente, canal Callcenter, nono dígito, fila/status, parsing inválido, paginação, histórico, mídia/legenda, eventos duplicados/fora de ordem e isolamento entre organizações. Testes SQL de RLS/RPC quando houver schema novo. Typecheck e build CRM uma vez ao fechar a entrega, ampliando somente por falha ou mudança nova. Não repetir builds integrais a cada ajuste.

Validação operacional posterior usa conta/canal/destinatário de teste explicitamente definidos. Consultas sem efeito de negócio podem validar catálogos/contratos; envio, campanha, SMS, chamada, remoção e finalização não são executados em clientes reais. Monitorar saúde das funções e eventos após deploy sem varredura desnecessária de logs.

## Fontes
- Documentação Alertrack: https://alertrack.docs.apiary.io/#introduction/codigos-de-respostas
- Auditoria entregue nesta conversa: Auditoria_API_SAC_Digital_Alertrack.html.
- Repositório no commit verificado: https://github.com/rafaelartvideo/artvideosite/tree/00da4846069a3eddbefd4d25d134666ca3b27e90
- Metadados/schema/funções do projeto Supabase consultados em 07/10/2026, somente leitura.
- Supabase Background Tasks: https://supabase.com/docs/guides/functions/background-tasks — waitUntil não bloqueia resposta e continua sujeito aos limites do runtime.
- Supabase Queues: https://supabase.com/docs/guides/queues — opção de fila durável com pgmq. Como a extensão não está instalada no projeto, a proposta não depende dela.
