# Assinatura eletrônica — Fase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o fluxo público seguro `/assinatura/:token` com confirmação de CPF/CNPJ, OTP por e-mail, visualização do snapshot congelado, aceite e captura idempotente da assinatura externa.

**Architecture:** A Edge Function pública `document-signature-public` usa apenas o token secreto da solicitação e service role internamente; nenhuma tabela sensível recebe grants `anon`. Após CPF/CNPJ + OTP válidos, o servidor emite uma prova HMAC curta vinculada à solicitação/token/desafio; a página React renderiza somente o snapshot semântico retornado após essa prova.

**Tech Stack:** React 18 + TypeScript + React Router 7, Supabase Edge Functions/Postgres/Storage, Web Crypto, Resend, node:test para módulos puros.

**Spec:** `docs/superpowers/specs/2026-09-16-online-document-signatures-design.md`

## Global Constraints

- Não retornar OTP ao frontend nem persistir OTP em texto aberto.
- Não expor CPF/CNPJ completo; comparar identidade por HMAC.
- Documento só é retornado após identidade + OTP válidos.
- OTP: 6 dígitos, validade 10 minutos, cooldown 60 segundos, máximo 5 envios/hora por solicitação/IP e 5 tentativas por desafio.
- Prova pós-OTP expira rapidamente e é vinculada ao token/request/challenge.
- Link expirado, cancelado ou já finalizado não aceita nova assinatura.
- HTML congelado não é executado na página pública; o frontend renderiza JSON semântico com React.
- Assinatura externa é PNG privada em `signed-documents`; não recebe URL pública permanente.
- A Fase 3 não marca `signed` antes do PDF final da Fase 4.

---

### Task 1: Política pública e prova HMAC

**Files:**
- Create: `supabase/functions/document-signature-public/public-signature-policy.test.mjs`
- Create: `supabase/functions/document-signature-public/public-signature-policy.mjs`

**Produces:** `normalizeOtp`, `isOtpFormat`, `buildOtpProof`, `verifyOtpProof`, `decodePngDataUrl`, `constantTimeEqualHex`.

- [ ] **RED:** criar testes que exijam OTP de 6 dígitos, prova expirada/inválida rejeitada e PNG válido limitado a 1 MB.
- [ ] Executar `node --test supabase/functions/document-signature-public/public-signature-policy.test.mjs` e confirmar falha por módulo ausente.
- [ ] **GREEN:** implementar somente as funções cobertas pelos testes usando Web Crypto e base64url.
- [ ] Executar novamente o teste e confirmar PASS.
- [ ] Commitar helper e testes.

### Task 2: Edge Function pública

**Files:**
- Create: `supabase/functions/document-signature-public/index.ts`
- Create: `supabase/functions/document-signature-public/main.ts`
- Reuse: `supabase/functions/document-signature-admin/signature-crypto.mjs`

**Produces actions:** `inspect`, `request_otp`, `verify_otp`, `document`, `complete`.

- [ ] `inspect`: SHA-256 do token, localizar request, aplicar expiração preguiçosa, registrar primeira visualização e retornar apenas empresa/modelo/OS, documento mascarado, e-mail mascarado e estado.
- [ ] `request_otp`: validar CPF/CNPJ por HMAC, cooldown e limite por request/IP, gerar código de 6 dígitos, persistir somente HMAC e enviar por Resend.
- [ ] `verify_otp`: validar desafio/expiração/tentativas, incrementar tentativa, marcar `verified_at` e emitir prova HMAC com expiração de 15 minutos.
- [ ] `document`: validar token + prova e retornar snapshot/aceite sem HTML executável.
- [ ] `complete`: validar token + prova + aceite + PNG, persistir `external-signature.png`, inserir `document_signatures(external)` uma única vez e registrar auditoria; repetição retorna a assinatura já capturada.
- [ ] Deploy com `verify_jwt=false`, pois autenticação é o token secreto + OTP/prova, não JWT Supabase.

### Task 3: Página pública mobile-first

**Files:**
- Create: `src/features/document-signature-public/infrastructure/public-document-signature.repository.ts`
- Create: `src/features/document-signature-public/presentation/PublicDocumentSignaturePage.tsx`
- Create: `src/features/document-signature-public/presentation/SignaturePad.tsx`
- Modify: `src/app/App.tsx`

**Produces:** rota standalone `/assinatura/:token` fora de `PublicShell`.

- [ ] Repository encapsula as cinco actions da Edge Function e traduz erros.
- [ ] Página implementa estados `identity`, `otp`, `document`, `signing`, `captured`, além de inválido/expirado/cancelado.
- [ ] SignaturePad suporta mouse/toque/caneta, limpar e exportar PNG.
- [ ] Renderizar empresa, modelo, OS, seções e checklist do snapshot semanticamente, sem `dangerouslySetInnerHTML`.
- [ ] Checkbox de aceite obrigatório antes de habilitar confirmação.
- [ ] Rota lazy standalone no `App.tsx` antes de `/admin/*` e `/*`.

### Task 4: Verificação do checkpoint

**Files:** nenhum adicional.

- [ ] Rodar teste puro da política pública.
- [ ] Confirmar Edge Function `document-signature-public` ACTIVE e `verify_jwt=false`.
- [ ] Verificar via SQL que `anon` continua sem SELECT/INSERT/UPDATE/DELETE nas tabelas de assinatura/OTP.
- [ ] Executar `npm run build` em checkout limpo do `main`; se indisponível, registrar a limitação sem alegar sucesso.
- [ ] Confirmar que a Fase 3 não implementou ainda PDF/QR/página `/verificar-documento`, reservados para a Fase 4.
