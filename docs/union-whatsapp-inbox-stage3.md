# Atendimento WhatsApp Union — melhoria visual e funcional após envio confirmado

## Interface (referência SAC Digital)
- Compositor único: botões de anexo/emoji e enviar, mesma tipografia/bordas e estilo dos balões
- Envio de texto e anexo sem bloquear digitação, com fila otimista e indicador "Enviando" dentro do balão
- Proteção contra duplo clique e reenvio automático de envios incertos
- Rolagem automática ao final ao selecionar/receber/enviar, exceto quando o usuário rolar manualmente para mensagens antigas
- Botão flutuante "Ir para a última mensagem" quando a conversa não estiver ao final
- Feedbacks de sucesso ("devolvido à fila" etc.) removidos, mantendo erros relevantes visíveis
- Atualização por Supabase Realtime, e reconciliação moderada ao retornar para a aba; sem polling a cada 30 segundos
- Nova conversa por telefone (com DDI/DDD), sem saudação automática
- Assumir, devolver, finalizar, reabrir, encaminhar a operador habilitado na mesma empresa
- Indicadores de enviada/entregue/visualizada quando confirmação do WuzAPI chegar
- Contador de não lidas zerado quando o operador responsável acessa a conversa

## Mídias
- Envio de JPEG/PNG até 1 MB; Ogg/Opus até 3 MB; MP4/3GPP e documentos até 5 MB
- Armazenamento privado `union-whatsapp-media` por empresa/canal/conversa
- Mídia de saída: navegador → Edge Function autenticada → Storage privado →
  URL assinada de 3 minutos → ponte privada → WuzAPI
- Mídia recebida: webhook autenticado → descriptor criptográfico privado (sem
  chave no browser) → ao abrir, chamada Edge protegida e assinada à ponte →
  WuzAPI descriptografa → arquivo no Storage privado → URL assinada de 2 minutos
- Não armazenar arquivos e tokens em log, e não inserir mensagens no SAC Digital
- Normalização de números somente de aliases WhatsApp PN verificados, nunca
  confundindo `@lid` com telefone

## Observações de operação
- Correções frontend foram **commitadas ao main**, mas publicação do site depende
  da implantação de produção configurada para o repositório.
- Edge Functions `union-whatsapp-inbox` e `union-whatsapp-webhook` foram
  implantadas no projeto CRM após as alterações.
- Ponte precisa ser atualizada na VPS pelo commit `e20819b9f1361a0b7f3e986c14941a01ef603f83`
  (arquivo `services/union-wuzapi-bridge/server.mjs`), com `node --check`,
  backup e reinício somente do serviço `union-wuzapi-bridge`.
- Nunca reiniciar a imagem WuzAPI/Zappro ou desconectar sessão para essas
  alterações.
- Ainda não houve teste fim a fim dos quatro tipos de mídia neste ambiente;
  validar primeiro com **uma imagem JPEG pequena**, depois áudio/vídeo/documento,
  preservando o WhatsApp emparelhado.
- Fotos de perfil de contatos, resolver LIDs sem alias disponível, gravação de
  áudio no navegador (que pode produzir WebM incompatível com Opus/Ogg), grupos,
  departamentos com membership granular e integração completa com OS ainda
  precisam de etapas específicas; não os apresentar como prontos.
