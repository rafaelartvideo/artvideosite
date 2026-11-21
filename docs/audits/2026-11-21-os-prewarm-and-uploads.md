# Abertura de módulos e criação de OS — 21/11/2026

## Diagnóstico

A navegação já antecipava código por hover/foco. A primeira entrada em OS ainda dependia de carregar seu módulo. Referências de OS já têm cache de React Query, mas a RPC reúne catálogos e várias configurações: antecipá-la indiscriminadamente elevaria consultas, I/O e transferência. Não foi criado prefetch de dados.

No caminho de criação atômica, fotos novas eram enviadas sequencialmente antes da RPC. Sem fotos, a criação já usa uma única função transacional; não se removeu validação ou confirmação para aparentar rapidez.

## Alterações

- Home autorizada pode antecipar o código de OS e suas dependências após acesso resolvido e conteúdo principal presente, sem consultas monitoradas pelo React Query em andamento e somente quando o navegador oferecer pelo menos 8 ms ociosos. O estado das consultas é conferido novamente no callback. Não há polling ou prazo que force o download em momento ocupado.
- O observador de aquecimento só é montado na Home. Permissão orders.view e módulo orders devem estar habilitados. Mudança de rota/contexto cancela o agendamento pendente. Código já iniciado pelo import nativo não é cancelável, mas é reutilizado nas próximas aberturas.
- Save-Data, 2G/3G, offline e aba oculta evitam antecipação. Navegadores sem requestIdleCallback continuam usando a abertura normal. Hover/foco também respeitam essas restrições. A antecipação é de melhor esforço e pode ser descartada quando o navegador estiver ocupado; não se garante um ganho em toda sessão. Um módulo pode envolver vários arquivos de código, e pode ser baixado sem depois ser utilizado.
- Criação atômica com fotos usa até dois uploads em andamento, sem aumentar o número de arquivos da operação bem-sucedida. Rede reconhecidamente restrita conserva um trabalhador. Não foram alterados compressão, permissões, dados enviados ou SQL.
- Ao detectar falha, não começa outra foto, aguarda as já iniciadas e limpa somente uploads novos desse envio pelo mecanismo existente. Até uma foto que já estava em paralelo pode terminar antes da limpeza. Fotos preexistentes não são apagadas.
- A ordem dos vínculos continua sendo a ordem de entrada, independentemente da ordem de conclusão dos uploads. ID de idempotência, criação atômica, confirmação, fallback legado e tratamento de resposta ambígua permanecem preservados. O fluxo legado/edição não foi paralelizado.

## Validação e limites

Oito testes focados cobrem limite de dois envios, modo sequencial, não reenviar mídia existente, ordenação, falha com outro upload pendente, chamada atômica somente depois de todos os envios, limpeza de sucesso tardio, autorização, Home pronta, consulta iniciada após agendamento, ociosidade, visibilidade e cancelamento. Testes de integração executam o persistServiceOrder real com dependências simuladas; nenhuma OS ou foto real foi criada para medições.

Suíte local: 1.040 testes, 1.038 aprovados, zero falhas, dois ignorados por limitações de ambiente. Qualidade e builds site/CRM passaram. Revisão independente não encontrou bloqueios no paralelismo/limpeza nem no pré-carregamento. Após a revisão, o preparo foi adicionalmente limitado à Home já renderizada e às consultas ociosas, com testes próprios.

Não se mediu percentual de redução em produção, nem se fabricou um p95 com poucas operações. A melhora comprovada é a possibilidade de dois arquivos independentes avançarem ao mesmo tempo, aguardando confirmação e limpeza corretas. A duração real depende de rede, compressão, tamanho dos arquivos e servidor. OS sem fotos pode não apresentar diferença no tempo de gravação.

Não há migração, Edge Function ou serviço VPS a publicar. Não se carregam históricos, contatos, mídias ou catálogos antes do uso. Nenhuma regra comercial, fila de atendimento, validação de agenda, checklist ou controle de acesso foi removido. Rascunhos antigos em stash permanecem fora desta entrega.
