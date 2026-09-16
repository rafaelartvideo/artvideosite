# Assinatura eletrônica de documentos — Design

**Data:** 2026-09-16

**Escopo:** ArtVideo Admin, Cadastros, Ordens de Serviço, Documentos, Supabase, Storage, Edge Functions e páginas públicas.

## Objetivo

Adicionar assinatura eletrônica própria ao sistema da ArtVideo, sem depender de plataforma externa de assinatura. Um modelo de documento poderá optar por assinatura online; a OS gerará uma versão congelada do documento, o cliente ou responsável validará sua identidade por CPF/CNPJ + OTP enviado por e-mail, assinará na tela e receberá uma cópia final. A assinatura do funcionário será cadastrada previamente em seu Cadastro e aplicada automaticamente quando o modelo exigir.

A V1 é uma **assinatura eletrônica do próprio sistema**, com evidências técnicas e trilha de auditoria. Ela não deve ser apresentada como certificado digital ICP-Brasil ou assinatura qualificada.

## Decisões aprovadas

1. A assinatura interna passa a ser **Assinatura do funcionário**, e não apenas “Assinatura do técnico”.
2. Cada modelo em **Operação > Documentos** terá a opção **Permitir assinatura online**.
3. O modelo define se exige assinatura do cliente/responsável, do funcionário ou de ambos.
4. Quando exigir funcionário, o modelo define a origem: **Responsável da OS**, **Técnico**, **Quem concluiu** ou **Seleção manual**.
5. O funcionário cadastra sua assinatura uma vez em seu próprio Cadastro. O sistema a aplica automaticamente.
6. Assinaturas de funcionário são versionadas. Substituir a assinatura não altera documentos anteriores.
7. Se o funcionário necessário não possuir assinatura ativa, o envio é bloqueado e o usuário recebe um atalho para o Cadastro do funcionário.
8. Há no máximo **um assinante externo por documento** na V1.
9. O assinante externo pode ser o cliente cadastrado ou um responsável/contato informado no envio.
10. O assinante externo valida identidade por CPF/CNPJ e OTP por **e-mail** na V1.
11. WhatsApp envia o link por mensagem preenchida, abrindo a conversa do cliente; não envia OTP na V1.
12. O link tem validade configurável por modelo, com padrão de **72 horas**.
13. O documento é congelado no momento do envio e não acompanha alterações posteriores da OS, do modelo ou da assinatura do funcionário.
14. O cliente precisa marcar o aceite explícito antes de concluir a assinatura.
15. Auditoria registra data/hora, IP, navegador/dispositivo, método de validação e eventos relevantes.
16. O documento final inclui código de autenticidade e QR Code/link para uma página pública de verificação.
17. Após assinar, o sistema gera a versão final imutável, disponibiliza o PDF na OS e envia uma cópia por e-mail.
18. Uma solicitação ainda não assinada pode ser cancelada. Um documento já assinado nunca é apagado ou “desassinado”; correções geram uma nova versão/solicitação.
19. Solicitações expiradas permanecem no histórico. Gerar novo link após expiração cria uma nova solicitação, sem apagar a anterior.
20. Eventos relevantes também entram no Histórico da OS, mas tentativas individuais de OTP ficam apenas na auditoria específica da assinatura.

## Contexto atual que deve ser preservado

O sistema já possui `print_templates`, configurador de campos, renderer HTML para impressão e envio de documento por e-mail. O catálogo de campos atualmente possui `signatures.customer` e `signatures.technician`; a impressão resolve o segundo usando o técnico da OS.

A rota pública é baseada em React Router e já possui páginas standalone, como `/captura`. A nova assinatura pública seguirá esse mesmo padrão e não passará pelo painel autenticado.

Cadastros usa `entities` como registro canônico e identifica funcionário por `entity_roles`/`entity_employee_details`, mantendo vínculos legados quando necessário. A assinatura do funcionário deve ser vinculada ao `entities.id`, não ao registro legado de `employees`, para acompanhar a arquitetura unificada de Cadastros.

## Terminologia e compatibilidade

A chave canônica passa a ser:

- `signatures.customer` — assinatura do cliente/responsável;
- `signatures.employee` — assinatura do funcionário.

`signatures.technician` torna-se alias legado de `signatures.employee` durante carregamento/normalização dos modelos existentes. Nenhum modelo salvo atualmente pode perder a assinatura por causa da renomeação. O rótulo visual passa de **Assinatura do técnico** para **Assinatura do funcionário**.

Textos de interface, e-mails e comprovantes usarão “assinatura eletrônica”. A V1 não alegará ICP-Brasil, certificado digital ou assinatura qualificada.

## Configuração do modelo de documento

`print_templates` recebe:

- `allow_online_signature boolean not null default false`;
- `signature_link_ttl_hours integer not null default 72`, limitado de 1 a 720 horas;
- `require_external_signature boolean not null default true`;
- `require_employee_signature boolean not null default false`;
- `employee_signature_source text null`, aceitando `responsible`, `technician`, `completed_by`, `manual`.

Regras:

- modelo online precisa exigir pelo menos uma assinatura;
- `employee_signature_source` é obrigatório quando a assinatura do funcionário for exigida;
- o editor sincroniza os campos visuais: assinatura externa garante `signatures.customer`; assinatura interna garante `signatures.employee`;
- enquanto uma assinatura for obrigatória no fluxo online, o campo visual correspondente não pode ser removido;
- modelos sem assinatura online continuam funcionando como hoje para impressão e envio comum por e-mail.

A interface de validade oferece 24h, 48h, 72h, 7 dias e valor personalizado. O padrão é 72 horas.

## Assinatura cadastrada do funcionário

Criar `employee_signatures`:

- `id uuid`;
- `organization_id uuid`;
- `entity_id uuid` referenciando `entities(id)`;
- `version integer` crescente por funcionário;
- `is_active boolean`;
- `storage_path text`;
- `signature_hash text` SHA-256 dos bytes;
- `created_by uuid`;
- `created_at timestamptz`;
- `deactivated_at timestamptz null`.

Somente uma versão pode estar ativa por `(organization_id, entity_id)`.

**Cadastros > Funcionário** ganha uma seção `Assinatura` com pad compatível com mouse, toque e caneta, preview da versão atual e ação de substituir. Substituição cria nova versão e desativa a anterior; versões históricas não são apagadas.

A imagem é privada. Upload aceita somente formato de imagem definido pela aplicação, com limite de tamanho/dimensões; o servidor valida tipo e tamanho antes de consolidar o registro.

## Resolução do funcionário que assina

Ao emitir:

- `responsible`: resolve o responsável atual da OS para uma entidade com vínculo funcionário;
- `technician`: resolve o técnico vinculado à OS;
- `completed_by`: resolve o usuário que concluiu financeiramente a OS para sua entidade de funcionário;
- `manual`: exige seleção explícita entre funcionários ativos da organização.

Se a origem automática não resolver exatamente um funcionário válido — inclusive zero ou múltiplos técnicos — a tela exige seleção manual. Depois da seleção, é obrigatória uma assinatura ativa; sem ela, o envio fica bloqueado.

## Modelo de dados

### `document_signature_requests`

Representa uma emissão congelada e seu ciclo de assinatura.

Campos principais:

- `id uuid`;
- `organization_id uuid`;
- `service_order_id uuid`;
- `print_template_id uuid`;
- `status text`: `pending`, `viewed`, `signed`, `expired`, `cancelled`;
- `token_hash text`;
- `token_ciphertext text` — token cifrado com AES-GCM/chave de servidor para permitir que usuários autorizados recuperem o mesmo link sem guardar o token em texto aberto;
- `verification_code text unique` — código público aleatório de alta entropia, não sequencial;
- `expires_at timestamptz`;
- `created_by uuid`;
- `created_at timestamptz`;
- `first_viewed_at timestamptz null`;
- `signed_at timestamptz null`;
- `cancelled_at timestamptz null`;
- `cancelled_by uuid null`;
- `supersedes_request_id uuid null`;
- `external_signer_type text null`: `customer` ou `contact`;
- `external_signer_name text null`;
- `external_signer_email text null`;
- `external_signer_phone text null`;
- `external_document_hmac text null`;
- `external_document_masked text null`;
- `employee_entity_id uuid null`;
- `employee_signature_id uuid null`;
- `template_name_snapshot text`;
- `order_number_snapshot text`;
- `document_snapshot jsonb`;
- `snapshot_hash text`;
- `snapshot_html_storage_path text`;
- `employee_signature_storage_path text null`;
- `final_pdf_storage_path text null`;
- `final_pdf_hash text null`;
- `consent_text_snapshot text`.

O token bruto nunca fica em texto aberto no banco. `token_hash` é usado para validação pública; `token_ciphertext` só pode ser decifrado por Edge Function administrativa autorizada para abrir/copiar/reenviar o link já criado.

A identidade externa não precisa persistir CPF/CNPJ em texto aberto. O Edge Function normaliza o documento e gera HMAC com segredo do servidor; a comparação pública usa o mesmo HMAC. Interface e PDF exibem apenas a versão mascarada.

### `document_signatures`

Registra cada assinatura aplicada:

- `id uuid`;
- `request_id uuid`;
- `signer_type text`: `employee` ou `external`;
- `signer_name text`;
- `signer_document_masked text null`;
- `employee_entity_id uuid null`;
- `employee_signature_version integer null`;
- `signature_storage_path text`;
- `signature_hash text`;
- `validation_method text`: `stored_employee_signature` ou `email_otp`;
- `consent_accepted boolean`;
- `consent_text_snapshot text null`;
- `signed_at timestamptz`.

Há no máximo uma assinatura `employee` e uma `external` por solicitação na V1. Quando o modelo exige funcionário, a assinatura ativa é copiada para o escopo da solicitação no momento da criação e registrada aqui.

### `document_signature_events`

Trilha append-only:

- `id uuid`;
- `request_id uuid`;
- `organization_id uuid`;
- `event_type text`;
- `actor_type text`: `admin`, `external`, `system`;
- `actor_user_id uuid null`;
- `ip_address inet null`;
- `user_agent text null`;
- `metadata jsonb` sem segredos;
- `created_at timestamptz`.

Eventos mínimos: `request_created`, `signature_email_sent`, `signature_email_resent`, `link_viewed`, `identity_verified`, `otp_sent`, `otp_failed`, `otp_verified`, `consent_accepted`, `signature_submitted`, `pdf_generated`, `signed`, `final_copy_emailed`, `cancelled`, `expired`, `replacement_created`.

OTP, token público e segredos nunca entram em `metadata`.

### `document_signature_otp_challenges`

Tabela interna de infraestrutura, sem acesso direto por RLS, contendo `request_id`, HMAC do código, expiração, tentativas, contagem de envios, `last_sent_at`, `verified_at` e timestamps.

## Snapshot congelado

Ao clicar **Enviar para assinatura**, o frontend autenticado usa o mesmo catálogo e configuração já usados na impressão para montar um `document_snapshot` serializável contendo valores resolvidos, labels, seções, listas, mídias autorizadas, dados da empresa, configuração visual, identificação da OS e assinaturas exigidas.

O payload é validado pelo Edge Function contra OS/template/organização e por schema fechado: somente chaves previstas, limites de tamanho e referências de mídia pertencentes à organização/OS podem ser persistidas. O snapshot não mantém referências vivas que o façam mudar com a OS.

O Edge Function de criação:

1. valida JWT, organização, permissão, OS e template;
2. valida que o template permite assinatura online;
3. valida assinante externo quando exigido;
4. resolve/valida funcionário e assinatura;
5. valida o schema do snapshot e suas mídias;
6. grava snapshot imutável;
7. calcula SHA-256 do JSON canônico;
8. congela a assinatura do funcionário;
9. gera token público aleatório com no mínimo 32 bytes, salva hash e versão cifrada;
10. gera `verification_code` aleatório com entropia suficiente para impedir enumeração prática;
11. define expiração;
12. grava auditoria;
13. envia o e-mail inicial quando houver assinante externo.

Depois de criada, nenhuma operação pode alterar snapshot, hash, OS, template ou identificação dos signatários. Trigger de banco bloqueia atualização dos campos imutáveis.

## HTML, PDF e hashes

A V1 mantém:

1. **snapshot semântico JSON**, fonte canônica do conteúdo;
2. **HTML congelado/sanitizado** para visualização pública;
3. **PDF final** após completar as assinaturas exigidas.

O HTML nunca é executado como conteúdo arbitrário. A preferência é renderizar o snapshot com componentes React seguros. Se o HTML congelado for reutilizado, ele deve ser sanitizado e exibido em `iframe sandbox` sem `allow-scripts`.

O PDF é gerado server-side do `document_snapshot`, nunca da OS atual. A implementação usará biblioteca compatível com Supabase Edge Functions, preferencialmente `pdf-lib`, sem navegador headless. O renderer suporta cabeçalho, campos, seções, tabelas, produtos, checklists/fotos selecionados, assinaturas e rodapé de autenticidade. O conteúdo semântico deve ser o mesmo da visualização congelada, ainda que a paginação seja própria do PDF.

Hashes:

- `snapshot_hash`: SHA-256 do JSON canônico;
- `signature_hash`: SHA-256 de cada imagem;
- `final_pdf_hash`: SHA-256 dos bytes do PDF.

O PDF inclui código de verificação, nome do(s) assinante(s), documento externo mascarado, data/hora, método de validação, QR Code para `/verificar-documento/:verificationCode` e hash do PDF.

## Storage

Buckets privados:

### `employee-signatures`

`{organization_id}/{entity_id}/{employee_signature_id}.png`

### `signed-documents`

`{organization_id}/{service_order_id}/{request_id}/snapshot.html`

`{organization_id}/{service_order_id}/{request_id}/employee-signature.png`

`{organization_id}/{service_order_id}/{request_id}/external-signature.png`

`{organization_id}/{service_order_id}/{request_id}/signed.pdf`

Nenhum objeto possui URL pública permanente. Downloads são temporários/autorizados.

## Fluxo interno — OS > Documentos

Para modelos habilitados, mostrar **Enviar para assinatura**.

O modal exibe modelo, assinante externo (cliente ou responsável/contato), nome, CPF/CNPJ, e-mail, telefone/WhatsApp, funcionário que assinará, origem configurada, validade e resumo das assinaturas exigidas.

Bloquear quando faltar e-mail/documento do assinante externo, funcionário requerido, assinatura ativa, template habilitado ou campos essenciais.

Após criar, Documentos da OS mostra nome, status, assinante, funcionário, criação/envio, validade, primeira visualização e assinatura.

Ações enquanto pendente/visualizado: abrir link, copiar link, enviar/reenviar e-mail, abrir WhatsApp preenchido, cancelar e ver auditoria.

Após assinado: ver documento, baixar PDF, ver auditoria e abrir verificação de autenticidade.

Expirado/cancelado permanece no histórico. Novo link depois de terminal cria nova solicitação e mantém a anterior.

## Fluxo público

Rota standalone: `/assinatura/:token`.

1. **Abrir link:** Edge Function compara `token_hash`, verifica estado/expiração, retorna somente empresa, nome do documento, assinante esperado mascarado e instruções. Primeiro acesso registra `link_viewed`.
2. **Confirmar identidade:** CPF/CNPJ normalizado é comparado por HMAC; respostas não revelam qual parte está incorreta.
3. **Solicitar OTP:** 6 dígitos, 10 minutos, 60 segundos entre envios, máximo de 5 envios/hora por solicitação/IP e 5 tentativas por desafio. Somente e-mail na V1.
4. **Validar OTP:** servidor retorna prova curta, assinada pelo próprio servidor e com expiração; não cria sessão Supabase pública.
5. **Visualizar:** somente após identidade + OTP; usa o snapshot congelado.
6. **Aceite e assinatura:** checkbox obrigatório com texto congelado e signature pad. Concluir exige aceite e traço válido.
7. **Finalizar:** revalida token/prova/estado/expiração, grava assinatura e evidências, gera PDF, persiste o PDF, marca `signed` de forma idempotente, envia cópia por e-mail e grava Histórico da OS.
8. **Conclusão:** mostra confirmação, código de autenticidade e download temporário.

## Modelo somente com funcionário

Se exigir funcionário e não assinante externo, a emissão congela a assinatura e finaliza o PDF imediatamente. Não há link público nem OTP.

## Status e transições

Válidas:

- `pending -> viewed`;
- `pending -> signed`;
- `viewed -> signed`;
- `pending -> cancelled`;
- `viewed -> cancelled`;
- `pending -> expired`;
- `viewed -> expired`.

`signed`, `expired`, `cancelled` são terminais. A expiração é aplicada de forma preguiçosa/transacional em qualquer operação pública ou administrativa; a V1 não depende de cron para bloquear assinatura após o prazo.

## Cancelamento, correção e reenvio

- cancelar invalida o token imediatamente;
- assinado não pode ser cancelado/excluído;
- reenviar por e-mail antes da expiração reutiliza o mesmo link e registra evento;
- abrir/copiar o link no Admin decifra o token somente após autorização e nunca o expõe em listagens/logs;
- expiração/cancelamento exige nova solicitação/token;
- corrigir conteúdo após assinatura exige novo snapshot/solicitação;
- `supersedes_request_id` liga versões sem apagar histórico.

## Página pública de autenticidade

Rota: `/verificar-documento/:verificationCode`.

Mostra somente: documento válido/registrado, empresa emissora, nome/tipo, código, data/hora, nomes dos assinantes em nível adequado, CPF/CNPJ externo mascarado, métodos de validação e hash do PDF.

Não permite baixar o PDF e não mostra OS, endereço, valores ou conteúdo. O `verificationCode` é aleatório e não enumerável na prática.

## E-mail e WhatsApp

Reaproveitar infraestrutura/provedor de `send-order-document-email`, mas separar templates e operações do fluxo de assinatura.

E-mails: convite inicial, reenvio, OTP e confirmação final. OTP nunca é retornado ao frontend. A cópia final anexa o PDF quando estiver no limite do provedor; se exceder, envia link temporário autenticado.

WhatsApp abre `wa.me`/equivalente com mensagem pronta contendo empresa, documento, validade e link. V1 não afirma entrega e não envia OTP por WhatsApp.

## Histórico da OS

Registrar apenas eventos operacionais: documento enviado, primeira visualização, assinado, cancelado, expirado e nova versão. Tentativas de OTP, IP e user-agent ficam somente em `document_signature_events`.

## Permissões

- `documents.signatures.view`;
- `documents.signatures.send`;
- `documents.signatures.resend`;
- `documents.signatures.cancel`;
- `documents.signatures.audit`;
- `registrations.employee_signature.manage`.

Ler PDF assinado exige acesso à OS/documentos e à organização. Gerenciar assinatura do funcionário não concede permissão para enviar documentos.

## RLS e fronteira pública

- todas as tabelas carregam `organization_id` quando aplicável e RLS por membership/permissão;
- `employee_signatures` nunca é anônima;
- requests/signatures/events/OTP não concedem acesso anônimo direto;
- operações públicas acontecem exclusivamente por Edge Functions com service role;
- Edge Functions públicas retornam DTOs mínimos/mascarados;
- operações administrativas validam JWT, organização e permissão antes do service role;
- Storage é privado, acessado por URL temporária ou streaming autorizado.

## Segurança

### Token

No mínimo 32 bytes aleatórios. Banco guarda SHA-256 para comparação pública e versão AES-GCM cifrada para recuperação administrativa autorizada. A chave (`SIGNATURE_TOKEN_KEY`) existe somente no ambiente das Edge Functions. Token nunca aparece em logs ou eventos.

### CPF/CNPJ

Normalizar para dígitos e comparar por HMAC-SHA-256 com `SIGNATURE_IDENTITY_PEPPER`. Solicitação guarda HMAC e forma mascarada, não o documento completo.

### OTP

6 dígitos, 10 minutos, HMAC server-side, cooldown de 60 segundos, 5 tentativas por desafio, 5 envios/hora por solicitação/IP e respostas genéricas. OTP nunca aparece em logs/auditoria.

### Idempotência

Finalização usa lock transacional/condição de estado. Dois cliques/requisições simultâneas não geram duas assinaturas ou PDFs diferentes.

### Auditoria e privacidade

IP e user-agent são restritos a `documents.signatures.audit`, não aparecem na página pública nem na UI comum da OS.

## Edge Functions

### `document-signature-admin`

Autenticada: criar solicitação, recuperar link, reenviar e-mail, cancelar, montar WhatsApp, download temporário e auditoria.

### `document-signature-public`

Sem sessão Admin: inspecionar token, confirmar identidade, solicitar/validar OTP, carregar snapshot após validação, concluir assinatura e download temporário pós-assinatura.

### `document-verification`

Consulta pública por `verification_code` e retorna somente DTO de autenticidade.

Utilitários compartilhados ficam em `supabase/functions/_shared/document-signatures/`: hashing/HMAC, cifragem, CORS, autorização, e-mail, PDF, QR e normalização.

## Frontend

**Operação > Documentos:** configurações online e renomeação técnico -> funcionário.

**Cadastros > Funcionário:** seção/pad/preview/versionamento da assinatura.

**OS > Documentos:** Enviar para assinatura, modal de criação, lista/cards, e-mail, WhatsApp, cancelamento, auditoria e PDF.

**Público:** `/assinatura/:token` e `/verificar-documento/:verificationCode`, standalone e mobile-first.

## Falhas obrigatórias

Tratar: link inválido/expirado/cancelado/já assinado, identidade incorreta, OTP inválido/expirado/limitado, e-mail ausente, assinatura de funcionário ausente, funcionário não resolvido/múltiplos técnicos, falha de e-mail, falha de PDF e falha de cópia final.

Se o convite por e-mail falhar, a solicitação continua criada e a UI permite reenviar. A solicitação só recebe `signed` depois que o PDF final foi persistido. Se a geração do PDF falhar após a assinatura externa ser capturada, a operação pode ser repetida idempotentemente sem pedir nova assinatura ao cliente.

## Imutabilidade

- sem DELETE de documentos assinados;
- sem exclusão de eventos pelo frontend;
- versões históricas de assinatura do funcionário não são apagadas;
- snapshot assinado/finalizado é imutável;
- PDF final é imutável;
- triggers/policies bloqueiam mutação direta desses dados após finalização.

## Fases de implementação

A funcionalidade será implementada em planos separados e testáveis, mantendo esta spec como contrato comum.

### Fase 1 — Funcionário e modelo

Renomear técnico -> funcionário com alias legado; configurar assinatura online nos templates; criar `employee_signatures`/Storage; adicionar captura/versionamento em Cadastros.

### Fase 2 — Emissão e gerenciamento na OS

Criar requests/signatures/events/OTP/RLS; Edge Function administrativa; snapshot/hash/token; congelamento do funcionário; UI da OS; convite por e-mail e WhatsApp preenchido.

### Fase 3 — Assinatura pública

Criar `/assinatura/:token`; identidade por HMAC; OTP; visualização segura; aceite; signature pad; finalização idempotente.

### Fase 4 — PDF, autenticidade e pós-assinatura

Renderer PDF server-side; QR/código; `/verificar-documento/:verificationCode`; download seguro; e-mail final; auditoria visual; Histórico da OS.

## Fora de escopo da V1

- API oficial do WhatsApp;
- OTP por WhatsApp/SMS;
- múltiplos assinantes externos;
- sequência de vários signatários externos;
- certificado ICP-Brasil;
- biometria/reconhecimento facial;
- Clicksign/DocuSign/ZapSign ou equivalentes;
- edição da emissão depois de criada;
- exclusão de documento assinado.

## Critérios de aceite globais

1. Modelos antigos com `signatures.technician` continuam funcionando, agora como assinatura de funcionário.
2. Somente modelos habilitados oferecem envio online.
3. Funcionário sem assinatura ativa bloqueia emissão que exija assinatura interna.
4. Alterar OS/modelo/assinatura do funcionário depois da emissão não altera o snapshot.
5. Link expirado/cancelado nunca permite assinatura.
6. CPF/CNPJ incorreto não libera OTP/conteúdo e não revela dados sensíveis.
7. OTP respeita validade, cooldown, tentativas e rate limit.
8. Conteúdo do documento só fica visível após identidade + OTP quando houver assinante externo.
9. Aceite e assinatura desenhada são obrigatórios para o assinante externo.
10. Documento assinado não pode ser excluído, alterado ou desassinado.
11. PDF final contém assinatura(s), evidências resumidas, código e QR de autenticidade.
12. Página de verificação confirma autenticidade sem expor conteúdo da OS.
13. E-mail inicial/final funciona; WhatsApp abre com texto/link prontos.
14. Eventos relevantes possuem auditoria; IP/user-agent são restritos à permissão de auditoria.
15. Histórico da OS recebe somente eventos operacionais de alto nível.
16. Todo acesso respeita organização, permissões e RLS; nenhuma tabela/bucket sensível é público.
17. O mesmo link pode ser recuperado por um usuário autorizado sem armazenar token em texto aberto.
18. HTML/snapshot público não permite execução de scripts arbitrários.
