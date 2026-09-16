# Assinatura eletrônica de documentos — Design

**Data:** 2026-09-16

**Escopo:** ArtVideo Admin, Cadastros, Ordens de Serviço, Documentos, Supabase, Storage, Edge Functions e páginas públicas.

## Objetivo

Adicionar assinatura eletrônica própria ao sistema da ArtVideo, sem depender de uma plataforma externa de assinatura. Um modelo de documento poderá optar por assinatura online; a OS gerará uma versão congelada do documento, o cliente ou responsável validará sua identidade por CPF/CNPJ + OTP enviado por e-mail, assinará na tela e receberá uma cópia final. A assinatura do funcionário será cadastrada previamente em seu Cadastro e aplicada automaticamente quando o modelo exigir.

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

### Campo de assinatura do funcionário

A chave canônica passa a ser:

- `signatures.customer` — assinatura do cliente/responsável;
- `signatures.employee` — assinatura do funcionário.

`signatures.technician` torna-se um alias legado de `signatures.employee` durante carregamento/normalização dos modelos existentes. Nenhum modelo salvo atualmente pode perder a assinatura por causa da renomeação.

O rótulo visual passa de **Assinatura do técnico** para **Assinatura do funcionário**.

### Assinatura eletrônica x certificado digital

Textos de interface, e-mails e comprovantes usarão “assinatura eletrônica”. A V1 não alegará ICP-Brasil, certificado digital ou assinatura qualificada.

## Configuração do modelo de documento

`print_templates` recebe configurações explícitas do fluxo online:

- `allow_online_signature boolean not null default false`;
- `signature_link_ttl_hours integer not null default 72`, com limite entre 1 hora e 720 horas;
- `require_external_signature boolean not null default true`;
- `require_employee_signature boolean not null default false`;
- `employee_signature_source text null`, aceitando `responsible`, `technician`, `completed_by`, `manual`.

Regras:

- um modelo com `allow_online_signature = true` precisa exigir pelo menos uma assinatura;
- `employee_signature_source` é obrigatório quando `require_employee_signature = true`;
- o editor sincroniza os campos visuais de assinatura: assinatura externa garante `signatures.customer`; assinatura interna garante `signatures.employee`;
- enquanto a assinatura for exigida pelo fluxo online, o campo correspondente não pode ser removido da composição visual;
- modelos que não permitem assinatura online continuam funcionando exatamente como hoje para impressão e envio comum por e-mail.

### Validade do link

A interface oferece atalhos 24h, 48h, 72h, 7 dias e valor personalizado. O banco persiste o total em horas. O padrão é 72 horas.

## Assinatura cadastrada do funcionário

Criar `employee_signatures` com:

- `id uuid`;
- `organization_id uuid`;
- `entity_id uuid` referenciando `entities(id)`;
- `version integer` crescente por funcionário;
- `is_active boolean`;
- `storage_path text` para a imagem privada;
- `signature_hash text` SHA-256 dos bytes da assinatura;
- `created_by uuid`;
- `created_at timestamptz`;
- `deactivated_at timestamptz null`.

Somente um registro pode estar ativo por `(organization_id, entity_id)`.

A UI de **Cadastros > Funcionário** ganha uma seção `Assinatura` com pad de assinatura compatível com mouse, toque e caneta. O funcionário pode cadastrar ou substituir sua assinatura. Substituição cria nova versão e desativa a anterior; versões antigas não são apagadas.

A assinatura é armazenada em bucket privado, em caminho segregado por organização e funcionário. Não existe URL pública permanente.

## Resolução do funcionário que assina

Ao gerar um documento:

- `responsible`: resolve o responsável atual da OS para uma entidade com vínculo funcionário;
- `technician`: resolve o técnico vinculado à OS;
- `completed_by`: resolve o usuário que concluiu financeiramente a OS para sua entidade de funcionário;
- `manual`: exige seleção explícita entre funcionários ativos da organização.

Se a origem automática não resolver exatamente um funcionário válido, a tela exige seleção manual antes de continuar. Isso inclui o caso de múltiplos técnicos.

Depois da seleção, o sistema valida a existência de assinatura ativa. Sem assinatura, o envio fica bloqueado.

## Modelo de dados do fluxo de assinatura

### `document_signature_requests`

Representa uma emissão congelada e seu ciclo de assinatura.

Campos principais:

- `id uuid`;
- `organization_id uuid`;
- `service_order_id uuid`;
- `print_template_id uuid`;
- `status text`: `pending`, `viewed`, `signed`, `expired`, `cancelled`;
- `token_hash text` — apenas hash do token público; o token bruto nunca é salvo;
- `verification_code text unique` — código público para autenticidade;
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
- `employee_signature_storage_path text null` — cópia congelada para esta emissão;
- `final_pdf_storage_path text null`;
- `final_pdf_hash text null`;
- `consent_text_snapshot text`.

A identidade externa não precisa persistir CPF/CNPJ em texto aberto dentro da solicitação. O Edge Function normaliza o documento e gera HMAC usando segredo do servidor; a comparação pública usa o mesmo HMAC. A interface e o PDF exibem somente a versão mascarada.

### `document_signatures`

Registra cada assinatura aplicada à emissão.

Campos principais:

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

Há no máximo uma assinatura `employee` e uma `external` por solicitação na V1.

Quando o modelo exige funcionário, a assinatura automática é copiada para o escopo da solicitação no momento da criação e registrada em `document_signatures`; trocar a assinatura do funcionário depois não afeta a emissão.

### `document_signature_events`

Trilha append-only de auditoria.

Campos principais:

- `id uuid`;
- `request_id uuid`;
- `organization_id uuid`;
- `event_type text`;
- `actor_type text`: `admin`, `external`, `system`;
- `actor_user_id uuid null`;
- `ip_address inet null`;
- `user_agent text null`;
- `metadata jsonb` com dados não secretos;
- `created_at timestamptz`.

Eventos incluem no mínimo:

- `request_created`;
- `signature_email_sent`;
- `signature_email_resent`;
- `link_viewed`;
- `identity_verified`;
- `otp_sent`;
- `otp_failed`;
- `otp_verified`;
- `consent_accepted`;
- `signature_submitted`;
- `pdf_generated`;
- `signed`;
- `final_copy_emailed`;
- `cancelled`;
- `expired`;
- `replacement_created`.

OTP, token público e outros segredos nunca entram em `metadata`.

### Tabela de suporte de OTP

Criar uma tabela interna `document_signature_otp_challenges`, não exposta diretamente por RLS, contendo `request_id`, hash/HMAC do código, expiração, número de tentativas, contagem de envios, `last_sent_at`, `verified_at` e timestamps. Ela é infraestrutura de segurança, não um quinto agregado de domínio.

## Snapshot congelado do documento

Ao clicar **Enviar para assinatura**, o frontend autenticado usa o mesmo catálogo de campos e configuração de documento já usados na impressão para montar um `document_snapshot` serializável.

O snapshot contém somente valores resolvidos, labels, seções, listas, imagens necessárias, dados da empresa, configuração visual, identificação da OS e dados das assinaturas exigidas. Ele não mantém referências vivas que façam o documento mudar quando a OS mudar.

O Edge Function de criação:

1. valida JWT, organização, permissão, OS e template;
2. valida que o template permite assinatura online;
3. valida assinante externo quando exigido;
4. resolve/valida o funcionário e sua assinatura;
5. grava o snapshot imutável;
6. calcula SHA-256 do JSON canônico do snapshot;
7. congela a assinatura do funcionário;
8. gera token público aleatório criptograficamente seguro e salva apenas seu hash;
9. define expiração;
10. grava auditoria;
11. envia o e-mail inicial quando há assinante externo.

Depois de criada, nenhuma operação pode alterar snapshot, hash, OS, template ou identificação dos signatários. Atualizações são limitadas a estado, timestamps e artefatos gerados. Um trigger de banco bloqueia alteração dos campos imutáveis.

## HTML, PDF e hashes

A V1 mantém dois artefatos:

1. **HTML congelado** usado para a visualização pública do conteúdo antes da assinatura;
2. **PDF final** gerado após completar todas as assinaturas exigidas.

O PDF final é gerado do `document_snapshot` congelado, e não da OS atual. A geração server-side usará uma biblioteca PDF compatível com Supabase Edge Functions, preferencialmente `pdf-lib`, evitando dependência de navegador headless.

O renderer PDF precisa suportar o conteúdo já usado pelos documentos da OS: cabeçalho da empresa, campos, seções, tabelas, produtos, checklists/fotos quando selecionados, assinaturas e rodapé de autenticidade. O conteúdo semântico precisa ser o mesmo do HTML congelado, ainda que a paginação seja específica do PDF.

Hashes:

- `snapshot_hash`: SHA-256 do JSON canônico congelado antes da assinatura externa;
- `signature_hash`: SHA-256 de cada imagem de assinatura;
- `final_pdf_hash`: SHA-256 dos bytes do PDF final.

O PDF final inclui uma área de autenticidade com:

- código de verificação;
- nome do(s) assinante(s);
- documento externo mascarado;
- data/hora;
- método de validação;
- QR Code para `/verificar-documento/:verificationCode`;
- hash do PDF, apresentado de forma legível.

## Storage

Buckets privados:

### `employee-signatures`

Estrutura sugerida:

`{organization_id}/{entity_id}/{employee_signature_id}.png`

### `signed-documents`

Estrutura sugerida:

`{organization_id}/{service_order_id}/{request_id}/snapshot.html`

`{organization_id}/{service_order_id}/{request_id}/employee-signature.png`

`{organization_id}/{service_order_id}/{request_id}/external-signature.png`

`{organization_id}/{service_order_id}/{request_id}/signed.pdf`

Nenhum desses objetos terá URL pública permanente. Admin e assinante recebem downloads temporários por função autorizada.

## Fluxo interno — OS > Documentos

Para modelos com `allow_online_signature = true`, mostrar **Enviar para assinatura**.

O modal de envio exibe:

- modelo/documento;
- assinante externo: cliente cadastrado ou responsável/contato;
- nome, CPF/CNPJ, e-mail e telefone/WhatsApp quando aplicável;
- funcionário que assinará automaticamente;
- origem configurada no modelo;
- validade do link;
- resumo das assinaturas exigidas.

Antes de confirmar, bloquear quando faltar:

- e-mail do assinante externo;
- CPF/CNPJ de validação;
- funcionário requerido;
- assinatura ativa do funcionário;
- template habilitado;
- campos essenciais do documento.

Após criar a solicitação, a área de Documentos da OS mostra card/linha com:

- nome do documento;
- status;
- assinante;
- funcionário;
- enviado/criado em;
- validade;
- primeira visualização;
- assinatura em.

Ações enquanto pendente/visualizado:

- abrir link;
- copiar link;
- enviar/reenviar por e-mail;
- abrir WhatsApp com mensagem pronta;
- cancelar solicitação;
- ver auditoria.

Após assinatura:

- ver documento assinado;
- baixar PDF;
- ver auditoria;
- abrir verificação de autenticidade.

Expirado ou cancelado permanece visível. Criar novo link gera nova solicitação e mantém a anterior no histórico.

## Fluxo público de assinatura

Criar rota standalone:

`/assinatura/:token`

Ela não usa sessão do Admin e não expõe a OS completa.

### Etapas

1. **Abrir link**
   - Edge Function recebe token e compara hash;
   - verifica status e expiração;
   - retorna somente dados mínimos: empresa, nome do documento, assinante esperado mascarado e instruções;
   - primeiro acesso registra `link_viewed` e `first_viewed_at`.

2. **Confirmar identidade**
   - usuário informa CPF/CNPJ;
   - servidor normaliza e compara HMAC;
   - erros não revelam qual parte da identidade está incorreta.

3. **Solicitar OTP**
   - código numérico de 6 dígitos;
   - validade de 10 minutos;
   - intervalo mínimo de 60 segundos entre envios;
   - máximo de 5 envios por hora por solicitação/IP;
   - máximo de 5 tentativas por desafio;
   - somente e-mail na V1.

4. **Validar OTP**
   - Edge Function valida desafio;
   - retorna prova curta de acesso à etapa de assinatura, assinada pelo servidor e com expiração;
   - nenhuma sessão Supabase pública é criada.

5. **Visualizar documento**
   - somente após identidade + OTP;
   - carrega o HTML congelado;
   - nenhuma informação fora do snapshot é consultada.

6. **Aceite e assinatura**
   - checkbox obrigatório com o texto congelado de aceite;
   - pad de assinatura com mouse/touch/caneta;
   - botão concluir fica desabilitado sem aceite ou assinatura válida.

7. **Finalização**
   - Edge Function revalida token, prova de OTP, estado e expiração;
   - grava assinatura externa e hashes;
   - registra IP/user-agent e aceite;
   - gera PDF final;
   - marca `signed` em transação idempotente;
   - envia cópia por e-mail;
   - registra eventos e Histórico da OS.

8. **Conclusão**
   - página confirma assinatura;
   - oferece download temporário do PDF final;
   - mostra código de autenticidade.

## Modelos somente com funcionário

Se um template permitir assinatura online, exigir funcionário e não exigir assinante externo, a criação da emissão congela e aplica a assinatura do funcionário e finaliza o PDF imediatamente. Não há link público nem OTP. O documento aparece como assinado/finalizado dentro da OS.

## Status e transições

Transições válidas:

- `pending -> viewed`;
- `pending -> signed`;
- `viewed -> signed`;
- `pending -> cancelled`;
- `viewed -> cancelled`;
- `pending -> expired`;
- `viewed -> expired`.

`signed`, `expired` e `cancelled` são terminais para aquela solicitação.

A expiração é aplicada de forma preguiçosa e transacional em qualquer operação pública ou administrativa sobre a solicitação. A V1 não depende de cron para impedir assinatura após o prazo.

## Cancelamento, correção e reenvio

- cancelar invalida imediatamente o token;
- assinado não pode ser cancelado nem excluído;
- reenviar por e-mail antes da expiração usa a solicitação ativa e registra evento;
- gerar um novo link após expiração/cancelamento cria nova solicitação com novo token;
- corrigir qualquer conteúdo após assinatura gera novo snapshot e nova solicitação;
- `supersedes_request_id` liga a nova emissão à anterior sem apagá-la.

## Página pública de autenticidade

Criar rota:

`/verificar-documento/:verificationCode`

A página é acessível sem login e mostra apenas:

- documento válido/registrado;
- empresa emissora;
- nome/tipo do documento;
- código de verificação;
- data/hora da assinatura;
- nomes dos assinantes de forma adequada;
- CPF/CNPJ externo mascarado;
- métodos de validação;
- hash do PDF final.

Ela **não** permite baixar o PDF e não mostra dados da OS, endereço, valores ou demais informações do documento. Seu objetivo é confirmar autenticidade, não disponibilizar conteúdo.

## E-mail e WhatsApp

### E-mail

Reaproveitar a infraestrutura/provedor já usado por `send-order-document-email`, mas separar templates e operações do fluxo de assinatura.

E-mails da V1:

- convite inicial com link e validade;
- reenvio do convite;
- OTP;
- confirmação final com cópia do documento assinado.

O OTP nunca é retornado ao frontend administrativo ou público.

A cópia final deve anexar o PDF quando estiver dentro do limite suportado pelo provedor. Se o PDF exceder o limite, enviar link temporário autenticado para download, sem tornar o bucket público.

### WhatsApp

O Admin cria uma URL `wa.me`/equivalente usando o telefone do cadastro e uma mensagem pré-preenchida contendo nome da empresa, nome do documento, validade e link de assinatura. A V1 não afirma que a mensagem foi entregue; apenas registra a ação de abrir o compartilhamento, se necessário.

OTP por WhatsApp fica fora da V1.

## Histórico da OS

Eventos resumidos entram também no histórico operacional da OS:

- documento enviado para assinatura;
- documento visualizado pela primeira vez;
- documento assinado;
- solicitação cancelada;
- solicitação expirada;
- nova versão gerada.

Eventos de OTP, tentativas, IP e user-agent permanecem apenas em `document_signature_events` para não poluir o histórico operacional.

## Permissões

Adicionar permissões específicas:

- `documents.signatures.view`;
- `documents.signatures.send`;
- `documents.signatures.resend`;
- `documents.signatures.cancel`;
- `documents.signatures.audit`;
- `registrations.employee_signature.manage`.

Leitura do PDF assinado também exige acesso à OS/documentos e à organização correspondente.

A gestão da própria assinatura de funcionário não implica permissão para enviar documentos para assinatura.

## RLS e fronteira pública

- tabelas de assinatura usam `organization_id` e RLS por membership/permissão;
- `employee_signatures` nunca é anônima;
- tabelas de request/signature/event/OTP não concedem SELECT/INSERT/UPDATE anônimo direto;
- operações públicas acontecem exclusivamente por Edge Functions com service role;
- Edge Functions públicas retornam somente DTOs mínimos e mascarados;
- operações administrativas em Edge Functions validam JWT, organização e permissão antes de usar service role;
- Storage é privado e acessado por URLs temporárias ou streaming autorizado.

## Segurança

### Token público

Gerar no mínimo 32 bytes aleatórios criptograficamente seguros. O banco recebe apenas SHA-256 do token. Comparações são feitas server-side.

### CPF/CNPJ

Normalizar para dígitos e comparar por HMAC-SHA-256 com um segredo de servidor (`SIGNATURE_IDENTITY_PEPPER`). Não salvar o documento completo na solicitação; manter somente HMAC e forma mascarada.

### OTP

- 6 dígitos;
- 10 minutos;
- hash/HMAC server-side;
- 60 segundos de cooldown;
- 5 tentativas por desafio;
- 5 envios/hora por solicitação/IP;
- respostas genéricas para evitar enumeração;
- OTP nunca aparece em logs de aplicação ou auditoria.

### Idempotência

Finalizar assinatura usa lock transacional/condição de estado para garantir que dois cliques ou duas requisições simultâneas não gerem duas assinaturas ou PDFs diferentes.

### Auditoria

IP e user-agent são dados restritos de auditoria: não aparecem em páginas públicas nem na UI comum da OS; somente usuários com `documents.signatures.audit` podem visualizar.

## Edge Functions

Separar responsabilidades em funções pequenas:

### `document-signature-admin`

Operações autenticadas:

- criar solicitação;
- reenviar e-mail;
- cancelar;
- obter link/WhatsApp;
- gerar download temporário;
- carregar auditoria.

### `document-signature-public`

Operações sem sessão Admin:

- abrir/inspecionar token;
- confirmar identidade;
- solicitar OTP;
- validar OTP;
- carregar snapshot após validação;
- concluir assinatura;
- fornecer download temporário pós-assinatura.

### `document-verification`

Consulta pública por `verification_code`, retornando somente o DTO de autenticidade.

Compartilhar utilitários internos em `supabase/functions/_shared/document-signatures/` para hashing, HMAC, CORS, autorização, e-mail, PDF e normalização.

## Frontend

### Novas/alteradas áreas

**Operação > Documentos**

- configurações de assinatura online no editor do modelo;
- “Assinatura do funcionário” substitui “Assinatura do técnico”.

**Cadastros > Funcionário**

- seção de assinatura;
- pad de captura;
- preview da assinatura atual;
- data/versão atual;
- substituir assinatura.

**OS > Documentos**

- ação `Enviar para assinatura`;
- modal de criação;
- lista/cards de solicitações e estados;
- ações de e-mail, WhatsApp, cancelamento, auditoria e PDF.

**Público**

- `/assinatura/:token` standalone;
- `/verificar-documento/:verificationCode` standalone.

As páginas públicas devem ser mobile-first, pois a assinatura tende a ocorrer pelo celular.

## Falhas e mensagens

Casos obrigatórios de tratamento:

- link inválido;
- link expirado;
- solicitação cancelada;
- solicitação já assinada;
- identidade incorreta;
- OTP inválido/expirado;
- limite de OTP excedido;
- e-mail ausente;
- assinatura do funcionário ausente;
- funcionário não resolvido ou múltiplos técnicos;
- falha no envio do e-mail inicial;
- falha na geração do PDF;
- falha no e-mail final.

A criação da solicitação pode permanecer válida se o convite por e-mail falhar; a UI mostra `solicitação criada, e-mail não enviado` e permite reenviar. A assinatura só muda para `signed` após PDF final persistido com sucesso. Se o PDF falhar, a operação é repetível de forma idempotente sem perder a assinatura capturada.

## Imutabilidade e exclusão

- não fornecer DELETE de documentos assinados;
- não excluir eventos de auditoria pelo frontend;
- assinatura histórica de funcionário não é apagada quando substituída;
- snapshot de solicitação assinada é imutável;
- PDF final assinado é imutável;
- políticas e triggers bloqueiam atualização direta desses artefatos após finalização.

## Fases de implementação

A funcionalidade será implementada em planos separados e testáveis, mantendo este documento como contrato comum.

### Fase 1 — Fundamentos de assinatura do funcionário e modelo

- renomear técnico -> funcionário com alias legado;
- adicionar configuração de assinatura online aos templates;
- criar `employee_signatures` e Storage privado;
- adicionar captura/versionamento em Cadastros.

Resultado: modelos ficam preparados e funcionários podem ter assinatura cadastrada, sem ainda enviar link público.

### Fase 2 — Emissão congelada e gerenciamento na OS

- criar requests/signatures/events/OTP e RLS;
- criar Edge Function administrativa;
- gerar snapshot/hash/token;
- congelar assinatura do funcionário;
- adicionar UI de envio e lista na OS;
- e-mail inicial e WhatsApp preenchido.

Resultado: solicitação segura pode ser criada e administrada; fluxo público ainda não conclui assinatura.

### Fase 3 — Identidade, OTP e assinatura pública

- rota `/assinatura/:token`;
- confirmação de CPF/CNPJ por HMAC;
- OTP por e-mail com rate limit;
- visualização do snapshot;
- aceite e signature pad;
- finalização idempotente.

Resultado: cliente consegue assinar eletronicamente.

### Fase 4 — PDF final, autenticidade e pós-assinatura

- renderer PDF server-side;
- QR Code/código de autenticidade;
- rota `/verificar-documento/:verificationCode`;
- download seguro;
- e-mail final;
- auditoria visual;
- integração resumida com Histórico da OS.

Resultado: ciclo completo, verificável e auditável.

## Fora de escopo da V1

- API oficial do WhatsApp;
- OTP por WhatsApp/SMS;
- múltiplos assinantes externos no mesmo documento;
- ordem/sequência de vários signatários externos;
- certificado ICP-Brasil;
- reconhecimento facial/biometria;
- integração com Clicksign, DocuSign, ZapSign ou equivalentes;
- edição do documento depois da primeira emissão;
- exclusão de documento assinado.

## Critérios de aceite globais

1. Modelos antigos com `signatures.technician` continuam imprimindo, agora como assinatura de funcionário.
2. Somente modelos habilitados oferecem envio para assinatura online.
3. Funcionário sem assinatura ativa bloqueia emissão que exija assinatura interna.
4. Alterar OS/modelo/assinatura do funcionário depois da emissão não altera o snapshot.
5. Link expirado/cancelado nunca permite assinatura.
6. CPF/CNPJ incorreto não permite pedir/validar assinatura e não revela dados sensíveis.
7. OTP respeita validade, cooldown, tentativas e rate limit.
8. Documento público só fica visível após identidade + OTP.
9. Aceite e assinatura desenhada são obrigatórios para signatário externo.
10. Documento assinado não pode ser excluído, alterado ou desassinado.
11. PDF final contém assinatura(s), evidências resumidas, código e QR de autenticidade.
12. Página de verificação confirma autenticidade sem expor o conteúdo completo da OS.
13. E-mail inicial e final funcionam; WhatsApp abre com texto/link prontos.
14. Todos os eventos relevantes possuem auditoria com timestamps; IP/user-agent são restritos à permissão de auditoria.
15. Histórico da OS recebe somente eventos operacionais de alto nível.
16. Todo acesso respeita organização, permissões e RLS; nenhuma tabela ou bucket sensível é público.
