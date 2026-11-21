# Fila de entrada WhatsApp na VPS

O WuzAPI entrega ao receptor HTTPS, que valida a assinatura original e persiste o trabalho cifrado no Redis antes de responder 202. BullMQ encaminha o evento ao webhook Supabase existente, preservando conteúdo e HMAC. Isso retira o processamento do banco do caminho do ACK; não elimina as consultas que a ingestão precisa fazer.

## Isolamento e limites

- Redis exclusivo, imagem local inspecionada e fixada por digest; nenhum Redis/RabbitMQ anterior é reutilizado.
- Socket Unix com diretório 0700, rede Docker `none`, nenhuma porta Redis publicada. Receptor somente 127.0.0.1:19081; nginx publica exclusivamente o caminho POST de webhook, nunca `/health`.
- AOF com `appendfsync always`, `noeviction`, limite Redis 128 MB/container 512 MB. Admissões serializadas param em 64 MB, reservando espaço para concluir trabalhos. Até oito requisições em leitura e 500 trabalhos pendentes/falhados por partição.
- Quatro partições por hash do canal, uma entrega por partição, máximo de quatro requisições simultâneas ao Supabase. Tentativas atrasadas podem ser ultrapassadas; ID do provedor e relógio do webhook continuam necessários para idempotência/ordenação lógica. Não é garantia de entrega exatamente uma vez.
- Doze tentativas, espera crescente limitada a 30 s. Falhas esgotadas permanecem armazenadas e fazem `/health` responder 503. Uma repetição autenticada do mesmo evento reativa o trabalho falhado; `retry-failed.mjs` permite recuperação local de até 50 por partição.
- Após confirmação Supabase, o conteúdo é substituído por `{delivered:true}`; até mil marcadores/partição são mantidos por no máximo um dia, com limpeza oportunista do BullMQ. Nenhuma credencial de banco é instalada na VPS. A chave da ponte protege HMAC e AES-256-GCM; não a altere enquanto houver trabalhos cifrados pendentes sem preparar migração/drenagem.
- Instância única e disco local: não há replicação Redis nem alta disponibilidade entre servidores. Falha de disco/host permanece um risco operacional. A fila pode acumular trabalho; acompanhar o estado local e o espaço em disco continua necessário.

## Implantação

1. Executar `install.sh` como root de uma release revisada. O instalador exige a imagem Redis já inspecionada nesta VPS e o Node isolado da Union, não altera callbacks ou nginx e recusa sobrescrever instalação existente.
2. Antes de receber tráfego real, executar `UNION_QUEUE_STANDBY_TEST=1 node integration-check.mjs` usando o Node isolado. O teste reinicia **somente** o novo Redis e aplica pressão temporária nele; nunca rodar depois do rollout dos canais. Verifica AOF, restart, liberação de payload, replay, recusa por OOM e recuperação. Trabalhos sintéticos usam fila `union-audit-<uuid>` e são removidos ao final.
3. Inserir `nginx-location.conf` no server HTTPS existente de `wa.unionworld.com.br`, guardar backup, executar `nginx -t` e recarregar somente após validação.
4. Executar o Node isolado com `--env-file=/opt/union-wuzapi-bridge/.env probe.mjs <canal>`; somente `UnionProbe`, sem criar mensagens/conversas. Exigir ACK 202 e conclusão do trabalho.
5. Atualizar a ponte com backup e definir `UNION_WUZAPI_WEBHOOK_QUEUE=1` no arquivo privado dela. Reiniciar só a ponte, aguardar o endpoint sem assinatura retornar 401, então executar `configure-channel.mjs <canal> <empresa>` com o mesmo `--env-file`.
6. Começar pela empresa Teste; verificar GET `/webhook` no WuzAPI local sem imprimir seu conteúdo/credenciais. Testar evento sintético apenas nessa empresa, repetir ID e confirmar uma única mensagem antes de mudar os demais canais. Não é preciso desconectar ou ler QR.

## Operação e retorno ao caminho direto

Consultar `http://127.0.0.1:19081/health` somente na VPS. O retorno contém contadores agregados, sem mensagens ou tokens. Para reprocessar falhas após resolver a causa, executar `retry-failed.mjs` na pasta da instalação usando o Node isolado. Não apagar jobs, volume ou arquivos AOF para liberar espaço.

Para retornar ao webhook direto, definir `UNION_WUZAPI_WEBHOOK_QUEUE=0`, reiniciar apenas a ponte, aguardar 401 no endpoint local e executar `configure-channel.mjs` para cada canal já migrado. Confirmar o callback direto, deixar a fila existente drenar e preservar seu volume. Não reiniciar WuzAPI, banco, Redis antigo, Zappro ou PABX. Backups da configuração nginx, arquivo da ponte e `.env` são mantidos localmente, com segredos restritos à VPS.

Pooler transacional não se aplica às chamadas HTTP/PostgREST deste serviço, que não abre conexões Postgres. O Realtime Supabase continua responsável pelas atualizações do CRM; não se adiciona outro WebSocket nem cache de autorização com permissões potencialmente antigas.

Referências: [produção BullMQ](https://docs.bullmq.io/guide/going-to-production), [conexões BullMQ](https://docs.bullmq.io/guide/connections), [persistência Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/), [conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).
