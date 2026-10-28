import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(path,"utf8");

test("a Central usa lixeira recuperável em vez de apagar arquivos",()=>{
  const repo=read("src/features/management/infrastructure/management.repository.ts");
  assert.match(repo,/management_trash_folder/);
  assert.match(repo,/deleted_at: new Date\(\).toISOString\(\)/);
  assert.match(repo,/restoreManagementRecord/);
  const section=repo.slice(repo.indexOf("export async function removeManagementRecord"),repo.indexOf("export async function uploadManagementFiles"));
  assert.doesNotMatch(section,/storage\.from\(BUCKET\)\.remove/);
});

test("o cofre não grava a senha em metadados e usa RPC com autorização no servidor",()=>{
  const ui=read("src/features/management/presentation/ManagementPage.tsx");
  const repo=read("src/features/management/infrastructure/management.repository.ts");
  const sql=read("supabase/migrations/20261028190000_union_central_gestao_extended.sql");
  assert.match(ui,/saveManagementCredential\(recordId,newSecret\)/);
  assert.match(ui,/kind==="account"\?\{username:accountUser.trim\(\)\}/);
  assert.match(repo,/supabase\.rpc\("management_vault_write"/);
  assert.match(repo,/supabase\.rpc\("management_vault_reveal"/);
  assert.match(sql,/vault\.create_secret/);
  assert.match(sql,/vault\.decrypted_secrets/);
  assert.match(sql,/private\.has_platform_permission\('platform.management.manage'\)/);
  assert.match(sql,/revoke all on public\.management_credentials from public,anon,authenticated/);
  assert.doesNotMatch(sql,/insert into public\.management_credentials\([^)]*p_secret/);
});

test("versões e histórico preservam conteúdos e nunca registram segredos",()=>{
  const sql=read("supabase/migrations/20261028190000_union_central_gestao_extended.sql");
  const repo=read("src/features/management/infrastructure/management.repository.ts");
  assert.match(sql,/create table if not exists public\.management_file_versions/);
  assert.match(sql,/create table if not exists public\.management_activity/);
  assert.match(sql,/management_register_file_version/);
  assert.match(repo,/listManagementFileVersions/);
  assert.match(repo,/uploadManagementFileVersion/);
  assert.match(sql,/Credencial visualizada/);
  assert.doesNotMatch(sql,/secret_revealed',p_secret/);
});

test("gestão apresenta domínios, campanhas, tarefas e lixeira integrados",()=>{
  const page=read("src/features/management/presentation/ManagementPage.tsx");
  const tools=read("src/features/management/presentation/ManagementWorkspaceTools.tsx");
  assert.match(page,/ManagementWorkspaceTools/);
  for(const tab of ['domains','campaigns','activity','tasks','trash'])assert.ok(tools.includes('id:"'+tab+'"'));
  assert.match(tools,/createManagementTask/);
  assert.match(tools,/restoreManagementFolder/);
  assert.match(tools,/daysTo/);
});

test("menus da Central usam portal com colisão para não serem cortados no rodapé",()=>{
  const page=read("src/features/management/presentation/ManagementPage.tsx");
  const primitive=read("src/shared/ui/primitives/dropdown-menu.tsx");
  assert.match(page,/DropdownMenuTrigger asChild/);
  assert.match(page,/DropdownMenuContent align="end" sideOffset=\{5\} collisionPadding=\{10\}/);
  assert.match(primitive,/<DropdownMenuPrimitive\.Portal>/);
  assert.doesNotMatch(page,/absolute right-0 top-full z-30/);
  assert.match(page,/Opções do registro/);
});

test("contagem contextual aparece ao lado do breadcrumb, sem segundo cabeçalho",()=>{
  const page=read("src/features/management/presentation/ManagementPage.tsx");
  assert.match(page,/data-testid="management-breadcrumb-count"/);
  assert.match(page,/\{folderCount\} pastas · \{recordCount\} registros/);
  assert.match(page,/folderCount=folders\.filter\(f=>f\.parent_id===visibleFolderId && !f\.deleted_at\)\.length/);
  assert.match(page,/recordCount=records\.filter\(r=>r\.folder_id===visibleFolderId && !r\.deleted_at\)\.length/);
  assert.doesNotMatch(page,/selectedFolder\?\.name\|\|selectedSpace\.name/);
});

test("fundos e listas da Central são quadrados sem afetar os componentes globais",()=>{
  const page=read("src/features/management/presentation/ManagementPage.tsx");
  const workspace=read("src/features/management/presentation/ManagementWorkspaceTools.tsx");
  assert.match(page,/<AdminCard square>/);
  assert.match(page,/min-h-36 flex-col justify-between border border-border/);
  assert.match(page,/relative flex min-w-0 items-center gap-3 border border-border bg-card/);
  assert.match(workspace,/className="border border-border bg-card p-4"/);
  assert.match(workspace,/className=\{\`border px-3 py-2 text-xs font-semibold/);
});
