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


# Etapa 4 — ponte WuzAPI e experimento SQL isolado

## Correção da ponte
O cache de diretórios de contato retinha objetos completos sem limite ou expulsão, e consultas simultâneas da mesma sessão baixavam o diretório repetidamente. Implementado compartilhamento de requisições em andamento por empresa/conexão/token (chave SHA-256, sem tokens legíveis no cache), TTL de cinco minutos, LRU de 64 diretórios e orçamento estimado de 8 MiB de dados retidos. Permanecem apenas os campos de nome usados na apresentação. Erros não entram no cache; diretórios acima do orçamento são utilizados para a resposta atual sem serem retidos.

Reprodução: 20 consultas simultâneas passaram de 20 downloads do provedor para um. Testes cobrem falha compartilhada/repetição, expiração, expulsão, orçamento, concorrência na rotação de token e isolamento. A revisão encontrou que slice de um nome enorme podia reter a string original: a reprodução mantinha 25.228.416 bytes após GC. A cópia agora destaca os mesmos caracteres UTF-16, incluindo substitutos isolados na borda de 160 caracteres. Esse limite é uma estimativa do cache retido, não limite de memória total/transitória da resposta do provedor.

Preflight autenticado da VPS: serviço union-wuzapi-bridge ativo, código SHA-256 18ceee8c0d47c07599736779b8c7dae5daec5365ef279523f937278bcba4dfb9 idêntico à base do repositório, zero conexões HTTP estabelecidas na porta 19080 na amostra. MemoryCurrent 64.815.104 bytes. Containers WuzAPI e bancos estavam ativos; amostra de CPU abaixo de 1%. Não se executou varredura de contatos, mensagens ou mídias para validar a otimização. Publicação é verificada separadamente, com hash, backup, sintaxe e retorno da API local.

## SQL/RLS: alternativas testadas e rejeitadas
Foram criados ambiente e dados sintéticos locais, sem conexão com produção. Duas alternativas de materialização da RPC de notificações passaram por 1.440 comparações de resultado JSON sob políticas de RLS, mas apresentaram regressões de desempenho em parte dos cenários. A busca tardia de payload repetiu RLS em históricos pequenos; manter o payload anterior e estreitar só a etapa autorizada aumentou leituras temporárias em históricos maiores. Metadados grandes com TOAST também não significaram automaticamente cópia grande de payload.

Por isso, nenhuma dessas alternativas foi aplicada ao banco. Os experimentos e a forma de reprodução estão em supabase/tests/notification-payload-materialization.md, .mjs e -fixture.sql. Usam PostgreSQL 18.6/WASM/PGlite 0.5.16 e helpers sintéticos simplificados: não são tempos ou p95 de produção PostgreSQL 17. A reprodução de 100 registros também foi executada pelo coordenador. Nenhuma RLS, permissão, migração ou função de produção foi alterada nesta etapa.

## Validação
Revisão independente aprovada depois de corrigir a retenção de strings. Suite completa: 963 testes, 962 aprovados e um FFmpeg indisponível ignorado, sem falhas. Builds site e CRM passaram; a alteração final da ponte é Node e não altera os arquivos de aplicação desses builds. A cópia anterior de alterações locais dos diálogos permanece preservada no stash, fora das entregas.


# Etapa 5 — fechamento da cobertura e correções adicionais

- **Mídia WhatsApp:** downloads simultâneos idênticos agora compartilham uma promessa pendente na ponte, depois de autenticação e validação de cada solicitante. A chave SHA-256 inclui empresa, conexão, token e todos os campos normalizados enviados ao provedor. Até 128 operações são rastreadas; excesso segue sem cache, sem bloquear recursos. Nenhuma mídia fica em cache depois da resposta. Regressões provam 20 downloads antes e um depois, isolamento, diferenças de payload, falha/repetição, validação de CDN, saturação e liberação das respostas.
- **Agenda:** navegação mensal fazia Jan31+1 virar março e Mar31-1 continuar em março. Agora limita o dia ao último válido do mês de destino, incluindo anos bissextos. Atualização funcional também acumula cliques rápidos sem perder movimentos; modos diário/semanal foram preservados.
- **Loja:** pedidos recentes eram combinados aos 2.000 itens mais antigos da empresa. Agora os itens, entregas e suportes pertencem somente à janela de até 500 pedidos selecionados, com paginação completa e filtros de IDs em lotes limitados. Testes incluem 2.100 itens históricos e 2.401 atuais com limite simulado de 73 linhas por resposta. Eventos, retorno ao foco e contingência compartilham uma consulta em andamento com reconciliação final; desmontagem cancela e não aplica respostas antigas.
- **Clientes compartilhados entre empresas parceiras:** a lista legada baixava todo o índice de clientes/endereço em cada página/filtro, dependendo do limite de resposta do servidor. A nova RPC invoker retorna apenas IDs da página (até 100) e total exato, mantendo a consulta de detalhes filtrada por empresa. Preservados filtros literais por nome/documento e estado/cidade, inclusive endereços distintos, e ordenação natural portuguesa. A lista principal Cadastros usa TabRegistrations e não foi trocada por essa RPC. A migração valida os recursos ICU com valores constantes antes de expor a função; não faz backfill nem altera RLS.

O teste antigo que exigia ficha parcial de Cadastros foi alinhado à decisão já existente na main (3b1cdfe5a) de preparar a ficha completa. As novas verificações exigem isolamento da empresa no cache, ausência de placeholder parcial no detalhe e espera dos dados vinculados; o teste passou a integrar a suíte padrão.

## Cobertura por módulo
| Área | Verificação realizada | Limite da conclusão |
|---|---|---|
| Home/Dashboard | Contratos de queries condicionais, carregamento tardio e navegação | Sem teste de carga multioperador em produção |
| OS/retornos/orçamentos | Paginação, referências, regressões de regras e navegação | Não se criaram/alteraram OS reais para testes |
| Cadastros/clientes | Filtros, ordenação, RLS invoker, amostra sintética 1.213 linhas e UI principal | Lista compartilhada validada em fixture; cadastro principal preservado |
| Atendimentos/WhatsApp | Recebimento, contadores, recibos, nomes, mídia e limpeza de componentes | Não se enviaram mensagens nem baixaram mídias reais para amostragem |
| PABX | Assinaturas, diretório, autorização, histórico, cenários automáticos e abertura do painel | Não se originaram chamadas reais |
| Estoque/produtos | Paginação, filtros com debounce, permissões e regressões de movimentos | Escala real dos resumos agregados não foi testada por carga |
| Financeiro/relatórios | Paginação, gates de permissão/período, agregações e regressões financeiras | Não se efetivaram transações financeiras reais |
| PDV/vendas | Bootstrap por empresa, busca/histórico paginados e limpeza de teclado | Não se concluíram vendas reais |
| Agenda | Janela limitada, escopo por usuário/empresa, eventos e bordas de calendário | Sem reagendamento de compromissos reais |
| Configurações/loja | Janela de pedidos, filhos completos, concorrência e cancelamento | Testes de grande histórico feitos em dados sintéticos |
| Site público | Rotas tardias, consultas compartilhadas, limpeza de listeners/carrosséis e build | Não se varreu catálogo/mídias de produção |

## Medições exploratórias
A amostra inicial está em docs/auditoria-navegacao-2026-11-18.json. Tempos incluem a automação até o conteúdo visível, com sessão autenticada e cache progressivamente aquecido. Não são duração isolada de RPC nem Web Vitals. Cinco visitas por módulo significam que p95 é o maior valor observado; não estabelece SLA ou capacidade. Não foi forçado logout de operadores nem ampliado tráfego para fabricar uma amostra de login/p95 representativa. Não se deduz redução causal de tempo a partir de visitas com caches distintos.

| Módulo | n | p50 inicial (ms) | p95 inicial (ms) |
|---|---:|---:|---:|
| Home | 5 | 689 | 1226 |
| OS | 5 | 1013 | 2564 |
| Financeiro | 5 | 1153 | 3967 |
| Estoque | 5 | 713 | 1659 |

Validação integrada local final: 993 testes, 991 aprovados, duas limitações ignoradas (FFmpeg ausente e ordenação ICU nativa indisponível no motor SQL local). A lógica SQL sintética foi executada; a migração inclui guarda atômica para provar a ordenação nativa antes da publicação. Os builds site e CRM passaram. Revisão independente não encontrou pendências nos quatro grupos de correção.

# Fechamento de publicação — 19/11/2026

Código integrado à main em 65ee09682ccbbc7e091eb7eda6770af7a3537a79, preservando os 41 commits mais recentes de grupos WhatsApp. Revisão independente confirmou que a única diferença da ponte frente à main remota era o compartilhamento de downloads de mídia. Validação integrada: 994 testes, 992 aprovados, zero falhas e dois ignorados pelas limitações locais já descritas; site e CRM compilados com sucesso. Os testes Linux de provisionamento PABX permanecem obrigatórios na publicação.

**Supabase:** migração customers_exact_filtered_page aplicada como 20261118225700. A guarda ICU passou no PostgreSQL de produção: Empresa 2 precede Empresa 10, Álvaro/alvaro equivalem na ordenação, e o filtro João/joao continua distinguindo acentos. Sete constantes sintéticas produziram a mesma ordem ascendente/descendente de Intl em JavaScript. SECURITY INVOKER confirmado, execução permitida a authenticated e negada a anon; chamada autenticada para organização inexistente retornou página vazia em transação revertida. MD5 do corpo da função 1674f43fe7d0de9487756d04e5c2b54d, idêntico ao arquivo versionado. Nenhum cliente real criado ou alterado. A Edge Function union-whatsapp-inbox v107 está ACTIVE e seu index.ts é idêntico ao código integrado; não precisou de outra publicação.

**VPS:** a versão encontrada em 19/11 correspondia ao commit remoto 9143af853, já com grupos. A versão integrada foi aplicada após conferir ausência de conexões HTTP na ponte e estabilidade do processo, com validação de sintaxe e hash do arquivo publicado. SHA-256 ativo: c4f7b8f58fbd41310c9b29493e5d787d949f6af94479834c42707182b5fafa5f. Backup: /opt/union-wuzapi-bridge/server.mjs.before-media-singleflight-20261119T104229Z. Somente union-wuzapi-bridge.service foi reiniciado; saúde local respondeu 401 sem autenticação, conforme contrato, em 0,130 s após iniciar a troca. Serviço ativo, PID 218386. WuzAPI, bancos, RabbitMQ e Redis continuaram ativos há duas semanas. Não se baixaram mídias nem diretórios reais para diagnóstico. Memória fria de 17.625.088 bytes não permite inferir redução percentual. O script update-groups.sh também passa a apontar à versão integrada para não restaurar acidentalmente a ponte anterior.

O primeiro bloqueio de hash no preflight ocorreu pela diferença CRLF/LF entre checkout Windows e blob Git: nenhum arquivo ativo havia sido alterado. Confirmada igualdade do download ao blob publicado e ao checkout normalizado antes da instalação.

**HostGator:** execução https://github.com/rafaelartvideo/artvideosite/actions/runs/44508065872 concluída com sucesso. Conferidos testes, builds e os dois passos Publish via FTPS (CRM e site), ambos sucesso na primeira tentativa; fingerprints publicados vinculados a 65ee09682. Não foi apenas um commit verde.

**Navegador:** sessão autenticada recarregada após FTPS; Home, OS, Financeiro e Estoque chegaram ao conteúdo esperado nas 20 visitas. Agenda abriu e navegou novembro/dezembro/novembro sem editar agendamentos. A primeira validação de pedidos revelou uma regressão introduzida nesta etapa: o efeito novo utilizava activeOrganization.id, mas o contrato real tem organization_id. O helper recebia undefined e devolvia lista vazia sem erro, enquanto a aba contava sete pedidos. Corrigidos carga, dependências, Realtime e filtro de retirada para activeOrganizationId com fallback organization_id. Um teste executa as declarações de autenticação e o efeito reais, com objeto sem .id: falhou antes e passou após a correção. A reprodução anterior com mocks do helper isolado não cobria essa integração.

| Módulo | p50 anterior (ms) | p95 anterior (ms) | p50 após 65ee09682 (ms) | p95 após (ms) |
|---|---:|---:|---:|---:|
| Home | 689 | 1226 | 939 | 1704 |
| OS | 1013 | 2564 | 1188 | 1924 |
| Financeiro | 1153 | 3967 | 861 | 1956 |
| Estoque | 713 | 1659 | 1005 | 1024 |

Cinco visitas por módulo em dias e condições de cache/rede diferentes: resultados mistos, sem conclusão causal de ganho ou regressão de latência. Esses quatro módulos não foram alterados diretamente nesta última leva. Os ganhos comprovados são as reduções de requisições nos testes reproduzíveis e a correção dos defeitos descritos. Dados brutos preservados no JSON da auditoria.

**Limites restantes:** não se mediu novo login frio, perfil de renderizações React/heap de cada tela, capacidade multioperador ou p95 representativo. Não se fizeram vendas, pagamentos, ligações, envios de mensagens ou alterações de OS reais. Alternativas SQL de notificações foram rejeitadas por regressões em experimentos; alertas de índices não justificaram alterações em massa. Não se declara capacidade de carga validada a partir destes testes. Alterações antigas de diálogos continuam preservadas em stash fora da main, sem mistura com a auditoria.

Validação após a correção do contrato de empresa: 995 testes, 993 aprovados, zero falhas, dois ignorados pelas limitações já descritas. Builds site/CRM passaram novamente. Revisão independente aprovou o contrato, os filtros e os schemas das consultas auxiliares. Atendimentos abriu após recarregar a publicação, sem enviar mensagens nem consultar diretórios ou mídias para diagnóstico.
