# Union WhatsApp — etapa 2: caixa de entrada operacional

## Diagnóstico da mensagem duplicada
Em 20/10, após autenticação HMAC e chegada das primeiras mensagens,
a caixa exibia uma terceira conversa chamada "Contato WhatsApp".
A auditoria do banco mostrou duas conversas legítimas e uma conversa
isolada, originada de um evento de texto de saída **sem corpo**.
O identificador do evento era diferente da mensagem legítima; não
se tratava de uma cópia do ID original.

Correção:
- `union-whatsapp-webhook` descarta eventos de texto vazio **antes**
  de criar conversa ou mensagem;
- a única conversa fantasma foi removida com salvaguardas: estado
  Aguardando, sem responsável, sem telefone, contendo exclusivamente
  mensagens de saída de texto vazio; as demais foram preservadas;
- mensagens recebidas reabrem conversas anteriormente finalizadas
  ou abandonadas, voltando à fila Aguardando.

## Etapa operacional
- Novo endpoint autenticado `union-whatsapp-inbox`:
  - `assume`: reclama atomicamente um protocolo em Aguardando;
  - `send_text`: exige permissão de envio e conversa Em atendimento;
  - `return_queue`: libera conversa do atendente e devolve à fila;
  - `finish`: encerra o atendimento;
  - `reopen`: somente gestor;
  - `mark_read`: zera contador no atendimento atribuído.
- A função autoriza por `my_organization_permissions`, exige empresa,
  conversa e canal existentes, e nunca recebe o token WuzAPI.
- Mensagens saem por uma ponte assinada HMAC para o WuzAPI privado:
  `POST /chat/send/text` com `Phone`, `Body`, `Id`.
- Cada envio recebe UUID estável e é registrado em
  `union_whatsapp_send_attempts`, tabela privada sem acesso direto
  por usuários autenticados. Repetição do mesmo UUID jamais realiza
  novo envio, inclusive após timeout e reinício.
- `Sent` significa aceito pelo provedor, **não** entregue ou lido
  pelo destinatário. A confirmação de entrega/leitura virá depois.
- Mensagens de saída têm o primeiro nome do operador do perfil Union
  em destaque. Webhooks de eco não criam mensagem duplicada, por
  `channel_id,provider_message_id` único.

## Implantação da ponte (necessária na VPS)
- Atualizar somente `/opt/union-wuzapi-bridge/server.mjs` pelo commit
  `0dd1a28e30354ceb21cd225a82256ffcb475fda1`.
- Usar temporário `.mjs`, executar `node --check`, fazer backup
  e reiniciar apenas o serviço systemd `union-wuzapi-bridge`.
- Não reiniciar o contêiner WuzAPI, não desconectar WhatsApp e não
  tocar o Zappro nem licenças existentes.
- Publicar o frontend do `main`, se deploy automático não tiver
  ocorrido.

## Teste manual seguro
1. Abrir Ferramentas > Atendimento WhatsApp, selecionar Aguardando.
2. Clicar Assumir na conversa de teste, verificar filtro Em atendimento
   e contador de não lidas atualizado.
3. Responder uma única vez no compositor; confirmar a chegada no
   WhatsApp do destinatário e somente um balão na Union.
4. Tentar atualizar a caixa, verificar que o balão não duplica.
5. Testar Devolver e Finalizar; novo texto do cliente deve retornar
   uma conversa concluída à fila Aguardando.
6. Se a API indicar erro ou timeout, não reenviar cegamente: a função
   retorna confirmação pendente e mantém o UUID da tentativa até o
   conteúdo ser alterado.

## Próximas etapas
- Enriquecer contatos `@lid` com telefone e avatar quando o WuzAPI
  disponibilizar mapeamento verificado.
- Anexos, imagem, vídeo, áudio e arquivos com armazenamento protegido,
  visualização, reprodução e download.
- Encaminhamento a atendentes/departamentos com autorização.
- Confirmações de entregue/lida, indicadores e reconciliação.
- Integração de conversas com clientes, OS e orçamentos.
