import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const pr = read(".github/workflows/pr-build-check.yml");
const deploy = read(".github/workflows/deploy-hostgator.yml");

test("comandos de CI exercitam testes de qualidade, financeiro, regressões e SAC", () => {
  const scripts = pkg.scripts;
  assert.equal(scripts["test:quality"], "node --test scripts/quality/*.test.mjs");
  for (const command of ["npm run test:quality", "npm run test:finance", "npm run test:regressions", "npm run test:sac"]) {
    assert.ok(scripts["test:ci"].includes(command), `Falta ${command} no test:ci`);
  }
  assert.equal(scripts["verify:release"], "npm run test:ci && npm run build");
  assert.equal(scripts.build, "npm run build:site && npm run build:crm");
});

test("o PR valida todo o projeto com lockfile antes da aprovação", () => {
  assert.match(pr, /pull_request:\s*\n\s*branches:\s*\[main\]/);
  assert.match(pr, /name: Validate release/); // nome estável para branch protection
  assert.match(pr, /npm ci --no-audit --no-fund/);
  assert.match(pr, /npm run test:ci/);
  assert.match(pr, /python3 -m unittest discover -s scripts\/union-pbx-agent/);
  assert.match(pr, /npm run build/);
  assert.ok(pr.indexOf("npm run test:ci") < pr.indexOf("npm run build"));
});

test("deploy publica somente após todos os testes e os dois builds", () => {
  assert.match(deploy, /npm ci --prefer-offline --no-audit --no-fund/);
  assert.match(deploy, /run: npm run test:ci/);
  assert.match(deploy, /python3 -m unittest discover -s scripts\/union-pbx-agent/);
  assert.match(deploy, /run: npm run build:site/);
  assert.match(deploy, /run: npm run build:crm/);
  assert.match(deploy, /publish:\s*\n[\s\S]*?needs: \[gate, build\]/);
  const testsAt = deploy.indexOf("run: npm run test:ci");
  const siteAt = deploy.indexOf("run: npm run build:site");
  const crmAt = deploy.indexOf("run: npm run build:crm");
  const ftpAt = deploy.indexOf("Publish via FTPS");
  assert.ok(testsAt >= 0 && siteAt > testsAt && crmAt > siteAt && ftpAt > crmAt);
  assert.doesNotMatch(deploy.slice(testsAt, siteAt), /continue-on-error:\s*true/);
});

test("a suíte de regressões não referencia testes removidos", () => {
  const regressions = pkg.scripts["test:regressions"];
  const references = regressions.split(/\s+/).filter(token => token.endsWith(".test.mjs") && !token.includes("*"));
  assert.ok(references.length > 20, "Poucos testes de regressão registrados; verifique o script.");
  for (const file of references) {
    assert.ok(existsSync(file), `Teste listado no CI não existe: ${file}`);
  }
});
