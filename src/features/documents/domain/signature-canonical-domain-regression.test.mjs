import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const root = "supabase/functions";

test("links e QR de assinatura sempre usam o dominio publico da Union", () => {
  for (const path of [
    "document-signature-admin/main.ts",
    "document-signature-admin/signature-finalization.ts",
    "document-signature-pdf/main.ts",
    "document-signature-public/final-document-service.ts",
  ]) {
    const source = read(`${root}/${path}`);
    assert.match(source, /function publicBaseUrl\(_request: Request\)[\s\S]*?return "https:\/\/unionworld\.com\.br";/, path);
    assert.doesNotMatch(source, /Deno\.env\.get\("SIGNATURE_PUBLIC_BASE_URL"\)/, path);
  }
});

test("SAC Digital valida a origem da Union e Minha Conta usa o mesmo dominio", () => {
  const sac = read(`${root}/sac-digital-api/index.ts`);
  const artvideo = read(`${root}/artvideo-customer-access/index.ts`);
  const app = read("src/app/App.tsx");
  assert.match(sac, /const configuredSignatureBase = "https:\/\/unionworld\.com\.br";/);
  assert.match(sac, /linkUrl\.origin !== configuredOrigin/);
  assert.match(artvideo, /url:"https:\/\/unionworld\.com\.br\/assinatura\/"\+encodeURIComponent\(token\)/);
  assert.doesNotMatch(artvideo, /url:"https:\/\/eletronicaartvideo\.com\.br\/assinatura\//);
  assert.equal((app.match(/path="\/assinatura\/:token"/g) || []).length, 2);
  assert.equal((app.match(/path="\/verificar-documento\/:verificationCode"/g) || []).length, 2);
});
