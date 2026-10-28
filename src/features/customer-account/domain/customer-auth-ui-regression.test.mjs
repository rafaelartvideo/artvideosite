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
  assert.match(edge, /```"\+code\+"```/);
  assert.doesNotMatch(edge, /https?:\/\/[^\s]*\+code/);
});

test("recuperação por WhatsApp ou e-mail deixa senhas ocultas por padrão", () => {
  const login = read("src/features/customer-account/presentation/CustomerCpfLoginPanel.tsx");
  const account = read("src/features/customer-account/presentation/CustomerAccountPage.tsx");
  assert.match(login,/onRecoveryVerified\?\.\(\)/);
  assert.match(login,/password_reset_email/);
  assert.match(account,/type=\{showConfirmPassword \? "text" : "password"\}/);
});


test("links discretos, botões sem setas e loading circular no login e cadastro", () => {
  const account = read("src/features/customer-account/presentation/CustomerAccountPage.tsx");
  const login = read("src/features/customer-account/presentation/CustomerCpfLoginPanel.tsx");
  assert.match(login, /Esqueceu a senha\?/);
  assert.match(login, /!text-\[11px\]/);
  assert.match(account, /className="!text-xs font-medium leading-normal/);
  assert.match(account, /<LoaderCircle size=\{19\} className="animate-spin"/);
  assert.match(login, /<LoaderCircle size=\{18\} className="animate-spin"/);
  assert.doesNotMatch(login, /<ArrowRight/);
  assert.doesNotMatch(account, /Criar conta<\/span><ArrowRight/);
});
test("cadastro mostra asteriscos obrigatórios, e erros de validação abaixo de cada campo", () => {
  const page = read("src/features/customer-account/presentation/CustomerAccountPage.tsx");
  const validators = read("src/features/customer-account/domain/customer-registration-validation.ts");
  for(const field of ["name","cpf","phone","password","confirmPassword"]){
    assert.ok(page.includes('registrationError("'+field+'")'));
  }
  assert.match(page, /<span className="text-red-600">\*<\/span>/);
  assert.match(page, /<form onSubmit=\{event => void submitAuth\(event\)\} noValidate/);
  assert.match(page, /role="alert" className="mt-1 block text-\[11px\] text-red-600"/);
  assert.match(validators, /case "cpf"/);
  assert.match(validators, /case "phone"/);
  assert.match(validators, /case "confirmPassword"/);
});
test("e-mail opcional é verificado por WhatsApp antes de criar conta com senha", () => {
  const page = read("src/features/customer-account/presentation/CustomerAccountPage.tsx");
  const edge = read("supabase/functions/artvideo-customer-access/index.ts");
  const migration = read("supabase/migrations/20261028144905_artvideo_site_registration_otp.sql");
  assert.match(page, /E-mail <span.*\(opcional\)/);
  assert.match(page, /"registration_send"/);
  assert.match(page, /"registration_verify"/);
  assert.match(edge, /if\(action==="registration_send"\)/);
  assert.match(edge, /if\(action==="registration_verify"\)/);
  assert.match(edge, /await admin\.auth\.admin\.createUser/);
  assert.match(edge, /safeEqual\(c\.code_digest/);
  assert.match(migration, /purpose in \('activation','login','registration'\)/);
});


test("Ativar Minha Conta mostra/oculta as duas senhas separadamente", () => {
  const activation = read("src/features/customer-account/presentation/CustomerAccessActivatePage.tsx");
  assert.match(activation, /setShowPassword/);
  assert.match(activation, /setShowConfirm/);
  assert.match(activation, /type=\{showPassword\?"text":"password"\}/);
  assert.match(activation, /type=\{showConfirm\?"text":"password"\}/);
  assert.match(activation, /aria-label=\{showPassword\?"Ocultar senha":"Mostrar senha"\}/);
  assert.match(activation, /aria-label=\{showConfirm\?"Ocultar confirmação":"Mostrar confirmação"\}/);
});

test("Ativação não usa ícones nos botões de envio, confirmação ou finalização", () => {
  const activation = read("src/features/customer-account/presentation/CustomerAccessActivatePage.tsx");
  assert.doesNotMatch(activation, /<CheckCircle2|<MessageCircle|<Loader2/);
  assert.match(activation, /"Enviar código pelo WhatsApp"/);
  assert.match(activation, /"Confirmar código"/);
  assert.match(activation, /"Finalizar cadastro"/);
  assert.match(activation, /<LoaderCircle className="animate-spin"/);
});

test("Ativação permite colar código de seis dígitos por ação explícita e sem URL com OTP", () => {
  const activation = read("src/features/customer-account/presentation/CustomerAccessActivatePage.tsx");
  assert.match(activation, /async function pasteCode\(\)/);
  assert.match(activation, /navigator\.clipboard\.readText\(\)/);
  assert.match(activation, /candidates\.length!==1/);
  assert.match(activation, /Colar código/);
  assert.match(activation, /autoComplete="one-time-code"/);
  assert.doesNotMatch(activation, /location\.href.*code|URLSearchParams.*code/);
});
