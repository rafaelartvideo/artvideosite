# Union WhatsApp — etapa 5: recuperação, configurações e filas

## Corrigido e implantado
- `Mensagem ou anexo inválido`: regex no `union-whatsapp-inbox` tinha
  duas barras antes de `s\.whatsapp\.net`; mensagens para números PN eram
  rejeitadas mesmo com UUID e corpo válidos. Corrigido e Edge implantada.
- `start` com o mesmo telefone normalizado e canal existente retoma a
  conversa finalizada, altera `status=in_att` e `assigned_to`, preserva
  histórico, não cria conversa duplicada. Mantém verificação de atribuição
  concorrente. Fluxo de envio usa novamente o mesmo `conversation_id`.
- Retirado botão `Editar mensagem` de envios não confirmados. Erros de
  validação que comprovadamente não dispararam mensagem restauram texto
  no compositor; erros incertos mantêm a notificação e não reenviam.
- No cabeçalho de Atendimento WhatsApp a engrenagem é **somente ícone**,
  abrindo menu real: Canais de Atendimento e Departamentos e equipe.
- Departamentos independentes do SAC Digital: schema multiempresa,
  membros por setor, RLS sem acesso direto por `authenticated`,
  filtro por setor, encaminhamento de operador para operador ou fila
  de departamento, histórico de ações e seleção de equipe.
  Setores ainda precisam ser cadastrados pelo gestor.
- Vínculo opcional com OS: apenas se o telefone da conversa encontrar
  cliente único no CRM e a OS pertencer a esse cliente e empresa;
  requer `orders.details.view`; atalho direto para abrir OS.
- Presença: base de dados e assinatura protegida para online/offline,
  sem inventar indicador de digitando. A WuzAPI deve publicar eventos
  `Presence` após revalidar o webhook; o operador assina presença
  do contato somente ao abrir a conversa. Dados têm carimbo horário.
- `ReadReceipt`: parser reconhece objeto JID do Whatsmeow
  (`{User,Server}`) além de JID string e exige estado explícito
  `Delivered` ou `Read`; não colore azul por um evento ambíguo.

## Implantação
- `union-whatsapp-inbox` e `union-whatsapp-webhook` Edge Functions
  publicadas no CRM wmjmtcjpunmzvonlkjcu.
- Frontend `main`: depende da publicação normal do site.
- Ponte WuzAPI na VPS: atualizar apenas `server.mjs` pelo último commit
  que alterou a ponte, `3f60be8c28cf822dcc999b3b8acfa527457de5c9`;
  sintaxe Node validada localmente na VPS antes do reinício.
- Revalidar recebimento em **Canais de Atendimento** depois de
  atualizar a ponte, para que WuzAPI passe a enviar `Presence`.
- Não alterar integração comercial SAC Digital nem reiniciar contêiner
  WuzAPI ou desconectar o número.

## Ainda depende de trabalho específico/teste real
- Gravação WebM convertida em nota de voz Ogg/Opus nativa: hoje
  WebM entra como documento de áudio reproduzível. Exigiria
  transcodificação segura, limites de CPU e teste em VPS.
- Recebimento de mídias acima de 5 MiB: downloads ainda podem
  atravessar JSON/Base64; requer upload servidor-servidor com limites
  e confirmação explícita do provedor antes de anunciar suporte total.
- Evento de digitação: WuzAPI publica `ChatPresence`, mas no código
  upstream inspecionado não preenche `state` do webhook. Não inferir
  `digitando` a partir de `online`. Pode exigir ajuste upstream.
- Associação PN/LID verificável, paginação progressiva de históricos,
  resposta citada, contatos/grupos e templates são fases independentes.
- Funcionalidades novas foram commitadas e funções implantadas, mas
  não houve teste ponta a ponta de UI/voz/setores/OS em sessão real.
