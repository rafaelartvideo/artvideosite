import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("badge de situação prioriza sempre a cor salva, mesmo em nomes reconhecidos", async () => {
  const feedback = read("src/shared/ui/admin/AdminFeedback.tsx");
  assert.ok((await transformWithEsbuild(feedback, "AdminFeedback.tsx", { loader: "tsx" })).code);
  assert.match(feedback, /const savedColor = color\?\.trim\(\)/);
  assert.match(feedback, /const customColor = Boolean\(savedColor && isHexColor\(savedColor\)\)/);
  assert.match(feedback, /if \(!customColor\) \{/);
  assert.match(feedback, /customColor \? "border-solid" : STATUS_TONE_CLASSES\[tone\]\.badge/);
  assert.match(feedback, /backgroundColor: `\$\{savedColor\}18`/);
  assert.match(feedback, /borderColor: `\$\{savedColor\}66`/);
  assert.match(feedback, /color: savedColor/);
  assert.match(feedback, /boxShadow: "none"/);
  assert.match(feedback, /animation: "none"/);
  assert.doesNotMatch(feedback, /tone === "neutral" && Boolean\(color/);
});

test("lista de OS usa a situação cadastrada nos badges desktop e mobile", async () => {
  const table = read("src/features/orders/presentation/OrdersTable.tsx");
  assert.ok((await transformWithEsbuild(table, "OrdersTable.tsx", { loader: "tsx" })).code);
  const badge = /<StatusBadge status=\{\(o\.situation as any\)\.name\} color=\{\(o\.situation as any\)\?\.color\} \/>/g;
  assert.equal((table.match(badge) || []).length, 2, "mesma cor salva no celular e desktop");
});
