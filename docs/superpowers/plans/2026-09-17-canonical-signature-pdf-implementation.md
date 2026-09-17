# Canonical Signature PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o PDF gerado para Imprimir o mesmo artefato congelado que o cliente visualiza e que serve de base para o PDF assinado final.

**Architecture:** O `document-signature-public` será a única autoridade de renderização PDF. Novas solicitações ganham um `original.pdf` congelado com hash e slots de assinatura. A finalização carrega esse PDF e aplica somente assinaturas/autenticidade; o frontend de Imprimir passa a solicitar o mesmo renderer por uma ação autenticada no `document-signature-admin`.

**Tech Stack:** React 18 + TypeScript, Supabase Edge Functions/Postgres/Storage, `pdf-lib@1.17.1`, `qrcode@1.5.4`, node:test.

**Spec:** `docs/superpowers/specs/2026-09-17-canonical-signature-pdf-design.md`

## Global Constraints

- Não remover nem desativar OTP.
- Manter validação direta por CPF/CNPJ.
- `signed-documents` permanece privado.
- Novos links só podem ser enviados depois de `original.pdf` existir e ter SHA-256 salvo.
- Solicitações antigas sem PDF-base devem continuar funcionando pelo fallback legado.
- O conteúdo da OS não pode ser recalculado na finalização de novas solicitações.

---

### Task 1: Persistência do PDF-base

**Files:**
- Create: `supabase/migrations/20260917103000_document_signature_canonical_base_pdf.sql`

**Interfaces:**
- Produces: `base_pdf_storage_path`, `base_pdf_hash`, `base_pdf_signature_slots`, `base_pdf_created_at` em `document_signature_requests`.

- [ ] **Step 1: Criar migration** com colunas nullable para compatibilidade e `jsonb` default `[]`.
- [ ] **Step 2: Aplicar no Supabase** com `apply_migration`.
- [ ] **Step 3: Consultar constraints/colunas** e confirmar tipos/defaults.
- [ ] **Step 4: Rodar Security Advisor** e confirmar que a alteração não abriu acesso público.

### Task 2: Política pura do PDF-base

**Files:**
- Create: `supabase/functions/document-signature-public/base-pdf-policy.test.mjs`
- Create: `supabase/functions/document-signature-public/base-pdf-policy.mjs`

**Interfaces:**
- Produces: `signatureKindsFromSnapshot(snapshot)`, `requestBasePdfPath(row)`, `previewPdfPath(input)`.

- [ ] **Step 1: RED** — teste deve exigir descoberta de slots `external`/`employee`, path determinístico do `original.pdf` e path de preview por hash.
- [ ] **Step 2: Executar `node --test .../base-pdf-policy.test.mjs`** e confirmar falha por módulo ausente.
- [ ] **Step 3: GREEN** — implementar apenas helpers puros.
- [ ] **Step 4: Executar teste novamente** e confirmar PASS.

### Task 3: Renderer canônico e overlay final

**Files:**
- Modify: `supabase/functions/document-signature-public/final-document-pdf.ts`

**Interfaces:**
- Produces: `renderBaseDocumentPdf(input) -> { pdfBytes, signatureSlots }` e `applySignatureEvidenceToBasePdf(input) -> Uint8Array`.
- Consumes: snapshot congelado, checklist media, base PDF bytes, assinaturas PNG e dados de verificação.

- [ ] **Step 1: Renderizar conteúdo-base** usando as mesmas regras já suportadas pelo renderer atual e reservar slots de assinatura.
- [ ] **Step 2: Retornar coordenadas dos slots** com page index/x/y/width/height.
- [ ] **Step 3: Implementar overlay** carregando `PDFDocument.load(basePdfBytes)`; inserir PNG/nome/documento/data/método no slot correspondente.
- [ ] **Step 4: Acrescentar página de autenticidade** com código, hash-base, hash do snapshot, URL e QR.
- [ ] **Step 5: Manter `renderSignedDocumentPdf`** como fallback legado.

### Task 4: Preparar e servir PDF-base na Edge pública

**Files:**
- Modify: `supabase/functions/document-signature-public/final-document-service.ts`
- Modify: `supabase/functions/document-signature-public/main.ts`

**Interfaces:**
- Produces actions internas `prepare_base_internal` e `render_preview_internal` protegidas por service role.
- `document` passa a devolver `preview_url` e `base_pdf_hash`.

- [ ] **Step 1: Implementar helper para baixar/salvar `original.pdf`** e atualizar colunas da solicitação.
- [ ] **Step 2: `prepare_base_internal`** deve carregar request, renderizar uma vez, salvar hash/slots e ser idempotente.
- [ ] **Step 3: `render_preview_internal`** deve renderizar snapshot sanitizado recebido do admin, salvar preview determinístico e devolver URL assinada.
- [ ] **Step 4: `documentAction`** deve exigir PDF-base em novas solicitações e devolver URL assinada curta.
- [ ] **Step 5: `finalizeSignatureRequest`** deve preferir PDF-base; somente registros legados sem base usam renderer antigo.

### Task 5: Administração cria base antes de enviar link e gera preview de impressão

**Files:**
- Modify: `supabase/functions/document-signature-admin/signature-finalization.ts`
- Modify: `supabase/functions/document-signature-admin/main.ts`

**Interfaces:**
- Produces: `prepareSignatureBasePdf(request, requestId)` e ação `preview_pdf`.

- [ ] **Step 1: Generalizar chamada interna** ao `document-signature-public` usando service role.
- [ ] **Step 2: Após inserir nova solicitação**, chamar `prepare_base_internal` antes de e-mail/resposta de sucesso.
- [ ] **Step 3: Em falha**, não enviar link sem base PDF e limpar/cancelar a solicitação incompleta.
- [ ] **Step 4: Criar `preview_pdf`** com autenticação/permissão, sanitize do snapshot e chamada `render_preview_internal`.

### Task 6: Frontend usa PDF canônico em Imprimir e assinatura pública

**Files:**
- Modify: `src/features/documents/infrastructure/document-signatures.repository.ts`
- Modify: `src/features/documents/domain/document-signature.ts`
- Modify: `src/features/orders/presentation/OrderDetailsPage.tsx`
- Modify: `src/features/document-signature-public/infrastructure/public-document-signature.repository.ts`
- Modify: `src/features/document-signature-public/presentation/PublicDocumentSignaturePage.tsx`

**Interfaces:**
- Produces: `createDocumentPrintPreview(...)` e `PublicSignatureDocument.preview_url`.

- [ ] **Step 1: Adicionar repository action `preview_pdf`.**
- [ ] **Step 2: No botão Imprimir**, montar `buildOrderDocumentSignatureSnapshot(...)`, solicitar preview e navegar o popup para a URL PDF.
- [ ] **Step 3: Preservar checagem de permissão de checklist e contexto completo da OS.**
- [ ] **Step 4: Página pública** deve renderizar o PDF real em `iframe/object` com botão de abertura direta como fallback mobile.
- [ ] **Step 5: Não renderizar mais o snapshot semântico como substituto visual quando `preview_url` estiver disponível.

### Task 7: Testes, deploy e verificação

**Files:**
- No new source files além dos anteriores.

- [ ] **Step 1: Rodar testes puros** de `public-signature-policy`, `final-document-policy` e `base-pdf-policy`.
- [ ] **Step 2: Confirmar `npm run build`** via GitHub Actions/Deploy HostGator.
- [ ] **Step 3: Deploy `document-signature-public`** com `verify_jwt=false` e todas as dependências.
- [ ] **Step 4: Deploy `document-signature-admin`** com `verify_jwt=true` e dependências.
- [ ] **Step 5: Verificar versões ACTIVE** no Supabase.
- [ ] **Step 6: Criar nova solicitação de teste** e confirmar que possui `base_pdf_storage_path` + `base_pdf_hash` antes da assinatura.
- [ ] **Step 7: Verificar que `document` devolve `preview_url`, que a URL aponta para `original.pdf` e que o PDF final é derivado dessa base.
