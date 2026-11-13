import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("seções de produtos e certificado não ficam presas a altura fixa nem esticadas", async () => {
  const modal = read("src/features/orders/presentation/OrderCompletionModal.tsx");
  assert.ok((await transformWithEsbuild(modal, "OrderCompletionModal.tsx", { loader: "tsx" })).code);
  assert.match(modal, /grid min-w-0 items-start gap-4/);
  assert.match(modal, /<Section title="Produtos e serviços" className="self-start">/);
  assert.match(modal, /<Section title="Certificado de garantia" className="self-start">/);
  assert.doesNotMatch(modal, /h-\[360px\]/);
  assert.doesNotMatch(modal, /min-h-\[240px\]/);
});

test("extrato identifica responsável pela OS e autor da baixa sem deduzir nomes", async () => {
  const movements = read("src/features/finance/infrastructure/finance-movements.repository.ts");
  const types = read("src/features/finance/domain/finance.types.ts");
  const view = read("src/features/finance/presentation/FinanceMovementsSection.tsx");
  assert.ok((await transformWithEsbuild(movements, "finance-movements.repository.ts", { loader: "ts" })).code);
  assert.ok((await transformWithEsbuild(view, "FinanceMovementsSection.tsx", { loader: "tsx" })).code);
  assert.match(movements, /select\("id,financial_entry_id,created_by"\)/);
  assert.match(movements, /select\("id,completed_by"\)/);
  assert.match(movements, /\.eq\("organization_id", org\)/);
  assert.match(movements, /actorNames\.get\(completedActorByOrder/);
  assert.match(movements, /actorNames\.get\(settlementActorById/);
  assert.match(movements, /\.from\("employees"\)\.select\("profile_id,full_name"\)/);
  assert.match(types, /completed_by_name\?: string \| null/);
  assert.match(types, /settlement_by_name\?: string \| null/);
  assert.match(view, /OS concluída por/);
  assert.match(view, /Baixa registrada por/);
  assert.match(view, /Não identificado/);
});

test("extrato e contas a receber mostram carregamento de anexo e prévia de imagem", async () => {
  const gallery = read("src/features/finance/presentation/FinanceOrderEvidenceGallery.tsx");
  const section = read("src/features/orders/presentation/OrderCompletionPaymentSection.tsx");
  assert.ok((await transformWithEsbuild(gallery, "FinanceOrderEvidenceGallery.tsx", { loader: "tsx" })).code);
  assert.ok((await transformWithEsbuild(section, "OrderCompletionPaymentSection.tsx", { loader: "tsx" })).code);
  assert.match(gallery, /query\.isPending/);
  assert.match(gallery, /Carregando \{label\.toLowerCase\(\)\}/);
  assert.match(gallery, /aria-busy="true"/);
  assert.match(gallery, /onLoad=\{\(\) => setLoaded\(true\)\}/);
  assert.match(gallery, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(gallery, /animate-spin/);
  assert.match(section, /Carregando comprovante e evidência de entrega/);
  assert.match(section, /Carregando prévia de/);
  assert.match(section, /Salvando as evidências da OS/);
});
