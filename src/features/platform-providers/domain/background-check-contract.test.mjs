import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {transformWithEsbuild} from "vite";

const read = (file) => readFileSync(file,"utf8");

test("prestadores têm consulta automática apenas no módulo da Union",async()=>{
  const ui=read("src/features/platform-providers/presentation/ProviderBackgroundChecks.tsx");
  const page=read("src/features/platform-providers/presentation/PlatformProvidersPage.tsx");
  const repo=read("src/features/platform-providers/infrastructure/platform-providers.repository.ts");
  const built=await transformWithEsbuild(ui,"ProviderBackgroundChecks.tsx",{loader:"tsx"});
  assert.ok(built.code.length>1000);
  assert.match(page,/hasPermission\("platform.providers.check"\)/);
  assert.match(page,/<ProviderBackgroundChecks/);
  assert.match(ui,/informedDeclaration:true/);
  assert.match(ui,/CPF/);
  assert.match(ui,/Consultar ambas/);
  assert.match(ui,/Revisão humana necessária/);
  assert.match(repo,/platform_provider_background_checks/);
  assert.match(repo,/functions\.invoke\("platform-provider-background-check"/);
});

test("dados criminais e consultas são restritos e exigem autorização para cobrança",()=>{
  const sql=read("supabase/migrations/20261103154215_union_provider_criminal_certificate_checks.sql");
  const edge=read("supabase/functions/platform-provider-background-check/index.ts");
  const config=read("supabase/config.toml");
  assert.match(sql,/platform\.providers\.check/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/grant select on public\.platform_provider_background_checks to authenticated/);
  assert.doesNotMatch(sql,/grant (insert|update|delete) on public\.platform_provider_background_checks to authenticated/i);
  assert.match(edge,/auth\.getUser\(bearer\)/);
  assert.match(edge,/my_organization_permissions/);
  assert.match(edge,/DIRECTDATA_API_TOKEN/);
  assert.match(edge,/informedDeclaration !== true/);
  assert.match(edge,/platform_service_providers/);
  assert.match(edge,/URL\(endpoint\)/);
  assert.match(edge,/Authorization:"Bearer "\+DIRECTDATA_TOKEN/);
  assert.match(edge,/result: "inconclusive"/);
  assert.doesNotMatch(edge,/console\.log\(/);
  assert.match(config,/\[functions\.platform-provider-background-check\][\s\S]*?verify_jwt = true/);
});

test("certidão negativa não é inferida automaticamente de respostas ambíguas",()=>{
  const edge=read("supabase/functions/platform-provider-background-check/index.ts");
  assert.match(edge,/let result: Result = "inconclusive"/);
  assert.match(edge,/hasRecord === true/);
  assert.match(edge,/source === "justica_estadual"/);
  assert.match(edge,/TJ_UFS/);
  assert.match(edge,/recent/);
});
