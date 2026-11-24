# Importações de histórico — piloto privado

## Estado e limites
Branch de implementação inicial, **não publicar nem aplicar em produção antes dos testes**.
O pacote piloto foi produzido externamente: 20 contatos, 66 protocolos, 354 mensagens, 30 referências de mídia verificadas por existência/tamanho, 25 indisponíveis. Não registrar identificadores, telefones, mensagens, índices ou chaves no Git.
A ferramenta aceita a versão 1 do pacote de piloto, até 100 contatos por pacote. A importação completa exige particionamento, índices incrementais e revisão de limites.
O worker valida SHA-256 de cada histórico comprimido, estrutura, referências e datas das mensagens, mantendo um índice privado. A validação dos anexos originais por conteúdo ainda deve ser feita antes de liberar a visualização. Nenhum código deste ramo insere mensagens nas tabelas ativas do WhatsApp.

## Separação de responsabilidades
- Central de Gestão da Union: autorização exclusiva de pacote para empresa ativa, usando permissão de plataforma e RPC existente; consulta de progresso por empresa.
- Configurações dos Atendimentos > Importações de histórico: empresa ativa fixa; seleção de pacote autorizado e conexão WuzAPI conectada. API resolve o número no servidor e nunca recebe número de destino arbitrário.
- Quatro permissões independentes; ver rascunho permissions.draft.sql. Não conceder automaticamente a operadores. Converter em migration oficial após teste, usar ferramenta padrão do projeto, revisar escopo de módulos e tela de permissões.
- Chave permanente: organization_id + account_phone, não identificador temporário da sessão. O pacote tem uma associação exclusiva. Nova sessão do mesmo número mantém a identidade do índice.
- Pausa/cancelamento em fronteira de contato. SQLite persiste estado e eventos. Validação falha mantém item pendente; nova tentativa repete o mesmo item. Reversão desabilita a leitura pelo índice e não remove backup ou dados ativos.
- Telefones repetidos no pacote ficam para revisão. Não vincular por nome. Conciliação real com cadastro do CRM, aliases verificados, números reciclados e conflito entre pacotes é gate obrigatório antes de disponibilizar histórico a operador.
- A lista contém somente metadados e totais; a consulta interna lookup ainda NÃO é publicada via gateway. A identidade do contato deve ser validada no servidor antes de expor qualquer conteúdo.

## Ensaio e instalação futura
1. Rodar node --test tools/history-import/archive-store.test.mjs com Node 22.13+ e npm run build:crm / regressões do projeto em checkout isolado.
2. Testar em ambiente separado com dados fictícios e usuários de duas empresas. Testar JWT expirado, permissões individuais, pacote de outra empresa, troca de conta, HMAC/nonce, falhas, pausa, reinício do processo, reversão.
3. Provisionar serviço independente do PABX, usuário sem privilégios, volume protegido com diretório 0700 e arquivo 0600, configurações e credenciais privadas fora do Git e frontend. Rclone config com acesso somente leitura ao R2 e segredo crypt custodiado. Não usar remote público. Verificar saúde e espaço antes.
4. Configurar UNION_HISTORY_DB, UNION_HISTORY_RCLONE_CONFIG, UNION_HISTORY_RCLONE (opcional), UNION_HISTORY_PORT (padrão 19091), UNION_HISTORY_GATEWAY_SECRET. Subir exatamente uma instância do worker (lock operacional via systemd/flock) e uma do gateway, separados: node archive-gateway.mjs worker / gateway. Proteger reverse proxy HTTPS, somente rota POST /history-import, limites de requisição e sem log de corpo. Não compartilhar segredo.
5. Configurar Edge Function com UNION_HISTORY_GATEWAY_URL e UNION_HISTORY_GATEWAY_SECRET em ambiente privado. Validar autenticação antes da ativação. Aplicar permissões por migration revisada e selecionar perfis.
6. Disponibilizar pacote real por ID na Central Union, confirmar empresa na interface. Na empresa, selecionar número original e validar o piloto. A concessão não autoriza outra empresa nem troca de número automática.

## Gate antes da liberação das conversas
Ainda falta: conciliar cada contato com identidade verificada do CRM; tratar revisões e contatos ainda inexistentes; ler e mesclar paginação por data/ID com mensagens atuais, inclusive protocolos, documentos, links, avatares, mensagens novas e mídias; deduplicar sobreposição por identificadores estáveis (não texto isolado); validar proxy autenticado de mídia com Range/stream, MIME seguro e cache privado; impedir efeitos no unread, fila, SLA, dashboard e realtime; revisar RLS e permissões de conversa/participantes; ensaiar desconexão/recriação de sessão e rollback. O usuário verá uma única conversa e galeria, sem referência ao sistema anterior.
Antes de migrar todos os contatos, medir desempenho, tamanho, carga, recuperação após interrupção e concorrência. O índice é externo ao Supabase para preservar a cota Free; R2 fica criptografado. A mudança futura para Supabase Storage exige adaptador e verificação de integridade, não alteração de interface.
