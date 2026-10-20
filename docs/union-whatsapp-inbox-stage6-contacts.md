# Union WhatsApp — Etapa 6: contatos e fotos

## Alterações concluídas no repositório
- Agenda própria `union_whatsapp_contacts` por empresa/canal/JID.
- **Prioridade explícita:** `display_name` (editado na Union) >
  `device_name` (VCF exportado do celular) > `imported_name`
  (agenda disponível no WuzAPI) > `profile_name` (PushName público).
- Importação manual da agenda WuzAPI em lotes com validação de JID,
  limite de 2.000 por execução, sem modificar `display_name`.
- Importação opcional de arquivo VCF do celular com limite de 2 MB,
  2.000 contatos e lotes de 100 nomes/números brasileiros.
  Nomes `device_name` preservam `display_name`.
- Lista de contatos pesquisável e paginada, adicionar, editar nome
  próprio, consultar miniatura de perfil e abrir conversa existente,
  ou iniciar novo contato com número PN validado.
- Mensagens recebidas e enviadas usam a agenda Union antes do
  PushName público; nunca confundem nome do titular em eventos `IsFromMe`.
- Contatos LID sem PN verificável não são mesclados por semelhança
  de nome ou por suposição de telefone.
- RLS em contatos sem políticas diretas; permissões via
  `union-whatsapp-inbox` JWT/empresa e `whatsapp.inbox.*`.
  A função SQL de reconciliar nomes não tem EXECUTE para authenticated.

## Fotos de perfil
- Backend WuzAPI `GET /user/avatar` requer corpo JSON com
  `Phone` e `Preview`; é consultado pela ponte em loopback.
- A ponte baixa a foto somente de HTTPS com hosts
  WhatsApp/Facebook aprovados e redirecionamento validado, restringe
  a 200 kB e confirma assinatura JPEG/PNG/WebP.
- A Edge recebe Base64 sob HMAC e entrega imagem ao navegador já em
  `data:image/*;base64,...` sem expor o token WuzAPI nem depender
  de acesso direto do navegador à CDN.
- Fotos das primeiras conversas visíveis são consultadas em lotes
  pequenos; ao abrir contato, consulta miniatura.
- Se o perfil não tiver foto ou a privacidade não permitir acesso,
  as iniciais são fallback esperado. Nenhuma foto é inventada.

## Implantação e validação
- Migrations e Edge Functions `union-whatsapp-inbox` e
  `union-whatsapp-webhook` implantadas no Supabase CRM.
- Frontend em `main`, ainda depende da publicação normal do site.
- **Obrigatório na VPS:** instalar novo
  `services/union-wuzapi-bridge/server.mjs` do commit
  `bf93f62a7df9fb915e6ed24e918d1886675e2dd6`
  e reiniciar somente `union-wuzapi-bridge`.
- Após atualizar: abrir **Contatos → WuzAPI** para importar;
  ou importar VCF da agenda real do celular.
- Importar WuzAPI não garante acesso aos nomes realmente salvos no
  telefone principal: a sincronização Multi-device pode fornecer
  apenas PushName. VCF supre essa lacuna manualmente.
- A implantação das funções não executou testes de foto/agenda
  com a sessão real do cliente; testar com um contato conhecido
  após atualizar a ponte. Não reiniciar WuzAPI ou SAC Digital.
