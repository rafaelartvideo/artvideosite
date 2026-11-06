# Segunda rodada — conclusão retomada em 06/11/2026

As correções pendentes de 30/10 foram reaplicadas sobre `ca5b523ff698606c76a220434a1ba799659c9947`, preservando as alterações posteriores, inclusive o commit concorrente `f2cff5f8a` incorporado antes da publicação. Este documento complementa a [auditoria inicial](2026-10-30-egress-performance-security.md).

## Alterações

- SAC: consulta periódica da fila visual pausa em aba oculta, retoma imediatamente ao voltar/reconectar e mantém intervalo de 30 segundos em primeiro plano. Não muda ingestão, atribuições, alertas Realtime ou validação de credenciais. Fixture de dois minutos ocultos: quatro consultas periódicas passam a zero; retomada faz uma consulta. Não constitui medição de economia mensal.
- SAC backend: histórico de cada protocolo reconciliado uma vez por requisição autorizada. Fixture de cinco tentativas do mesmo protocolo: cinco sincronizações passam a uma; cinco verificações de entrega e dez gravações de projeção permanecem. A correção foi aplicada cirurgicamente ao bundle remoto v113, produzindo v114. Em 06/11 a produção está ACTIVE v118 e ainda contém o mesmo trecho; quatro testes executados contra o trecho recuperado passaram. Nenhum redeploy do bundle antigo foi feito nesta retomada.
- Anexos de OS: botão Baixar busca a resposta autorizada e cria um blob local, preservando bytes/nome. Corrige abertura em nova aba causada pelo atributo download em URL de outro domínio. Respostas HTTP de erro não são salvas como documento e a interface informa falha.
- Backup: ferramentas, templates e procedimento preparados em `tools/backup` e no [runbook](2026-10-30-backup-runbook.md). **Inativo: nenhuma captura real, rotina agendada ou restauração comprovada.**

O artefato `2026-10-30-sac-api-v113-rollback.json.gz.base64` guarda o código anterior à intervenção de 30/10. É histórico: não deve substituir a versão atual inteira, que recebeu alterações posteriores. Qualquer reversão atual exige remover somente o trecho em questão da versão vigente.

## Validação

Em 06/11, após instalar dependências pelo lockfile:

- `npm run test:ci`: 695 testes passaram (qualidade 4, financeiro 69, regressões 423, SAC 199).
- `npm run build`: site e CRM passaram; permanece aviso de chunks maiores que 500 kB.
- Agente PBX: 27 testes Python passaram. Os três testes de compatibilidade de produtos do commit concorrente também passaram na execução dedicada e integram o total do CI.
- Backup: 7 testes passaram, 1 teste real de GPG pulado por restrição de sockets do ambiente. Os testes usam fontes simuladas e não exportam clientes.
- Revisão independente do download: três testes passaram e nenhum bloqueador concreto encontrado.
- `git diff --check`: sem erros.

## Navegador e dados de teste

Na sessão de 30/10 foram verificados login, busca/abertura de OS, quatro fotos e lightbox, downloads de fotos original/PNG/JPEG/PDF, agenda, painel técnico, oito itens de estoque e abertura/cancelamento de edição, resumo financeiro e troca Artvideo/Teste. Nenhuma operação financeira foi executada.

Realtime foi verificado em duas abas da empresa Teste: a tarefa `AUDITORIA TEMPORÁRIA 30-10-2026 — Realtime` apareceu sem recarregar e depois foi cancelada; permanece no histórico. Um PNG sintético de 24.841 bytes, `AUDITORIA_TEMPORARIA_UPLOAD_20261030.png`, foi anexado à OS 64 da empresa Teste e permanece para conferência. Não é documento de cliente. O download desse anexo reproduziu o defeito de abrir em outra aba, motivando esta correção.

Em 06/11 o navegador foi reaberto, o login seguro concluiu e o painel Artvideo carregou. Houve aviso de que a disponibilidade do operador SAC não pôde ser verificada. Após troca de empresa e navegação completa, a sessão retornou ao login; não se alterou política de autenticação para contornar esse comportamento. A conferência final do download na interface depende da publicação e de nova sessão autenticada.

## Impressão: achado operacional pendente

Janela histórica fixa de 29/10 15:30 UTC a 30/10 15:30 UTC: 32.175 chamadas de claim retornaram HTTP 200 com fila vazia; outras 11.067 retornaram HTTP 400/P0001, cujo único caminho na função inspecionada era credencial inválida. Isso corresponde a 25,59% de 43.242 tentativas. Dois user-agents PowerShell diferentes não identificam computadores nem versões do aplicativo.

Não houve trabalhos criados/concluídos nas 24 horas analisadas. O código atual já possui recuo de espera/erro; as instalações e configurações nos PCs precisam ser verificadas. Não se revogou credencial válida nem se interrompeu processo saudável. Repositório da fila: 37 testes, contrato DB e build passaram em 30/10; impressão física não testada. Acesso aos PCs Windows é necessário para identificar o chamador inválido e conferir os scripts/processos instalados.

## Limites e entradas ainda necessárias

Backup exige destino externo aprovado, chave pública verificada/custódia da privada, conexão PostgreSQL com senha/CA, credenciais S3 de leitura, máquina com utilitários e alvo isolado de restauração. A conexão dos plugins GitHub/Supabase não fornece esses segredos nem acesso ao PC da impressora.

Não foram medidos GB faturados depois das correções. Pagamentos reais, envio WhatsApp/SIP, câmera/dispositivos físicos e restauração completa não foram testados. Os snapshots de 30/10 não descrevem automaticamente o estado atual.
