import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { transformWithEsbuild } from "vite";

const ROOTS = ["src", "scripts", "supabase"];

function* listTestFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", "dist", ".git"].includes(entry.name)) {
        yield* listTestFiles(path);
      }
    } else if (entry.isFile() && /\.(?:test|spec)\.mjs$/.test(entry.name)) {
      yield path;
    }
  }
}

test("todos os arquivos de testes JavaScript têm sintaxe válida antes da suíte completa", { timeout: 30_000 }, async () => {
  const files = ROOTS.flatMap(root => [...listTestFiles(root)]).sort();
  assert.ok(files.length > 30, "Nenhum conjunto significativo de testes foi localizado.");

  // Valida sintaxe e regex literais, sem importar os testes nem executar efeitos colaterais.
  // Arquivos com regex inválida devem falhar aqui, antes do build e dos testes demorados.
  for (const file of files) {
    try {
      await transformWithEsbuild(readFileSync(file, "utf8"), file, { loader: "js" });
    } catch (error) {
      assert.fail(`Sintaxe inválida em ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});
