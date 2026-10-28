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

test("dashboard contém somente os três indicadores solicitados",()=>{
  const page=read("src/features/management/presentation/ManagementPage.tsx");
  const tools=read("src/features/management/presentation/ManagementWorkspaceTools.tsx");
  assert.match(page,/ManagementWorkspaceTools records=\{records\}/);
  for(const title of ["Registros ativos","Sites e domínios","Campanhas"]) assert.ok(tools.includes(title));
  assert.doesNotMatch(tools,/AdminSubsectionButtons|role="tab"|border-dashed|Lixeira/);
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

test("lixeira global funciona em modal com expurgo seguro e prazo de sete dias",()=>{
  const page=read("src/features/management/presentation/ManagementPage.tsx");
  const trash=read("src/features/management/presentation/ManagementTrashDialog.tsx");
  const worker=read("supabase/functions/union-management-trash-cleanup/index.ts");
  const sql=read("supabase/migrations/20261028213000_union_management_trash_seven_day_purge.sql");
  assert.match(page,/actions=\{<AdminButton size="sm" variant="tertiary"/);
  assert.match(page,/ManagementTrashDialog open=\{trashOpen\}/);
  assert.match(trash,/Esvaziar lixeira/);
  assert.match(trash,/Excluir definitivamente/);
  assert.match(trash,/restoreManagementFolder/);
  assert.match(trash,/7 \* 86400000/);
  assert.match(worker,/storage\.from\(BUCKET\)\.remove\(part\)/);
  assert.match(worker,/admin\.auth\.getUser\(token\)/);
  assert.match(sql,/now\(\)-interval '7 days'/);
  assert.match(sql,/cron\.schedule\('union-management-trash-expire-7days'/);
  assert.match(sql,/management_cleanup_token_valid/);
  assert.match(sql,/delete from vault\.secrets/);
  assert.doesNotMatch(sql,/delete from storage\.objects/);
});
test("espaços amarelos com avatar circular e ações terciárias apenas no hover",()=>{
  const page=read("src/features/management/presentation/ManagementPage.tsx");
  assert.match(page,/<AdminCard square>/);
  assert.match(page,/data-testid="management-space-folder"/);
  assert.match(page,/absolute left-0 top-0 h-6 w-\[42%\]/);
  assert.match(page,/overflow-hidden rounded-full text-sm font-black/);
  assert.match(page,/rounded-full object-cover/);
  assert.match(page,/bg-\[#F4CF69\]/);
  assert.match(page,/group-hover:opacity-100 focus-within:opacity-100/);
  assert.match(page,/!rounded-lg !bg-card/);
  assert.match(page,/variant="tertiary" size="sm"/);
  assert.match(page,/onClick=\{\(\)=>openSpace\(space\)\}/);
  assert.match(page,/onClick=\{\(\)=>void archiveSpace\(space\)\}/);
});
test("pastas internas têm interação estilo explorador sem bordas individuais",()=>{
  const page=read("src/features/management/presentation/ManagementPage.tsx");
  const row=page.match(/return <div key=\{folder\.id\} className="([^"]+)"/)?.[1];
  assert.ok(row);
  assert.ok(!row.includes("border"));
  assert.match(row,/hover:bg-primary\/10/);
  assert.match(page,/data-testid="management-folder-row"/);
  assert.match(page,/<Folder size=\{25\}/);
  assert.match(page,/variant="primary" onClick=\{\(\)=>openFolder\(\)\}/);
  assert.match(page,/<FolderPlus size=\{16\}/);
});

test("atalhos retirados, busca somente dentro de espaços e botões padronizados",()=>{
  const page=read("src/features/management/presentation/ManagementPage.tsx");
  assert.match(page,/selectedSpace&&<div className="relative mb-5 max-w-lg">/);
  assert.match(page,/\{spaces\.map\(space=>/);
  assert.doesNotMatch(page,/spaces\.filter\(s=>\(s\.name\+" "\+s\.description\)/);
  assert.match(page,/<Plus size=\{15\}\/\>Novo espaço/);
  assert.match(page,/<Plus size=\{15\}\/\>Novo registro/);
  assert.match(page,/variant="tertiary" onClick=\{\(\)=>uploadRef\.current\?\.click\(\)\}/);
});
