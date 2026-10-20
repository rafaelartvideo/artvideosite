# Atendimento WhatsApp Union — Etapa 1 (recebimento)

## Separação do SAC Digital
- Front de referência: `src/features/sac-digital/presentation/SacDigitalToolPage.tsx`.
- Novo front isolado: `src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx`.
- Banco próprio `union_whatsapp_conversations`, `union_whatsapp_messages` e `union_whatsapp_webhook_keys`; o SAC anterior e suas integrações NÃO são alterados.
- Permissões `whatsapp.inbox.view/send/manage`, com escopo por empresa e módulo independente `whatsapp`.
- As tabelas de mensagens não aceitam escrita direta dos usuários; RLS na leitura. Realtime habilitado nas duas tabelas.

## Webhook autenticado — nenhuma credencial no browser
- Ponte Node HTTPS pré-existente (porta local 19080) recebeu ação `webhook_setup`, disponível após atualizar manualmente `server.mjs` na VPS.
- Chamada autorizada da Edge `whatsapp-channels` envia ação assinada à ponte; a ponte configura SOMENTE o webhook daquela sessão via `POST /webhook` do WuzAPI, sem logout/repareamento.
- URL definida pela ponte: `https://wmjmtcjpunmzvonlkjcu.supabase.co/functions/v1/union-whatsapp-webhook?channel=<uuid>`.
- Ponte retorna SOMENTE SHA-256 do token WuzAPI; Edge grava digest em tabela sem acesso a `anon` e `authenticated` e atualiza `webhook_ready`.
- Webhook público sem JWT **autentica cada evento** por token de alta entropia (SHA-256 comparado àquele da sessão). Aceita form-urlencoded padrão (`jsonData` e `token`) e JSON.
- O evento de mensagem é deduplicado pelo identificador nativo por canal. Ignora grupos, newsletter, status e qualquer tipo diferente de `Message`. Não guarda mídia/base64 bruta. Rejeita tokens incorretos.
- Sem captura do histórico anterior à ativação; apenas novas mensagens do WuzAPI.

## Teste de operação
1. Na VPS, atualizar somente `/opt/union-wuzapi-bridge/server.mjs` pelo commit da ponte que adiciona `webhook_setup`, usando arquivo temporário `.mjs`, `node --check`, backup, `systemctl restart union-wuzapi-bridge`.
2. Confirmar serviço `active` e resposta local sem assinatura `401`. Nenhum contêiner WuzAPI ou Zappro precisa ser reiniciado.
3. Publicar o frontend (commits no main), renovar sessão para receber as novas permissões.
4. Em Operação > Integrações > Canais de Atendimento, clicar em **Ativar recebimento**.
5. Em Ferramentas > Atendimento WhatsApp, abrir a caixa de entrada. Enviar uma mensagem de teste **de outro número** ao número conectado.
6. Confirmar conversa nova, mensagem, contador e evento Realtime, verificando que os registros do SAC Digital não mudaram.

## Escopo adiado
- Envio de texto e mídia, contatos enriquecidos, importação de histórico, envio por OS.
- Operações assumir/encaminhar/devolver/finalizar, controle de filas, departamentos e operadores.
- Comprovação de entrega/leitura, tratamento de mídia e sincronização de nomes/fotos.
- Não confundir `webhook_ready` com conexão real: `state=connected` continua derivando de `/session/status`.

## Limitações e cuidados
- O WuzAPI é uma integração não oficial, sem garantia de disponibilidade ou segurança de número.
- O código do frontend foi publicado no repositório, mas a implantação em produção é separada.
- Nenhum dado de sessão ou token administrativo deve ser copiado para o repositório, console de browser, URL de consulta ou suporte.

## Correção de autenticação de eventos em 20/10

O canal conectado recebia `401` para os webhooks automáticos do WuzAPI,
apesar de a sonda manual `UnionProbe` com `token` responder `200`.
O código anterior não distinguia a credencial de uma sonda manual da
assinatura de um webhook real, e algumas variantes JSON do WuzAPI não incluem
o token de usuário na carga enviada.

Corrigido nos commits da ponte e da Edge:
- `webhook_setup` na ponte configura `/session/hmac/config` com uma chave HMAC
  derivada de `UNION_WUZAPI_BRIDGE_SECRET` e do UUID do canal; nunca
  revela a chave nem altera a sessão WhatsApp.
- `union-whatsapp-webhook` valida `x-hmac-signature` com HMAC-SHA256,
  em JSON e em `application/x-www-form-urlencoded`; a assinatura incorreta
  não cai no modo alternativo. Modo antigo de `token` permanece validado por
  hash e somente para compatibilidade.
- Para formulários, canonicalização usa o comportamento Go `net/url.Values.Encode`
  e não o `URLSearchParams.toString()` do navegador.
- `whatsapp-channels` exige confirmação `auth_mode: hmac-sha256` antes de
  confirmar uma nova habilitação. A interface permite revalidar canais já
  configurados.

A implantação das Edge Functions pode ser imediata, mas a VPS precisa receber
`server.mjs` atualizado e a sessão precisa ter sua chave HMAC configurada
mediante `webhook_setup` autorizado ou usando diagnóstico administrativo
local protegido. Não alterar `WEBHOOK_FORMAT` nem reiniciar WuzAPI para
corrigir credenciais. Mensagens anteriores que falharam podem não ser
entregues novamente; testar com uma nova mensagem após a configuração.
