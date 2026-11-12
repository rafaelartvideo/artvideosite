import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const page = readFileSync("src/features/platform-providers/presentation/PlatformProvidersPage.tsx", "utf8");
const repository = readFileSync("src/features/platform-providers/infrastructure/platform-providers.repository.ts", "utf8");

test("novo e editar exibem o catalogo completo da Union, sem bloquear pela profissao", async () => {
  assert.match(page, /servicesContent=\{<ServiceChoices services=\{services\}/);
  assert.match(page, /\.filter\(item => item\.is_active \|\| selected\.includes\(item\.id\)\)/);
  assert.match(page, /\.some\(value => value\.toLocaleLowerCase\("pt-BR"\)\.includes\(query\)\)/);
  assert.doesNotMatch(page, /\.filter\(item => Boolean\(professionKey\)/);
  assert.doesNotMatch(page, /Informe a profissão para listar equipamentos/);
  assert.match(page, /\{service\.profession_name \|\| "Geral"\}/);
  assert.ok((await transformWithEsbuild(page,"PlatformProvidersPage.tsx",{loader:"tsx"})).code.length > 500);
});

test("vinculos de outras profissoes nao sao removidos ao salvar", () => {
  assert.match(page, /savePlatformProvider\(persistedProviderId \|\| editing\?\.id \|\| null, draft, selectedServiceIds\)/);
  assert.doesNotMatch(page, /allowedServiceIds/);
  assert.match(page, /const catalogIds = new Set\(services\.map\(service => service\.id\)\)/);
  assert.match(page, /selectedServiceIds\.some\(id => !catalogIds\.has\(id\)\)/);
  assert.match(page, /servicesQuery\.isPending \|\| servicesQuery\.isFetching \|\| servicesQuery\.isError/);
  assert.match(repository, /p_service_ids: services/);
});

test("erros e refetch aparecem no cadastro e edicao sem lista vazia enganosa", () => {
  assert.match(page, /if \(loading\) return <LoadingState text="Carregando serviços cadastrados"/);
  assert.match(page, /if \(error\) return <div role="alert"/);
  assert.match(page, /onRetry=\{\(\) => void servicesQuery\.refetch\(\)\}/);
  assert.match(page, /void servicesQuery\.refetch\(\);/);
});
