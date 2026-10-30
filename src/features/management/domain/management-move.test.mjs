import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=path=>readFileSync(path,"utf8");

test("pastas e registros podem ser arrastados para outra pasta e para breadcrumbs",()=>{
  const ui=read("src/features/management/presentation/ManagementPage.tsx");
  assert.match(ui,/startDrag\(event,\{type:"folder"/);
  assert.match(ui,/startDrag\(event,\{type:"record"/);
  assert.match(ui,/onDrop=\{event=>dropOn\(event,folder\.id\)\}/);
  assert.match(ui,/onDrop=\{event=>dropOn\(event,null\)\}/);
  assert.match(ui,/draggedItemRef\.current/);
});
test("a opção Mover está nos menus e disponível em modal para celular",()=>{
  const ui=read("src/features/management/presentation/ManagementPage.tsx");
  assert.match(ui,/openMove\(\{type:"folder"/);
  assert.match(ui,/openMove\(\{type:"record"/);
  assert.match(ui,/folderDestinations\.map/);
  assert.match(ui,/loading=\{moving\}/);
});
test("movimentos preservam IDs, arquivos e versões, e respeitam o espaço",()=>{
  const repo=read("src/features/management/infrastructure/management.repository.ts");
  const fragment=repo.slice(repo.indexOf("export async function moveManagementFolder"),repo.indexOf("export async function renameManagementFolder"));
  assert.match(fragment,/update\(\{parent_id:parentId\}\)/);
  assert.match(fragment,/update\(\{folder_id:folderId\}\)/);
  assert.match(fragment,/\.eq\("space_id",spaceId\)/);
  assert.match(fragment,/\.is\("deleted_at",null\)/);
  assert.doesNotMatch(fragment,/storage\.from|delete\(/);
});
test("banco impede ciclos, destinos excluídos e registra moved na atividade",()=>{
  const sql=read("supabase/migrations/20261030103500_union_management_safe_move_items.sql");
  assert.match(sql,/management_guard_folder_move/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/ancestors\(id,parent_id,visited\)/);
  assert.match(sql,/A pasta de destino não existe ou está na lixeira/);
  assert.match(sql,/management_guard_record_move/);
  assert.match(sql,/v_operation:='moved'/);
});
