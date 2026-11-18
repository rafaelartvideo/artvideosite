# Auditoria de desempenho — 18/11/2026 — etapa 1

## Correção comprovada
O sincronizador global criava um temporizador por chave. Quando eventos atingiam uma família e seus detalhes, as invalidações sobrepostas cancelavam/reiniciavam a mesma consulta ativa. Reprodução local com QueryClient/QueryObserver reais: três invalidações sobrepostas iniciavam três execuções; o lote novo inicia uma execução. Isto é uma medição de teste, não uma porcentagem de ganho em produção.

Implementado: janela fixa de 900 ms compartilhada, marcação de caches afetados como desatualizados e um único refetch por consulta ativa no módulo em primeiro plano. Sem novo polling, sem alterar canais, filtros de organização, RLS, aparência ou funcionalidades. Desmontagem cancela o temporizador e descarta a fila.

## Verificação
- Quatro testes novos: reprodução anterior (3 chamadas), correção (1 chamada), módulos inativos/isolamento de clientes e vínculo do temporizador/limpeza.
- npm run test:ci passou (inclui qualidade, telefonia, financeiro, autenticação, OS, WhatsApp, permissões e regressões).
- Builds site e CRM passaram. CRM: index 598,52 kB / gzip 176,18 kB; TabOrders 700,78 kB / gzip 189,59 kB; html2pdf 984,61 kB / gzip 285,64 kB. Sem comparação anterior de bundle: não se alega redução.
- Três leitores de testes passaram a normalizar CRLF: suas verificações permanecem iguais.
- Testes Python locais do agente PABX não são conclusivos no Windows (fcntl ausente; testes de Linux); verificação obrigatória no workflow Linux permanece ativa.

## Diagnóstico econômico Supabase
Projeto wmjmtcjpunmzvonlkjcu: ACTIVE_HEALTHY. Consultas apenas em estatísticas agregadas e catálogo pg_stat_statements (6 linhas), sem logs, dados operacionais, mídias, EXPLAIN ANALYZE ou carga.
Amostra 11:57 UTC: 30 conexões; uma amostra de atividade mostrou 8 ativas e 22 idle. Contadores cumulativos desde 24/07/2026: 8 deadlocks e cerca de 860,8 GB de arquivos temporários. Não são taxas atuais nem atribuíveis à correção.
Top acumulado: realtime.list_changes média 20,31 ms / 5.878.667 chamadas; load_admin_notifications_v1 média 838,93 ms / 54.345; get_sac_digital_unread_counts média 1.875,96 ms / 9.933; my_organization_permissions média 162,10 ms / 31.518; union_whatsapp_inbox_counts média 698,63 ms / 6.320. Estatísticas históricas incluem funcionalidades legadas; não comprovam que todos esses consumidores ainda estejam ativos.

## Cobertura e pendências
Inspecionados cache global, invalidação por rota, isolamento na troca de empresa, notificações, intervalos de WhatsApp/PABX e configuração do deploy. A auditoria completa de cada módulo ainda está pendente. A primeira correção afeta consumidores do sincronizador em OS, estoque, financeiro, PDV, agenda, cadastros e dashboard.
Notificações já usam contingência de 120 s sem polling em segundo plano; não foi aumentado cache de permissões ou dados financeiros. PABX mantém consultas periódicas de autorização; não foram suspensas porque isso exige validar revogação e chamadas ativas. Nenhum serviço reiniciado.
Pendentes: planos SQL das RPCs custosas e índices, comparação atual de latências/p50/p95 e consumo, perfil de renderização por módulo, VPS/WuzAPI/Asterisk e validação completa de fluxos simultâneos. Nenhuma migração ou Edge Function foi modificada ou publicada nesta etapa.
Alterações locais anteriores de diálogos preservadas no stash denominado preserve pending dialog changes before performance audit 2026-11-18; arquivos não rastreados anteriores preservados fora do commit.


# Etapa 2 — requisições concorrentes e estabilidade de acesso

## Falhas reproduzidas e corrigidas
- **PABX:** dois componentes observavam extensões, filas e fluxos e recarregavam o mesmo diretório. Um evento gerava duas revisões; uma rajada de 30 eventos gerava 30 imediatas mais uma atrasada. Agora há um único responsável e uma janela fixa de 500 ms: uma revisão por lote. Mantidos SIP, chamadas, histórico, assinatura do ramal registrado em segundo plano e verificações de autorização.
- **WhatsApp:** conclusão de contadores de uma conta antiga podia liberar a trava de outra conta e sobrescrever seu backoff. A troca de conta também podia não buscar seus contadores. Cada requisição agora tem escopo e identidade próprios. O provider deixa de duplicar a consulta inicial de contadores quando a tela completa já a faz. Preservados a janela de 8 s, o backoff de 30 s, os filtros e os eventos de recebimento.
- **Notificações:** INSERTs e alterações de leitura ocorridos durante uma RPC podiam reutilizar uma resposta iniciada antes do evento, perder popups ou manter contadores antigos. INSERTs e leituras agora compartilham um lote serializado e, quando necessário, uma resposta nova depois da RPC anterior. Continuam exigidas as permissões retornadas pelo servidor, com o mesmo intervalo de contingência e cooldown de falhas.
- **Autenticação/permissões:** o par de eventos de compatibilidade disparava dois bootstraps por alteração de permissões. O par agora é agrupado na mesma microtarefa (duas chamadas passam a uma, sem cache de permissões). Respostas antigas de acesso também podiam encerrar a trava ou aplicar erro de uma recarga mais recente para a mesma pessoa/empresa. A geração da requisição agora protege erro e liberação da trava; falhas atuais continuam bloqueando o acesso.
- **Revisão:** adicionada cobertura para atualização de permissões agendada enquanto uma troca de empresa já começou, mas ainda não terminou; a atualização antiga não deve cancelar a troca. Cobertura de cancelamento de notificações enquanto aguarda outra RPC impede iniciar trabalho depois da desmontagem.

As contagens acima são reproduções determinísticas locais. Não representam percentuais ou latências medidos em produção.

## Banco e limites de segurança desta etapa
Inspecionadas definições atuais das duas RPCs de notificações/contadores WhatsApp, políticas, índices e estatísticas estimadas de apenas três tabelas. O diagnóstico de saúde não apontou avisos. O relatório de desempenho aponta 380 FKs sem índice de cobertura, 165 índices sem uso observado, 35 casos de políticas permissivas múltiplas e um índice duplicado de service_orders. São sinais para investigação, não autorização para adicionar/remover índices em massa. Referência do diagnóstico: https://supabase.com/docs/guides/database/database-linter

As políticas de notificações executam verificações de permissão por linha. A função materializa dados visíveis para produzir lista e contagem. Isso é um candidato a otimização SQL, mas não justifica trocar RLS ou executar varreduras de produção. A RPC WhatsApp já usa contagem agregada com filtros de organização/canal/conta e possui índices correspondentes. Nenhuma política, tabela, migração, Edge Function ou dado de produção foi alterado nesta etapa.

## Cobertura adicional e pendências
Inspecionados os contratos de paginação e carregamento de OS/cadastros, carregamento tardio das rotas, cache, fluxos financeiros e histórico de consultas legadas de SAC. As estatísticas históricas não provam execução atual do SAC. Permanecem para etapas específicas: planos SQL e equivalência em ambiente isolado, custo da RLS, paginação dos históricos extensos, perfil de renderizações dos módulos, observação econômica dos serviços na VPS e comparação p50/p95 com amostra adequada. Não se considera o sistema inteiro auditado apenas porque a suíte passou.


Na validação autenticada anterior ao segundo deploy, a lista de OS carregou 499 registros totais (paginados), com avisos de lista/referências lentas e erro de referências no console; notificações também registraram contingência após falha. O Financeiro exibiu skeleton inicialmente e depois carregou seu resumo. Não se atribuiu causa ou ganho a essa observação sem rastreamento de rede suficiente. Estatísticas acumuladas de SQL do Financeiro: dashboard média 231,77 ms/máxima 6.652,51 ms; cash-flow média 187,69 ms/máxima 5.698,44 ms; foundation média 172,89 ms/máxima 3.344,02 ms. São estatísticas históricas, não duração ponta a ponta nem p95.


## Validação da segunda etapa
A revisão independente reproduziu as duas condições de navegação citadas acima; ambas receberam testes que falharam antes da correção e passaram depois. Validação final após incorporar a nova main 4b5b6d224 (verificação de números nos cadastros): npm run test:ci, 940 testes: 939 aprovados, um teste dependente de ferramenta indisponível ignorado, zero falhas. Os testes adicionais de autenticação entram permanentemente em test:performance/test:ci; as novas regressões de PABX entram na seleção automática de telefonia. Não se alteraram gates de publicação. Os builds e o deploy são conferidos separadamente antes de declarar publicação.

Builds finais do site e CRM concluídos com sucesso sobre essa mesma base. Testes Python específicos do agente PABX continuam dependentes do Linux no workflow.


# Etapa 3 — confirmações de entrega/leitura do WhatsApp

A função union-whatsapp-webhook publicada (v48) foi lida e comparada com o repositório antes de editar: conteúdo idêntico. A gravação de recibos repetia UPDATEs de estados já entregues/lidos, gerando WAL e eventos sem mudança de informação. O filtro anterior de entregas também excluía estados NULL por semântica SQL.

Correção: o UPDATE agora seleciona atomicamente apenas transições válidas: NULL/sent para delivered e NULL/sent/delivered para read. Replay não volta a gravar a mesma linha; um delivered atrasado não rebaixa read. Permanecem os seis filtros de organização, canal, conta, conversa, direção e IDs do lote. Não foi adicionada consulta preliminar nem cache de recibos. Autenticação HMAC/token, verify_jwt existente e tratamento de mensagens não foram alterados.

Duas regressões executam o bloco real de UPDATE com semântica de filtros avaliada na execução. Antes da correção, o caso delivered falhava ao avançar NULL e o replay concorrente de read fazia 8 gravações em vez das 3 transições elegíveis. Depois, o mesmo lote faz somente 3; os próximos replays não fazem gravações. É um teste controlado local, não teste de carga ou concorrência no banco de produção. Revisão independente aprovada. Testes completos: 942 casos, 941 aprovados, um teste FFmpeg indisponível ignorado, zero falhas.

Frontend da etapa 2: commit 109260ff073028551130fdd44505d3106c84b00a publicado por FTPS no CRM e site; execução https://github.com/rafaelartvideo/artvideosite/actions/runs/44307089595 com os passos Publish via FTPS confirmados como sucesso. PABX abriu após recarregar a versão publicada; OS exibiu os dados paginados atuais. Não foi iniciada chamada nem enviado atendimento.

Também foram lidos somente os metadados de cron.job: nove agendamentos ativos, sem duplicação evidente nas configurações. Nenhum foi alterado. Auditoria local da ponte WuzAPI identificou oportunidades pendentes de confirmar/deployar na VPS: coalescer/bounded cache de contatos, deduplicar downloads simultâneos de mídia e confirmar necessidade da assinatura HistorySync. Não se reiniciaram serviços nem se consultaram logs históricos. Essas melhorias da ponte ainda não foram implementadas/publicadas.


Antes do commit da etapa 3 foi incorporada a main 814f0cd04, que introduz o chat completo de rascunho antes do primeiro envio. O único conflito ocorreu nas regressões adicionadas ao fim do mesmo arquivo; preservados os dois conjuntos. O teste anterior de não criar protocolo ainda esperava controles removidos por essa mudança. Foi alinhado ao rascunho novo, mantendo as verificações de envio explícito, mensagem não vazia, nenhum start no componente de rascunho, confirmação do provedor antes do protocolo e chave de idempotência. Os 42 testes desse arquivo passaram depois da reconciliação; a suíte completa é repetida sobre a base final.

Validação final da etapa 3, já incorporando também a correção de testes bafb845cd da main: 943 testes, 942 aprovados, um FFmpeg indisponível ignorado, zero falhas. Builds site e CRM concluídos com sucesso sobre os mesmos arquivos de aplicação (a atualização bafb845cd alterou somente testes).
