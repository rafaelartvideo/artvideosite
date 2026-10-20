# Atendimento WhatsApp — etapa 4 (21/10): fotos, áudio e cadastro CRM

## Implementado
- Fotos dos contatos: `contact_avatar` no bridge assinado, validado por
  empresa/canal/conversa e atendente na Edge. A ponte usa GET com corpo JSON
  somente via 127.0.0.1:18080 porque o WuzAPI exige corpo até no GET.
  Apenas URLs HTTPS de CDNs WhatsApp/Facebook confiáveis são retornadas
  ao navegador; sem token WuzAPI no browser. Cache de 30 minutos por JID.
  Avatares carregados ao selecionar conversa; fallback para iniciais.
- Gravador de voz no compositor: solicitar microfone apenas sob clique;
  gravar, cronômetro, concluir ou cancelar; mostrar como anexo antes de
  enviar, não publicar sem confirmação. Parar e descartar ao sair da
  conversa. Formatos nativos preferidos Ogg/Opus e MP4.
- Navegadores sem MediaRecorder Ogg/MP4 (por exemplo Chrome) gravam
  WebM/Opus, que é anexado como **documento de áudio reproduzível**.
  Não afirmar que o WhatsApp reconhecerá WebM como nota de voz nativa;
  seria necessário transcodificador Ogg/Opus em uma etapa posterior.
- A ponte aceita `audio/mp4` e `audio/mpeg` como áudio, com MIME
  explícito e modo PTT somente para Ogg/Opus. `audio/webm` é enviado
  como documento, preservando o áudio sem reencodificar incorretamente.
- Webhook reconhece `audioMessage` na extração de metadados de mídias
  recebidas (antes reconhecia somente imagem/vídeo/documento).
- Integração CRM: função SQL `union_whatsapp_find_customer_by_phone`
  liberada **somente para service_role**. Comparação precisa do DDD
  com número nacional de 10 ou 11 dígitos, com/sem +55;
  limitado a dois candidatos para detectar ambiguidade.
  Requer `customers.view`; sem telefone verificado ou múltiplos
  resultados não vincula. Mostra `Cliente: nome · Abrir cadastro`
  quando há um único candidato.
- Não alterar SAC Digital, seus protocolos, API ou autenticação.
- Edge Functions inbox/webhook implantadas no projeto CRM. Frontend
  commitado em main; produção depende de publicação externa.
- Ponte precisa receber novo `server.mjs` do main em VPS e
  reiniciar **apenas** `union-wuzapi-bridge`, não WuzAPI.

## Verificação sem alterar clientes
- RPC de busca de clientes existe, role authenticated não pode executar,
  service_role pode executar.
- Teste SQL em banco: 211 números de clientes consultáveis retornaram
  correspondência sob forma nacional normalizada com +55.
- O canal segue conectado e webhooks assinados; a gravação de áudio
  e as fotos ainda precisam de teste ponta a ponta com usuário real.
- Não executar envio de teste automaticamente para contatos reais.

## Pendente para equivalência total
- Transcodificar voz WebM em Ogg/Opus para ter bolha PTT nativa no
  Chrome. Exige suporte seguro no serviço de mídia da VPS, com teto de
  CPU, duração e taxa; não bloquear o processo da ponte.
- Setores/departamentos independentes do SAC, regras e permissões,
  filas por setor e transferências com histórico.
- Ações de OS dentro do atendimento e links bidirecionais de OS,
  pedido e orçamento; permissões por empresa.
- Presença (digitando/gravando) conforme eventos aceitos pelo WuzAPI.
- Resolver pares PN/LID somente quando Whatsmeow oferecer vínculo
  verificável, sem adivinhar telefones.
- Grandes anexos recebidos precisam usar streaming diretamente para
  Storage em vez de Base64 pela Edge; hoje alguns downloads têm teto
  legado de 5 MiB e não devem ser anunciados como completos.
