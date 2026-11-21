import test from 'node:test';import assert from 'node:assert/strict';
import {build,transform} from 'esbuild';import {readFileSync} from 'node:fs';
async function load(failTable){
 const calls=[];const supabase={from:table=>{
  const b={insert:value=>{calls.push({table,value});return b;},select:()=>b,single:async()=>({data:{id:table==='print_templates'?'template':'section-'+calls.length},error:table===failTable?Error('write failed'):null}),
   then:(yes,no)=>Promise.resolve({error:table===failTable?Error('write failed'):null}).then(yes,no)};return b;
 }};
 globalThis.__templateBatchSupabase=supabase;
 const result=await build({entryPoints:['src/features/documents/infrastructure/documents.repository.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'test-infrastructure',setup(b){
  b.onResolve({filter:/^@\/lib\/(supabase|active-organization)$/},args=>({path:args.path,namespace:'stub'}));
  b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const supabase=globalThis.__templateBatchSupabase; export const getActiveOrganizationId=async()=>"org";',loader:'js'}));
 }}]});
 const repo=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text+'\n//'+Math.random()).toString('base64'));
 const {code}=await transform(readFileSync('src/features/documents/domain/print-template.ts','utf8'),{loader:'ts',format:'cjs'});
 const module={exports:{}};new Function('module','exports',code)(module,module.exports);
 return {repo,calls,value:module.exports.emptyPrintTemplateEditorValue()};
}
test('salvar documento grava seções e campos em dois lotes, preservando IDs, ordem e empresa',async()=>{
 const {repo,calls,value}=await load();value.name='Documento teste';value.selectedFields=new Set(['equipment.general','customer.full_name','order.priority']);
 await repo.savePrintTemplate(value);
 const sections=calls.filter(c=>c.table==='print_template_sections'),fields=calls.filter(c=>c.table==='print_template_fields');
 assert.equal(sections.length,1);assert.equal(fields.length,1);assert.ok(Array.isArray(sections[0].value));assert.ok(sections[0].value.length>=2);
 assert.ok(sections[0].value.every((s,i)=>s.organization_id==='org'&&s.template_id==='template'&&s.sort_order===i));
 assert.ok(fields[0].value.every(f=>sections[0].value.some(s=>s.id===f.template_section_id)));
 assert.deepEqual(fields[0].value.map(f=>f.field_key),['customer.full_name','order.priority','equipment.general']);
});
test('erro no lote de seções impede envio de campos órfãos',async()=>{
 const {repo,calls,value}=await load('print_template_sections');value.name='Teste';value.selectedFields=new Set(['customer.full_name']);
 await assert.rejects(repo.savePrintTemplate(value),/write failed/);
 assert.equal(calls.some(c=>c.table==='print_template_fields'),false);
});
