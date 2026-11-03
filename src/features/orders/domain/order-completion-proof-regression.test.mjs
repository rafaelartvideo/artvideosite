import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("Concluir OS solicita comprovante sem exigir anexo nas parcelas pendentes", async () => {
  const payment = read("src/features/orders/presentation/OrderCompletionPaymentSection.tsx");
  const modal = read("src/features/orders/presentation/OrderCompletionModal.tsx");
  const hook = read("src/features/orders/application/useOrderCompletion.ts");

  for (const [path, source] of [
    ["OrderCompletionPaymentSection.tsx", payment],
    ["OrderCompletionModal.tsx", modal],
    ["useOrderCompletion.ts", hook],
  ]) {
    const compiled = await transformWithEsbuild(source, path, { loader: "tsx" });
    assert.ok(compiled.code.length > 0);
  }

  assert.match(payment, /Comprovante de pagamento/);
  assert.match(payment, /Tirar foto/);
  assert.match(payment, /Selecionar arquivo/);
  assert.match(payment, /\(opcional\)/);
  assert.match(payment, /paymentProofAttached/);
  assert.match(hook, /paymentProofFile && !paymentProofAttached/);
  assert.match(hook, /setPaymentProofFile\(null\)/);
  assert.match(hook, /attachOrderSituationDocument\(/);
  assert.match(hook, /optimizePhoto: true/);
  assert.match(modal, /paymentProofTypeLoading/);
});

test("fotos do comprovante usam o otimizador existente e PDF fica intacto", () => {
  const documents = read("src/features/orders/infrastructure/order-documents.repository.ts");
  const optimizer = read("src/shared/application/upload-file-optimizer.ts");
  const hook = read("src/features/orders/application/useOrderCompletion.ts");
  assert.match(documents, /optimizePhoto && file\.type\.startsWith\("image\/"\) \? "service-label" : "document-image"/);
  assert.match(optimizer, /"service-label": \{ maxDimension: 2200/);
  assert.match(optimizer, /if \(preset === "document-image" \|\| !file\.type\.startsWith\("image\/"\)\)/);
  assert.match(hook, /20 : 25/);
});

test("comprovante aparece nos anexos da OS com tipo por empresa", () => {
  const hook = read("src/features/orders/application/useOrderCompletion.ts");
  const migration = read("supabase/migrations/20261103173000_ensure_payment_receipt_attachment_types.sql");
  assert.match(hook, /"comprovante de pagamento"/);
  assert.match(hook, /situation-documents-count/);
  assert.match(migration, /where not exists/);
  assert.match(migration, /organization\.id/);
});
