# Consultas, paginação e fila de webhook — 21/11/2026

## Revisão e evidências

Revisados os repositórios de OS, a camada de consultas do WhatsApp, o webhook, a Edge Function de atendimentos, políticas RLS, índices, a ponte e o ambiente VPS. Buscas estáticas por laços/await foram usadas como triagem, não como prova de N+1. Joins PostgREST das OS e consultas em lote de atribuição do WhatsApp já evitam a leitura individual de um registro por linha; loops de escrita/geração de documentos não foram rotulados automaticamente como N+1 de leitura.

Somente metadados e estatísticas agregadas do Supabase, sem varredura de logs ou histórico de mensagens. Snapshot 17:38:41 UTC: 25 conexões; contadores históricos não representam incidentes atuais. Entre as duas leituras desta auditoria, get_sac_digital_unread_counts permaneceu em 9.933 chamadas e consulta sac_digital_protocols em 7.877: zero incremento observado. Não remover código atual por interpretar acumulados antigos como tráfego novo.

Foram confirmados índices de mensagens por conversation_id/sent_at/id, protocolos por conversation_id/opened_at/id e caixa por organização/canal/conta/status. O histórico principal de mensagens já usava keyset. A caixa com páginas numeradas e filtros conserva seu contrato; não foi alterada arbitrariamente para rolagem infinita.

Um EXPLAIN ANALYZE limitado à empresa Teste e ao usuário autorizado, com statement_timeout de cinco segundos e sem escrita, mostrou índice usado, três linhas e 73,596 ms de execução. As políticas repetem helpers de conta/permissão por linha. É um candidato real para otimização com uma matriz de autorização completa; esta rodada não substitui RLS nem introduz cache Redis de permissões. Não há comprovação de eliminação de todo N+1, timeout ou gargalo do sistema.

## Alterações aplicadas

- Anexos do perfil do WhatsApp: OFFSET substituído por cursor composto sent_at/id, 24 itens e uma linha adicional para detectar próxima página. Filtros por empresa, canal, conta, conversa e categoria preservados. Mesmo índice existente atende à ordenação. UI envia o cursor retornado e continua deduplicando itens por ID; nenhum catálogo/histórico inteiro é antecipado.
- Receptor assíncrono independente na VPS: HMAC original validado antes de aceitar, payload AES-256-GCM no Redis e encaminhamento somente ao endpoint Supabase fixo. Sem chave de banco instalada no servidor. ACK202 somente após a gravação da fila; falha de persistência responde503 para o provedor repetir.
- BullMQ5.81.6 fixado com lockfile, quatro partições por canal, uma entrega ativa por partição. Redis exclusivo sem rede TCP, socket privado, AOF/appendfsync always, noeviction128MB/container512MB. Limite suave64MB e admissões serializadas reservam memória de processamento; leitura HTTP limitada a oito requisições. Não reutiliza Redis Zappro ou RabbitMQ.
- Trabalho concluído perde seu conteúdo e conserva só marcador de entrega. Retries não repetem uma entrega cujo marcador já foi persistido. Falhas são mantidas, indicadas em health503, reativadas por replay autenticado ou pelo comando local de recuperação. Doze tentativas com espera limitada30s por ciclo. Até500 pendentes/falhados por partição. Instância única, disco local e tentativas atrasadas continuam sendo limites; não se promete entrega exatamente uma vez ou alta disponibilidade.
- Ponte aceita ativação explícita UNION_WUZAPI_WEBHOOK_QUEUE=1; padrão do código continua direto para facilitar rollback. Três canais conectados foram configurados após o teste da empresa Teste. GET /webhook do provedor confirmou a URL da fila em todos. Não houve logout, QR, reinício do motor WhatsApp, dos bancos, Zappro, Redis antigo ou PABX; apenas a ponte foi reiniciada e nginx recarregado após nginx-t.

## N+1 de gravação de documentos

Foi identificado e corrigido também savePrintTemplate: para N seções selecionadas, eram N inserts de seção e N inserts de campos, em sequência. Agora IDs UUID das seções são gerados localmente e os filhos usam esses IDs, permitindo um insert de seções e um de campos. Três seções passam de seis gravações filhas para duas; a gravação do cabeçalho e a remoção das seções anteriores ao editar permanecem necessárias. Ordem por catálogo, posição dos campos, empresa, layout e normalização de assinaturas preservados. Erro no lote de seções impede gravar filhos. Sem nova permissão ou migração. Não foi transformado o salvamento inteiro em uma transação; a limitação anterior entre etapas continua explicitada.

Dois testes executam o repositório real com a infraestrutura de rede simulada, verificando quantidade de chamadas, vínculos UUID, ordenação, organização e propagação de falha. Revisão independente verificou PK/FK/trigger de empresa e aprovou. Nenhum modelo real foi alterado pela validação automatizada.

## Validação real na VPS

Redis8.10.1 por digest de imagem já presente na VPS. Antes de migrar callbacks, integração real verificou: AOF e fsync, trabalho preservado após reiniciar só o Redis novo, payload liberado após sucesso, falha e replay no BullMQ fixado, recusa sob OOM real e aceitação após restaurar limite. Fila sintética isolada removida ao final. Teste de restart/pressão agora exige flag explícita de standby e não deve rodar com canais já migrados.

Sonda HTTPS UnionProbe autenticada: ACK202 em60ms e encaminhamento concluído; outra sonda184ms. Não escreve conversa ou mensagem. São observações locais da VPS, não p95 nem latência ponta a ponta de um usuário.

Evento sintético autorizado exclusivamente na empresa Teste, contato identificado Auditoria técnica — fila, ID AUDITQUEUEA3226A84098F482B8EBFF81A4F3EDDCE: dois envelopes diferentes com o mesmo ID de provedor, ACK61ms e16ms, ambos processados. Consulta pontual confirmou **uma mensagem e unread_count1**. Nenhuma mensagem foi enviada ao WhatsApp externo. Conversa sintética f39bffff-c8e6-4230-8845-d04928544d70 mantida para conferência.

Após rollout: quatro eventos aceitos/concluídos, zero pendências/falhas naquele instante; requisição sem assinatura recebeu401; serviço ativo, memória aproximada40,5MB. Redis sem portas publicadas e rede Docker none. Uptime dos containers anteriores permaneceu47horas. Isso não substitui acompanhamento de uso real em períodos de pico.

## Operação, implantação e limites

Runbook e rollback em services/union-whatsapp-webhook-queue/README.md. Backup nginx: /etc/nginx/conf.d/union-wa.conf.before-async-20261121T175336Z. Ponte e arquivo privado: sufixo before-async-20261121T175611Z na própria pasta. Nenhum segredo foi incluído no Git ou nos relatórios. Não apagar fila/AOF para liberar espaço.

Sem alterações de schema, migrações ou Edge Functions nesta rodada; webhook Supabase existente preservado. Supabase Realtime continua atualizando o CRM; adicionar outro WebSocket na VPS duplicaria o caminho sem ganho comprovado. Pooler transacional não é utilizado porque as chamadas deste serviço são HTTP/PostgREST e não conexões diretas Postgres. Cache de contatos/mídias existente permanece limitado e escopado; não foi acrescentado um cache Redis sem requisito de compartilhamento/invalidação.

Suíte local final incluindo lotes de documentos:1.054 testes,1.052 aprovados,dois ignorados,zero falhas. Última verificação focada: oito testes aprovados; qualidade e ambos os builds passaram. Revisão independente identificou problemas de retenção/replay, corrigidos e verificados em Redis real. Publicação main/HostGator e conferência no navegador serão registradas após a conclusão.

Pendentes: otimizar helpers RLS com regressões de autorização; distinguir as duas leituras de detalhes após criar OS; ampliar coleta passiva com contextos equivalentes. Não se removeu atualização em tempo real nem validação comercial para aparentar rapidez. Stashes e arquivos locais anteriores continuam preservados fora da entrega.

Fontes técnicas: [BullMQ em produção](https://docs.bullmq.io/guide/going-to-production), [conexões BullMQ](https://docs.bullmq.io/guide/connections), [persistência Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/), [conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Proteção adicional de indisponibilidade

O consumidor trata ok:true/ignored:inactive_channel como falha recuperável. A fila preserva e repete o evento em vez de confirmar entrega durante uma desconexão temporária. O descarte de mensagens anteriores a outro pareamento continua decidido pelo webhook para não misturar contas. Regressão falhou antes da guarda e passou depois; apenas o novo serviço de fila foi reiniciado com backup do módulo, sem tocar nos canais/motor.

## Publicação e conferência final

Fila, ponte e keyset em main 9a66cf626ad3b5af18ebccc9f04489c37cb80089, execução 44933483270 com ambos FTPS concluídos. Gravações em lote dos documentos em main f531e0ab2ff8127eb26dabedd68d3bdb538a6e27, execução https://github.com/rafaelartvideo/artvideosite/actions/runs/44934000580: testes, builds, site e CRM publicados com sucesso na primeira tentativa. Logs Sync complete e fingerprints publicados confirmados para ambos os destinos.

No navegador autenticado de Rafael Gestor, empresa Teste, mensagem de auditoria apareceu uma única vez. Abas Mídias/Documentos/Links consultaram a conversa e exibiram vazios corretos sem erro ou download. Depois da publicação, foi criado pela interface o modelo **inativo** Auditoria Performance 2026-11-21 — Lotes, ID 9e6c8f64-59b5-4447-9b55-a2f6a905c753. Reabertura preservou nome do cliente, prioridade e equipamento; consulta pontual confirmou is_active=false, três seções e três campos na ordem customer.full_name/order.priority/equipment.general. Nenhum modelo anterior foi alterado. Evidências de tela permanecem locais.

A guarda de canal inativo foi aplicada separadamente ao consumidor VPS com backup; nova sonda autenticada respondeu 202 em 110 ms e concluiu. Saúde final sem trabalho pendente ou falhado. A configuração dos três callbacks permaneceu na fila. Esta guarda só muda o serviço VPS, não exige republicação da interface ou Edge Function.

Suíte final após a guarda: **1.055 testes, 1.053 aprovados, dois ignorados por ambiente e zero falhas**. Hash SHA256 do consumidor core.mjs na VPS e no arquivo local conferido: f2c02c1b98831969bcd91427ec7ce4212f31bde64d778b74982857f3cf59aa25. Sessão SSH de auditoria encerrada.

## Leitura WhatsApp: autorização por conjunto

Migração 20261121182420_whatsapp_read_scope_sets aplicada separadamente no projeto Supabase wmjmtcjpunmzvonlkjcu. Substitui chamadas correlacionadas por linha nas duas policies SELECT por conjuntos independentes da linha. Helpers privados STABLE com search_path vazio consultam permissões atuais pelos helpers canônicos existentes; não usam cache Redis, variáveis de sessão persistentes ou metadados editáveis do usuário. Preservados fallback de plataforma, conta conectada/pareada, atribuição, encaminhamento, filas, departamentos e participantes. Policies de escrita não foram alteradas. Reversão manual das duas policies originais em 2026-11-21-whatsapp-read-scopes-rollback.sql.

Comparação antes/depois por quantidade e MD5 dos IDs ordenados, exclusivamente na empresa Teste, com papel authenticated: seis usuários existentes e um usuário inexistente, todos idênticos. Gestores mantiveram 3 conversas/35 mensagens; operador restrito 2/26; controle sem acesso 0/0. Também verificadas equivalências dos helpers antigos/novos para capacidades de leitura e contas visíveis; JWT sem sub não recebeu contas, organizações ou conversas. Troca autorizado → inexistente → sem sub → autorizado na mesma transação não reaproveitou o conjunto de outro ator. Nenhuma permissão ou dado comercial foi modificado nesses testes.

Plano EXPLAIN ANALYZE limitado à contagem de três conversas Teste: índice union_whatsapp_paged_inbox_idx preservado; Function Scan e ProjectSet dos conjuntos com loops=1. Execução observada anterior 73,596ms, posterior 23,407ms; buffers 1.621/1.755, planejamento 14,569/3,405ms. Cache aquecido e amostra unitária impedem tratar a diferença como percentual garantido ou p95. O ganho confirmado é retirar a repetição dos helpers por linha; os conjuntos ainda têm custo inicial e consultam contas acessíveis em outras empresas do próprio usuário.

Proprietário postgres, SECURITY DEFINER restrito ao schema private, anon sem EXECUTE, authenticated com EXECUTE, RLS habilitada e roles/comando das policies preservados. Advisor de segurança executado após aplicação, sem apontamento sobre os novos helpers; avisos gerais preexistentes de outras funções/segurança não foram alterados. Revisão independente comparou as definições ao vivo antes da aplicação e não encontrou bloqueador.

Suíte local após esta migração: **1.057 testes, 1.055 aprovados, dois ignorados por ambiente, zero falhas** (validation-whatsapp-read-scopes-ci.log), incluindo duas regressões de estrutura e limites de autorização. Validação funcional principal feita no banco com os sete atores, sem varredura de logs ou histórico massivo. Builds da interface já passaram para a última alteração de frontend; esta migração só altera banco/testes/documentação.
