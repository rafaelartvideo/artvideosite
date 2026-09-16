# Assinatura eletrônica — Fase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir emitir, listar e gerenciar solicitações de assinatura a partir de OS > Documentos, congelando conteúdo, signatário interno, token, hash e auditoria.

**Architecture:** O banco recebe requests/signatures/events/OTP e bucket privado `signed-documents`. Uma Edge Function autenticada `document-signature-admin` concentra criação, recuperação segura do link, reenvio, WhatsApp, cancelamento e auditoria; o frontend não escreve diretamente nas tabelas sensíveis. O snapshot é semântico/imutável e o token público é armazenado apenas como hash + ciphertext AES-GCM recuperável pela função administrativa.

**Tech Stack:** React 18 + TypeScript + Vite, Supabase Postgres/RLS/Storage/Edge Functions, Resend.

**Spec:** `docs/superpowers/specs/2026-09-16-online-document-signatures-design.md`

## Global Constraints

- Toda solicitação pertence a uma organização e uma OS.
- Requests/signatures/events/OTP não têm acesso anônimo direto.
- Nenhum token bruto, OTP ou CPF/CNPJ completo é persistido em tabelas/auditoria.
- `signed`, `expired` e `cancelled` são terminais.
- Campos de snapshot, signatários, hashes e artefatos congelados são imutáveis após criação/finalização conforme aplicável.
- Um funcionário requerido precisa ter assinatura ativa antes da emissão.
- Um assinante externo por solicitação na V1.
- Convite por e-mail pode falhar sem apagar a solicitação; reenvio permanece disponível.
- WhatsApp apenas monta/abre mensagem preenchida na V1.

---

### Task 1: Banco do domínio de assinatura e permissões

**Files:**
- Create: `supabase/migrations/20260916170000_online_document_signatures_phase_2.sql`

**Produces:**
- `document_signature_requests`
- `document_signatures`
- `document_signature_events`
- `document_signature_otp_challenges`
- permissions `documents.signatures.view/send/resend/cancel/audit`
- private bucket `signed-documents`
- helper functions/triggers for immutable state and lazy expiration foundation

**Steps:**
- [ ] Criar tabelas com FKs org/OS/template/entity/signature e CHECKs de status/signatário.
- [ ] Criar índices por org/OS/status/verification_code e unicidade de assinatura employee/external por request.
- [ ] Guardar `token_hash`, `token_ciphertext`, `token_iv`, `external_document_hmac`, `external_document_masked`, snapshot/hash e paths privados.
- [ ] Criar trilha append-only e OTP sem grants diretos de escrita.
- [ ] Inserir/inferir permissões a partir de `documents.print`/`documents.edit` seguindo permissões existentes.
- [ ] RLS: leitura administrativa via permissões; escrita somente service role/SECURITY DEFINER da Edge Function.
- [ ] Criar bucket `signed-documents` privado sem políticas anônimas.
- [ ] Trigger impede mutação de campos congelados; assinado não pode voltar de estado nem ser excluído.
- [ ] Aplicar migration e verificar invariantes SQL.

### Task 2: Snapshot semântico e contrato frontend

**Files:**
- Create: `src/features/documents/domain/document-signature.ts`
- Modify: `src/features/documents/domain/order-print-document.ts`
- Create: `src/features/documents/infrastructure/document-signatures.repository.ts`

**Produces:**
- tipos de request/status/signatário/snapshot
- `buildOrderDocumentSignatureSnapshot(template, context)`
- chamadas administrativas da Edge Function

**Steps:**
- [ ] Extrair resolução de campos já usada pelo renderer para gerar seções/fields congelados.
- [ ] Snapshot v1 inclui template/layout/company/order id+number/sections/checklists estruturados e referências de mídia necessárias.
- [ ] Snapshot não inclui funções, URLs de token, HTML executável nem objetos Supabase vivos.
- [ ] Repository expõe `createSignatureRequest`, `listOrderSignatureRequests`, `getSignatureAdminLink`, `resendSignatureEmail`, `cancelSignatureRequest`, `getSignatureAudit`.
- [ ] WhatsApp é montado no frontend apenas a partir do link autorizado retornado pela Edge Function.

### Task 3: Edge Function administrativa

**Files:**
- Create: `supabase/functions/document-signature-admin/index.ts`

**Produces actions:**
- `create`
- `list`
- `link`
- `resend_email`
- `cancel`
- `audit`

**Steps:**
- [ ] Validar JWT com anon client e membership/permissão usando RPC/query protegida.
- [ ] Usar service-role somente após autorização administrativa.
- [ ] `create`: validar template/OS, assinante externo, funcionário e assinatura ativa; gerar 32-byte token, SHA-256, AES-GCM ciphertext, verification code; HMAC de CPF/CNPJ; hash canonical JSON do snapshot.
- [ ] Congelar assinatura do funcionário copiando bytes do bucket `employee-signatures` para `signed-documents/.../employee-signature.png` e criar `document_signatures(employee)`.
- [ ] Persistir snapshot JSON + `snapshot.html` sanitizado/estático apenas como artefato; nenhuma execução de script.
- [ ] Enviar convite via Resend quando houver assinante externo; se falhar, manter request `pending` e devolver warning.
- [ ] `link`: decifrar token somente para usuário autorizado; nunca incluir em listagem.
- [ ] `resend_email`: respeitar estado/expiração, reutilizar token, registrar evento.
- [ ] `cancel`: somente pending/viewed; invalidar estado e registrar evento.
- [ ] `audit`: exigir `documents.signatures.audit` e retornar eventos.
- [ ] Implantar função com `verify_jwt=true`.

### Task 4: UI de emissão na OS

**Files:**
- Create: `src/features/orders/presentation/OrderSignatureRequestDialog.tsx`
- Create: `src/features/orders/presentation/OrderSignatureRequestsSection.tsx`
- Modify: `src/features/orders/presentation/OrderDocumentsPage.tsx`
- Modify: `src/features/orders/presentation/OrderDetailsPage.tsx`

**Steps:**
- [ ] Adicionar aba `Assinaturas` em Documentos da OS.
- [ ] Receber templates ativos que permitem assinatura e permissões de assinatura.
- [ ] Botão `Enviar para assinatura` abre modal com template, assinante externo cliente/contato, dados de contato, funcionário resolvido/manual e validade.
- [ ] Montar snapshot usando a mesma fonte de dados da impressão, incluindo checklist quando selecionado.
- [ ] Bloquear na UI ausências conhecidas; Edge Function revalida tudo.
- [ ] Listar cards com status, modelo, assinante, funcionário, criação, expiração, visualização e assinatura.
- [ ] Ações: copiar/abrir link, e-mail/reenvio, WhatsApp preenchido, cancelar; auditoria quando permitido.
- [ ] Estados terminais permanecem visíveis e não recebem ações inválidas.

### Task 5: Permissões e verificação da Fase 2

**Files:**
- Modify: `src/features/employees/domain/permission-taxonomy.ts`

**Steps:**
- [ ] Classificar permissions `documents.signatures.*` em seção `Assinaturas`.
- [ ] Dependências: view -> documents.view; send -> view+documents.print; resend/cancel -> view; audit -> view.
- [ ] Verificar migration, function deploy, policies, bucket privado e absence de anon grants.
- [ ] Revisar diff e confirmar que nenhuma rota pública/OTP de Fase 3 foi implementada prematuramente.
- [ ] Se build não estiver disponível, registrar explicitamente a limitação sem alegar build verde.
