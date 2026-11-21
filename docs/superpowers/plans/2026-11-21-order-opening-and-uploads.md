# Abertura antecipada e criação de OS

Pedido: antecipar trabalho útil antes de abrir módulos e reduzir espera ao criar OS, preservando regras e custos.

1. Antecipar somente código de OS na Home, após autenticação/acesso resolvidos, com módulo/permissão habilitados, em tempo ocioso, uma vez por montagem. Não antecipar RPCs de referências (incluem catálogos), históricos ou mídia. Respeitar Save-Data, conexão lenta, aba oculta e cancelamento.
2. Substituir uploads sequenciais apenas no caminho de nova OS atômica por dois trabalhadores no máximo. Em erro, parar novas tarefas e aguardar as que já começaram antes de limpar as mídias. Preservar ordenação, IDs já existentes, idempotência e confirmação transacional. Conexão restrita conserva um trabalhador.
3. Testar concorrência real com promessas controladas, falha com outro upload pendente, limpeza/ordenação e cancelamento do prewarm. Integrar às regressões existentes, rodar qualidade/CI/builds, publicar main e verificar FTPS e abertura do formulário sem criar OS real.
