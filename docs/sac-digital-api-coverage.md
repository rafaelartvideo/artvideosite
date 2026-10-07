# SAC Digital — cobertura da implementação

Base da auditoria: main 22fa10af8086ffc673af04f0f39a7b3cebfe68ff. Integração preserva main b436810213bb2779383b4a0641f4acf079290ebb e suas correções de PDF. Documentação visual auditada: https://alertrack.docs.apiary.io/.

O catálogo cobre as 92 fichas. O servidor resolve rotas permitidas, valida campos, autentica Gestor/Operador separadamente e verifica a permissão de cada ação. A interface apresenta áreas, listagens, seleção de registros e ações contextuais. Login Gestor fica nas configurações; login Operador é interno pelo vínculo do usuário.

Cobertura de código não equivale a 92 operações verificadas na conta real. Não foram enviados SMS, mensagens, campanhas, chamadas ou finalizações a clientes. Os 89 endpoints sem schema completo recebem validação mínima e diagnóstico de resposta inesperada; recursos opcionais dependem dos módulos e scopes da SAC.

| Ficha | Área / fluxo | Método | Rota | Situação |
|---|---|---|---|---|
| 01 | Gestor — Login — Login | POST | `/client/auth2/login` | Configuração/teste de conexão privado existente preservado |
| 02 | Contatos — Todos | GET | `/client/contact/all?p={p}` | Implementado; operação real não exercitada |
| 03 | Contatos — Filtrar | GET | `/client/contact/search?p={p}&filter={filter}&search={search}` | Implementado; operação real não exercitada |
| 04 | Contatos — Perfil | GET | `/client/contact/info?id={id}` | Implementado; operação real não exercitada |
| 05 | Contatos — Protocolos | GET | `/client/contact/info/protocols?p={p}&id={id}` | Implementado; operação real não exercitada |
| 06 | Contatos — Mídias | GET | `/client/contact/info/medias?p={p}&id={id}` | Implementado; operação real não exercitada |
| 07 | Contatos — Status | GET | `/client/contact/status?p={p}&id={id}` | Implementado; operação real não exercitada |
| 08 | Contatos — Edição | PATCH | `/client/contact/edit` | Implementado; operação real não exercitada |
| 09 | Contatos — Enriquecimento | POST | `/client/contact/register` | Implementado; operação real não exercitada |
| 10 | Contatos — Importação | POST | `/client/contact/import` | Implementado; operação real não exercitada |
| 11 | Contatos — Encaminhar | POST | `/client/contact/forward` | Implementado; operação real não exercitada |
| 12 | Recados — Todos | GET | `/client/inbox/all?p={p}` | Implementado; operação real não exercitada |
| 13 | Recados — Detalhes | GET | `/client/inbox/info?protocol={protocol}` | Implementado; operação real não exercitada |
| 14 | Canais — Todos | GET | `/client/channel/all` | Implementado; operação real não exercitada |
| 15 | Enterprise — Modelos | GET | `/client/channel/templates?id={id}` | Implementado; operação real não exercitada |
| 16 | Departamentos — Todos | GET | `/client/department/all` | Implementado; operação real não exercitada |
| 17 | Operadores — Todos | GET | `/client/operator/all?p={p}` | Implementado; operação real não exercitada |
| 18 | Monitores — Todos | GET | `/client/monitor/all?p={p}` | Implementado; operação real não exercitada |
| 19 | Grupos de Contatos — Todos | GET | `/client/groups/all?p={p}` | Implementado; operação real não exercitada |
| 20 | Grupos de Contatos — Contatos | GET | `/client/groups/contacts?id={id}&p={p}` | Implementado; operação real não exercitada |
| 21 | Grupos de Contatos — Vincular | POST | `/client/groups/add` | Implementado; operação real não exercitada |
| 22 | Grupos de Contatos — Remover | DELETE | `/client/groups/remove` | Implementado; operação real não exercitada |
| 23 | Campanhas — Todas | GET | `/client/campaign/all?p={p}` | Implementado; operação real não exercitada |
| 24 | Campanhas — Resumo | GET | `/client/campaign/resume?id={id}` | Implementado; operação real não exercitada |
| 25 | Campanhas — Mensagens | GET | `/client/campaign/messages?id={id}&p={p}` | Implementado; operação real não exercitada |
| 26 | Campanhas — Criar | POST | `/client/campaign/create` | Implementado; operação real não exercitada |
| 27 | Etiquetas — Todas | GET | `/client/tag/all` | Implementado; operação real não exercitada |
| 28 | Etiquetas — Vincular | POST | `/client/tag/contact/add` | Implementado; operação real não exercitada |
| 29 | Etiquetas — Remover | DELETE | `/client/tag/contact/remove` | Implementado; operação real não exercitada |
| 30 | Protocolos — Todos | GET | `/client/protocol/all?p={p}` | Implementado; operação real não exercitada |
| 31 | Protocolos — Filtros | POST | `/client/protocol/search?p={p}&filter={filter}` | Implementado; contrato externo exige confirmação |
| 32 | Protocolos — Detalhes | GET | `/client/protocol/info?protocol={protocol}` | Implementado; operação real não exercitada |
| 33 | Protocolos — Mensagens | GET | `/client/protocol/messages?protocol={protocol}` | Implementado; operação real não exercitada |
| 34 | Protocolos — Observações | GET | `/client/protocol/observations?protocol={protocol}` | Implementado; operação real não exercitada |
| 35 | Protocolos — Adicionar observação | POST | `/client/protocol/addObservations` | Implementado; operação real não exercitada |
| 36 | Protocolos — Enviar | POST | `/client/protocol/send` | Implementado; operação real não exercitada |
| 37 | Protocolos — Recados | PUT | `/client/protocol/to_inbox?protocol={protocol}` | Implementado; operação real não exercitada |
| 38 | Protocolos — Finalizar | DELETE | `/client/protocol/finish` | Implementado; operação real não exercitada |
| 39 | Notificações — Contato | POST | `/client/notification/contact` | Implementado; operação real não exercitada |
| 40 | Notificações — Direto | POST | `/client/notification/direct` | Implementado; operação real não exercitada |
| 41 | Notificações — Status | GET | `/client/notification/status?id={id}` | Implementado; operação real não exercitada |
| 42 | Grupos de WhatsApp — Todos | GET | `/client/groups_wa/all?p={p}` | Implementado; operação real não exercitada |
| 43 | Grupos de WhatsApp — Participantes | GET | `/client/groups_wa/members?id={id}` | Implementado; operação real não exercitada |
| 44 | Grupos de WhatsApp — Histórico | GET | `/client/groups_wa/messages?id={id}&page={p}` | Implementado; contrato externo exige confirmação |
| 45 | Cupom — Todos | GET | `/client/coupon/all?p={p}` | Implementado; operação real não exercitada |
| 46 | Cupom — Contatos | GET | `/client/coupon/codes?id={id}&p={p}` | Implementado; operação real não exercitada |
| 47 | Cupom — Usar | PATCH | `/client/coupon/code/used` | Implementado; operação real não exercitada |
| 48 | SMSIDEAL — Contato | POST | `/client/sms/contact` | Implementado; operação real não exercitada |
| 49 | SMSIDEAL — Direto | POST | `/client/sms/direct` | Implementado; operação real não exercitada |
| 50 | Produtos — Categorias | GET | `/products/cat/all?p={p}` | Implementado; contrato externo exige confirmação |
| 51 | Produtos — Produtos da categoria | GET | `/client/products/cat/itens?id={id}&p={p}` | Implementado; operação real não exercitada |
| 52 | Correios — Contato | POST | `/client/correios/contact` | Implementado; operação real não exercitada |
| 53 | Correios — Status | GET | `/client/correios/status?code={code}` | Implementado; operação real não exercitada |
| 54 | Portabilidade — Verificar | GET | `/client/portable/check?number={number}` | Implementado; operação real não exercitada |
| 55 | Agendamento — Operador | GET | `/client/schedule/operator?operator={operator}&start_at={start_at}&finish_at={finish_at}&p={p}` | Implementado; operação real não exercitada |
| 56 | Carteira de Clientes — Todos | GET | `/client/wallet/all?operator={operator}&p={p}` | Implementado; operação real não exercitada |
| 57 | Carteira de Clientes — Adicionar | POST | `/client/wallet/add` | Implementado; operação real não exercitada |
| 58 | Carteira de Clientes — Remover | POST | `/client/wallet/remove` | Implementado; operação real não exercitada |
| 59 | API Telefonia — Ramais | GET | `/client/voip/extensions` | Implementado; operação real não exercitada |
| 60 | API Telefonia — Solicitar chamada | POST | `/client/voip/call` | Implementado; contrato externo exige confirmação |
| 61 | Operador — Login — Login | POST | `/operator/auth2/login` | Login interno documentado, vínculo e sessão isolados; handshake depende da conta |
| 62 | Perfil — Dados | GET | `/operator/perfil/info` | Implementado; operação real não exercitada |
| 63 | Perfil — Editar | PATCH | `/operator/perfil/edit` | Implementado; operação real não exercitada |
| 64 | Perfil — Módulos | GET | `/operator/perfil/modules` | Implementado; operação real não exercitada |
| 65 | Respostas Rápidas — Listar | GET | `/answers/all` | Implementado; contrato externo exige confirmação |
| 66 | Respostas Rápidas — Adicionar | POST | `/answers/add` | Implementado; contrato externo exige confirmação |
| 67 | Respostas Rápidas — Remover | DELETE | `/operator/answers/remove` | Implementado; contrato externo exige confirmação |
| 68 | Recuperar Contato — Últimos | GET | `/operator/recover/list` | Implementado; operação real não exercitada |
| 69 | Recuperar Contato — Filtro | GET | `/operator/recover/search?s={s}` | Implementado; operação real não exercitada |
| 70 | Recuperar Contato — Encaminhar | POST | `/operator/recover/contact` | Implementado; operação real não exercitada |
| 71 | Atendimentos — Últimos | GET | `/operator/att/access` | Implementado; operação real não exercitada |
| 72 | Atendimentos — Fila | GET | `/operator/att/queue` | Implementado; operação real não exercitada |
| 73 | Atendimentos — Selecionar | PATCH | `/operator/att/select/{protocol}` | Implementado; operação real não exercitada |
| 74 | Atendimentos — Protocolo | GET | `/operator/att/info/{protocol}` | Implementado; operação real não exercitada |
| 75 | Atendimentos — Contato | GET | `/operator/att/contact/{protocol}` | Implementado; operação real não exercitada |
| 76 | Atendimentos — Mensagens | GET | `/operator/att/messages/{protocol}` | Implementado; operação real não exercitada |
| 77 | Atendimentos — Histórico | GET | `/operator/att/historic/{protocol}` | Implementado; operação real não exercitada |
| 78 | Atendimentos — Enviar mensagem | POST | `/operator/att/send/{protocol}` | Implementado; operação real não exercitada |
| 79 | Atendimentos — Mensagem | GET | `/operator/att/message/{protocol}/{message}` | Implementado; operação real não exercitada |
| 80 | Atendimentos — Reenvio | PATCH | `/operator/att/resend/{protocol}/{message}` | Implementado; operação real não exercitada |
| 81 | Atendimentos — Observações | GET | `/operator/att/observations/{protocol}/all` | Implementado; operação real não exercitada |
| 82 | Atendimentos — Nova observação | POST | `/operator/att/observations/{protocol}/add` | Implementado; operação real não exercitada |
| 83 | Atendimentos — Grupos | GET | `/operator/att/groups/{protocol}/all` | Implementado; operação real não exercitada |
| 84 | Atendimentos — Vincular grupo | PATCH | `/operator/att/groups/{protocol}/add/{group}` | Implementado; operação real não exercitada |
| 85 | Atendimentos — Desvincular grupo | PATCH | `/operator/att/groups/{protocol}/remove/{group}` | Implementado; operação real não exercitada |
| 86 | Atendimentos — Etiquetas | GET | `/operator/att/tags/{protocol}/all` | Implementado; operação real não exercitada |
| 87 | Atendimentos — Vincular etiqueta | PATCH | `/operator/att/tags/{protocol}/add/{tag}` | Implementado; operação real não exercitada |
| 88 | Atendimentos — Operadores | GET | `/operator/att/operators/{protocol}/all` | Implementado; operação real não exercitada |
| 89 | Atendimentos — Departamentos | GET | `/operator/att/departments/{protocol}/all` | Implementado; operação real não exercitada |
| 90 | Atendimentos — Encaminhar | PATCH | `/operator/att/forward/{protocol}` | Implementado; operação real não exercitada |
| 91 | Atendimentos — Editar contato | PATCH | `/operator/att/contact/{protocol}/edit` | Implementado; operação real não exercitada |
| 92 | Atendimentos — Finalizar | PATCH | `/operator/att/finish/{protocol}` | Implementado; contrato externo exige confirmação |

## Integridade e atualização

- Tentativas imutáveis por intenção no ledger; ID estável de retry; timeout fica desconhecido. notification_id separado de request_id. Histórico de tentativas e respostas SMS visível.
- Bootstrap paginado com checkpoint, término explícito ou página vazia, nova varredura após conclusão e guarda de atendimento encerrado.
- Oito webhooks projetados após persistência durável, lease, backoff e cron de recuperação. Eventos antigos não reabrem finalizado; mídia tem prioridade sobre legenda; offsets respeitados.
- Realtime Supabase e reconciliação limitada do protocolo ativo; cron rotativo para mensagens externas sem webhook. **Relay WebSocket não certificado/implementado:** catálogo externo de eventos ainda ausente; usa-se reconciliação como alternativa de funcionamento.
- Anexos novos privados, limites imagem 1MB/áudio3MB/vídeo e arquivo5MB, URL temporária para fornecedor e renovação autorizada para histórico. Arquivos antigos e anexos referenciados são preservados; limpeza agendada só de temporários novos órfãos após7dias.
- Menus callback GET/POST com token da empresa, opções estáticas e consulta de estado de OS pelo contato sem identidade ambígua. HTTP aninhado arbitrário não é permitido.

## Evidência de validação

- Node test:sac: 47 testes aprovados cobrindo catálogo, scopes/permissões, rota Gestor/Operador, PATCH de seleção, lease, timeout/idempotência, paginação, canal, limites, status, eventos, menus, formulários, contexto grupo/contato e cupom/código, protocolo fechado/desconhecido e mídia.
- Regressões existentes: 14 testes gerais e 28 financeiros aprovados; total de 89 testes.
- Build CRM Vite aprovado; avisos preexistentes de chave duplicada em TabAuditLog e tamanho de chunks.
- SQL das cinco migrações, lease/proprietário, eventos oito, deduplicação/mídia, ordem temporal, offset e grants validados numa transação com rollback no projeto CRM. Fixtures não foram preservadas e não chamam SAC.
- Edge functions verificadas por bundle e check Deno com declarações locais do SDK, sem consultar segredos.

## Implantação do backend

As cinco migrações foram aplicadas no projeto CRM `wmjmtcjpunmzvonlkjcu`. Funções ativas: `sac-digital-api` versão 41, `sac-digital-webhook` versão 8, `sac-digital-worker` versão 1 e `sac-digital-menu` versão 1. RLS, restrições de acesso ao ledger e RPCs, pg_net e agendas cron foram conferidos por consultas de leitura.

A revisão automática bloqueou o smoke test HTTP direto do worker por considerar que poderia processar jobs reais. Esse teste não foi repetido; a validação do worker usa código, testes SQL com rollback e metadados de implantação. Isso não substitui homologação de negócios com destinatários de teste.

## Dependências externas restantes

Login Operador, formato real de paginação/respostas, aliases de modalidade do canal, produtos sem prefixo/client, respostas rápidas sem prefixo/operator e scopes inconsistentes, telefonia, vote e catálogo WebSocket requerem confirmação da SAC. Não há fallback silencioso para rota/token diferente. Templates devem existir e estar aprovados. Sem provas de negócios em destinatário de teste, a certificação completa em produção permanece pendente.
