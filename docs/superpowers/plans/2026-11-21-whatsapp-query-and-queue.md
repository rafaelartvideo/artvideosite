# Revisão de consultas e webhook

1. Auditar estatísticas agregadas, índices e fluxos reais sem consultar logs massivos; distinguir acumulados de tráfego atual.
2. Trocar OFFSET de anexos por cursor sent_at/id e proteger respostas tardias por conversa; preservar navegação numerada onde necessária.
3. Preparar receptor assíncrono dedicado na VPS com BullMQ fixado, Redis isolado por socket e AOF, payload cifrado, HMAC antes da fila, quatro partições com processamento serial, limite de memória e retry limitado com falhas retidas. Sem chave de banco no servidor. Confirmar enfileiramento antes do ACK; falha de Redis responde 503.
4. Validar receptor com evento UnionProbe autenticado, rollback e saúde. Só então mudar os callbacks dos canais sem logout/reconexão.
5. Não adicionar pooler a clientes HTTP/PostgREST nem substituir Realtime por outro WebSocket. Cache de permissões não será introduzido sem invalidação segura.
6. Testes locais, revisão independente, deploy separado VPS/Edge quando necessário e main/HostGator com verificação final.
