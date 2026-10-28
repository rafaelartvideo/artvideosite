import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");

test("acesso à Minha Conta tem CPF e senha por padrão, sem animação nem seleção de e-mail", () => {
  const account = read("src/features/customer-account/presentation/CustomerAccountPage.tsx");
  const login = read("src/features/customer-account/presentation/CustomerCpfLoginPanel.tsx");
  assert.match(account, /<CustomerCpfLoginPanel onRecoveryVerified=/);
  assert.doesNotMatch(account, /<AnimatePresence/);
  assert.doesNotMatch(account, /<motion\.div/);
  assert.doesNotMatch(account, /setCpfMode|cpfMode/);
  assert.match(login, /useState<Method>\("password"\)/);
  assert.match(login, /Esqueceu a senha\?/);
  assert.match(login, /Entrar com código de segurança/);
  assert.match(login, /type=\{showPassword \? "text" : "password"\}/);
});

test("OTP do WhatsApp usa seis caixas e aceita colagem de uma vez", () => {
  const login = read("src/features/customer-account/presentation/CustomerCpfLoginPanel.tsx");
  assert.match(login, /Array\.from\(\{ length: 6 \}/);
  assert.match(login, /replace\(\/\\D\/g, ""\)\.slice\(0, 6\)/);
  assert.match(login, /autoComplete="one-time-code"/);
  assert.match(login, /Reenviar código/);
});

test("CPF/senha acessa contas cadastradas pelo site sem exigência de ativação CRM", () => {
  const edge = read("supabase/functions/artvideo-customer-access/index.ts");
  const passwordStart = edge.indexOf('if(action==="login_password")');
  const passwordEnd = edge.indexOf('if(action==="signed_document")',passwordStart);
  assert.ok(passwordStart > 0 && passwordEnd > passwordStart);
  const passwordBlock = edge.slice(passwordStart,passwordEnd);
  assert.match(passwordBlock, /await passwordAccount\(org,cpf\)/);
  assert.doesNotMatch(passwordBlock, /await linkedAccount\(org,cpf\)/);
  assert.match(edge, /if\(action==="password_reset_email"\)/);
});

test("códigos não aparecem em links e são apresentados isoladamente em formato copiável", () => {
  const edge = read("supabase/functions/artvideo-customer-access/index.ts");
  assert.match(edge, /const message="\*Artvideo · Código de segurança\*/);
  assert.match(edge, /"```"\+code\+"```"/);
  assert.doesNotMatch(edge, /https?:\/\/[^\s]*\+code/);
});

test("recuperação por WhatsApp ou e-mail deixa senhas ocultas por padrão", () => {
  const login = read("src/features/customer-account/presentation/CustomerCpfLoginPanel.tsx");
  const account = read("src/features/customer-account/presentation/CustomerAccountPage.tsx");
  assert.match(login,/onRecoveryVerified\?\.\(\)/);
  assert.match(login,/password_reset_email/);
  assert.match(account,/type=\{showConfirmPassword \? "text" : "password"\}/);
});
