import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(path,"utf8");

test("a Central usa lixeira recuperável em vez de apagar arquivos",()=>{
  const repo=read("src/features/management/infrastructure/management.repository.ts");
  assert.match(repo,/management_trash_folder/);
  assert.match(repo,/deleted_at: new Date\(\).toISOString\(\)/);
  assert.match(repo,/restoreManagementRecord/);
  assert.doesNotMatch(repo,/export async function removeManagementRecord[\s\S]*?\.storage\.from\(BUCKET\)\.remove\(/);
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
