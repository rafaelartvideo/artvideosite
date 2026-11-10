import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
async function load() {
 const path='src/features/telephony/application/history-report.ts'; assert.ok(existsSync(path));
 const {outputFiles}=await build({entryPoints:[path],bundle:true,write:false,format:'esm',platform:'browser'});
 return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
}
const filters={from:'2026-11-01',to:'2026-11-09',direction:'inbound',disposition:'ANSWERED',number:'302'};
const org='ffec0c6c-c18e-4f01-83e8-88dcdac82a8b';

test('relatório preserva os filtros e a organização, com datas validadas e exportação explícita',async()=>{
 const {historyReportParameters}=await load();
 const params=historyReportParameters(org,filters,true);
 assert.equal(params.p_organization_id,org);assert.equal(params.p_number,'302');
 assert.equal(params.p_direction,'inbound');assert.equal(params.p_disposition,'ANSWERED');assert.equal(params.p_export,true);
 assert.ok(Date.parse(params.p_to)>Date.parse(params.p_from));
 assert.throws(()=>historyReportParameters(null,filters));
 assert.throws(()=>historyReportParameters(org,{...filters,number:'%'}));
 assert.throws(()=>historyReportParameters(org,{...filters,from:'2026-02-30'}));
});
test('CSV neutraliza fórmulas, conserva aspas e números e informa horários UTC',async()=>{
 const {callHistoryCsv}=await load();
 const csv=callHistoryCsv([{id:'row',linked_id:'call',source:'+5511999999999',destination:'302',direction:'inbound',disposition:'ANSWERED',started_at:'2026-11-10T04:00:00+03:00',ended_at:'2026-11-10T01:00:10Z',duration_seconds:10,billable_seconds:8,source_extension:null,destination_extension:{number:302,display_name:'=WEBSERVICE("evil")'}}]);
 assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('UTC'));
 assert.ok(csv.includes('"\'+5511999999999"'));
 assert.ok(csv.includes('"\'=WEBSERVICE(""evil"")"'));
 assert.ok(csv.includes('"10";"8"'));
 assert.ok(csv.includes('"2026-11-10T01:00:00.000Z"'));
});
test('exportação acima do limite é recusada por inteiro, sem arquivo parcial',async()=>{
 const {exportHistoryRows}=await load();
 assert.throws(()=>exportHistoryRows({overflow:true,rows:[]}),/reduza/i);
 assert.throws(()=>exportHistoryRows({overflow:false,rows:Array(2001).fill({})}),/limite/i);
 assert.deepEqual(exportHistoryRows({overflow:false,rows:[]}),[]);
});
test('tela mostra resumo por registros e exportação, com descarte de resposta após navegação',()=>{
 const page=readFileSync('src/features/telephony/presentation/UnionPbxHistoryPage.tsx','utf8');
 for(const text of ['Exportar CSV','Resumo dos registros','historyReportParameters','exportAbortRef','useLayoutEffect']) assert.ok(page.includes(text),text);
});
test('limite de 93 dias usa datas do calendário também na mudança de horário local',async t=>{
 const old=process.env.TZ;
 t.after(()=>{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;});
 process.env.TZ='America/New_York';
 const {historyReportParameters}=await load();
 const p=historyReportParameters(org,{...filters,from:'2026-10-01',to:'2027-01-01'});
 assert.ok(Date.parse(p.p_to)-Date.parse(p.p_from)>93*86400000);
});
