# Assinatura eletrônica — Fase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finalizar a assinatura eletrônica com PDF imutável server-side, status `signed`, cópia por e-mail, download seguro, QR/código de autenticidade, página pública de verificação e ações finais na OS.

**Architecture:** `document-signature-public` será o único finalizador do artefato: ele gera o PDF a partir do `document_snapshot`, embute as assinaturas congeladas, adiciona evidências e QR, salva `signed.pdf` no bucket privado e faz a transição condicional para `signed`. A função administrativa chama esse finalizador internamente com service role nos documentos que exigem somente funcionário. A verificação pública usa apenas `verification_code` e nunca libera o PDF completo; downloads usam signed URLs temporárias.

**Tech Stack:** Supabase Edge Functions/Postgres/Storage, `pdf-lib`, `qrcode`, Resend, React 18 + TypeScript + React Router 7, node:test para módulos puros.

**Spec:** `docs/superpowers/specs/2026-09-16-online-document-signatures-design.md`

## Global Constraints

- PDF final nasce exclusivamente do snapshot congelado e assinaturas já persistidas; nunca da OS atual.
- `signed` exige `signed_at`, `final_pdf_storage_path` e `final_pdf_hash` no mesmo fechamento lógico.
- O PDF final fica em bucket privado e nunca recebe URL pública permanente.
- O QR aponta para `/verificar-documento/:verificationCode`.
- A página de verificação expõe somente dados mínimos de autenticidade e hashes; não expõe CPF/CNPJ completo, e-mail, IP, user-agent ou o documento integral.
- O PDF exibe `snapshot_hash` dentro do próprio artefato. `final_pdf_hash` é calculado depois dos bytes finais e exibido na página de verificação/admin, evitando hash circular.
- Falha no e-mail da cópia final não desfaz a assinatura; gera evento de auditoria.
- Documento já `signed` é idempotente e imutável.
- Modelos que exigem apenas assinatura do funcionário finalizam automaticamente após a criação.

---

### Task 1: Invariantes finais do banco

**Files:**
- Create: `supabase/migrations/20260916200000_document_signature_final_artifact_invariants.sql`

**Interfaces:**
- Consumes: `document_signature_requests` da Fase 2.
- Produces: constraint garantindo que `status='signed'` tenha caminho/hash do PDF final.

- [ ] Criar migration com constraint:

```sql
alter table public.document_signature_requests
  add constraint document_signature_requests_signed_artifact_check
  check (
    status <> 'signed'
    or (
      signed_at is not null
      and btrim(coalesce(final_pdf_storage_path,'')) <> ''
      and final_pdf_hash ~ '^[0-9a-f]{64}$'
    )
  ) not valid;

alter table public.document_signature_requests
  validate constraint document_signature_requests_signed_artifact_check;
```

- [ ] Aplicar a migration no projeto `wmjmtcjpunmzvonlkjcu`.
- [ ] Consultar `pg_constraint` e confirmar constraint validada.
- [ ] Commitar migration.

### Task 2: Política de finalização e renderer PDF

**Files:**
- Create: `supabase/functions/document-signature-public/final-document-policy.test.mjs`
- Create: `supabase/functions/document-signature-public/final-document-policy.mjs`
- Create: `supabase/functions/document-signature-public/final-document-pdf.ts`

**Interfaces:**
- Produces: `buildVerificationPath(code)`, `minimalVerificationPayload(row, signatures, company)` e `renderSignedDocumentPdf(input): Promise<Uint8Array>`.

- [ ] **RED:** teste deve exigir URL `/verificar-documento/<code>`, payload sem campos sensíveis e seleção correta dos signatários.
- [ ] Rodar `node --test supabase/functions/document-signature-public/final-document-policy.test.mjs` e confirmar falha por módulo ausente.
- [ ] **GREEN:** implementar política pura e repetir teste até PASS.
- [ ] Implementar renderer com `pdf-lib@1.17.1` e `qrcode@1.5.4`: cabeçalho, seções/fields, checklist, assinaturas PNG, página/bloco de autenticidade, código, `snapshot_hash` e QR.
- [ ] Texto fora de WinAnsi deve ser normalizado para não quebrar o PDF.
- [ ] O renderer recebe `verificationUrl`, portanto não lê estado vivo da OS.

### Task 3: Finalizador idempotente na Edge Function pública

**Files:**
- Modify: `supabase/functions/document-signature-public/main.ts`
- Modify: `supabase/functions/document-signature-public/index.ts` apenas se necessário.

**Interfaces:**
- Produces actions públicas: `inspect`, `request_otp`, `verify_otp`, `document`, `complete`, `signed_document`, `verify_document`.
- Produces ação interna: `finalize_internal`, autenticada exclusivamente pelo service role.

- [ ] Implementar `finalizeRequest`: carregar assinaturas exigidas, recusar ausência, baixar PNGs privados, gerar QR/PDF, salvar em `{org}/{os}/{request}/signed.pdf`, calcular SHA-256 dos bytes e fazer update condicional `pending/viewed -> signed` com `signed_at`, path e hash.
- [ ] Se `signed.pdf` já existir por retry, reutilizar os bytes existentes e concluir idempotentemente.
- [ ] Registrar `pdf_generated` e `signed` somente após fechamento válido.
- [ ] Após fechamento, enviar cópia PDF por Resend ao assinante externo; registrar `final_copy_emailed` ou `final_copy_email_failed`, sem rollback do status.
- [ ] `complete` passa a capturar assinatura externa e chamar `finalizeRequest`, retornando `signed_at`, `verification_code`, URL de verificação e signed URL temporária.
- [ ] `signed_document` exige token da solicitação assinada e retorna signed URL temporária.
- [ ] `verify_document` recebe somente `verification_code` e retorna payload mínimo se `status='signed'`.
- [ ] `finalize_internal` valida `Authorization: Bearer <service-role>`, aceita `request_id`, somente finaliza solicitações sem assinatura externa pendente e nunca expõe service role na resposta.
- [ ] Deploy `document-signature-public` com `verify_jwt=false` e todas as dependências relativas.

### Task 4: Finalização automática de documento somente-funcionário + admin downloads

**Files:**
- Modify: `supabase/functions/document-signature-admin/main.ts`
- Modify: `src/features/documents/domain/document-signature.ts`
- Modify: `src/features/documents/infrastructure/document-signatures.repository.ts`
- Modify: `src/features/orders/presentation/OrderSignatureRequestsSection.tsx`

**Interfaces:**
- Produces admin action `signed_document` retornando `{download_url, verification_url, final_pdf_hash}`.

- [ ] No `createAction`, após inserir assinatura congelada do funcionário, se `require_external_signature=false`, chamar `document-signature-public/finalize_internal` com service role e recarregar summary.
- [ ] Adicionar `final_pdf_hash` ao summary do admin.
- [ ] Admin `signed_document` valida `documents.signatures.view`, visibilidade da OS e `status='signed'`, então cria signed URL de curta duração e URL pública de verificação.
- [ ] Repository frontend expõe `getSignedSignatureDocument`.
- [ ] Cards assinados mostram `Assinado em`, botão abrir/baixar PDF e botão verificar autenticidade; links de assinatura/cancelamento não aparecem mais.
- [ ] Auditoria reconhece `identity_verified`, `otp_failed`, `consent_accepted`, `signature_captured`, `pdf_generated`, `signed`, `final_copy_emailed` e falha do e-mail final.
- [ ] Deploy `document-signature-admin` com JWT obrigatório.

### Task 5: Experiência pós-assinatura e página pública de autenticidade

**Files:**
- Modify: `src/features/document-signature-public/infrastructure/public-document-signature.repository.ts`
- Modify: `src/features/document-signature-public/presentation/PublicDocumentSignaturePage.tsx`
- Create: `src/features/document-signature-public/presentation/PublicDocumentVerificationPage.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces route standalone `/verificar-documento/:verificationCode`.

- [ ] `completePublicSignature` passa a retornar estado final, signed URL e URL de verificação.
- [ ] Adicionar `getPublicSignedDocument(token)` e `verifyPublicSignedDocument(code)`.
- [ ] Após assinatura, página mostra confirmação `Documento assinado`, data/hora, código, botões `Baixar PDF` e `Verificar autenticidade`.
- [ ] Ao reabrir link já assinado, mostrar o mesmo estado final e permitir novo signed URL sem repetir CPF/OTP.
- [ ] Página de verificação mostra selo visual válido, empresa, documento, OS, signatários mascarados, data/hora, método, `snapshot_hash`, `final_pdf_hash` e código. Código inexistente/não assinado retorna mensagem genérica.
- [ ] Registrar a rota standalone antes de `/admin/*` e `/*`.

### Task 6: Checkpoint final

**Files:** nenhum adicional.

- [ ] Rodar testes `node --test` de policy/crypto/final-document-policy.
- [ ] Confirmar via SQL: constraint assinada válida, nenhum `anon` grant direto nas tabelas de assinatura e requests `signed` sem artefato = 0.
- [ ] Confirmar ambas Edge Functions ACTIVE; pública `verify_jwt=false`, admin `verify_jwt=true`.
- [ ] Rodar `npm run build` em checkout limpo ou usar o workflow do commit como evidência; não alegar sucesso sem resultado.
- [ ] Revisar que não existe URL pública permanente para `signed-documents` e que o PDF antigo não pode ser sobrescrito após `signed`.
