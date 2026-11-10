import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';

async function moduleUrl(path) {
  let source = readFileSync(path, 'utf8');
  if (source.includes("from './pbx-request'")) source = source.replace("'./pbx-request'", JSON.stringify(await moduleUrl('src/features/telephony/application/pbx-request.ts')));
  const { code } = await transformWithEsbuild(source, path, { loader: 'ts' });
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const load = async () => import(await moduleUrl('src/features/telephony/application/pbx-call-flows.ts'));
const org = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const targetId = '33333333-3333-4333-8333-333333333333';

test('novo fluxo nasce desativado no 910 e config usa exatamente as 13 chaves do compilador', async () => {
  const { newCallFlow, validateCallFlow } = await load(); const flow = newCallFlow();
  assert.equal(flow.enabled, false); assert.equal(flow.test_extension, 910);
  const compiler = readFileSync('scripts/union-pbx-agent/call_flows.py', 'utf8');
  const keys = Array.from(compiler.match(/CONFIG_KEYS=\{([\s\S]*?)\}/)[1].matchAll(/'([^']+)'/g), item => item[1]);
  assert.deepEqual(Object.keys(flow.config).sort(), keys.sort());
  flow.name = 'Atendimento';
  assert.doesNotThrow(() => validateCallFlow(flow, { extensionIds: [], queueIds: [], promptIds: [] }));
});

test('valida destino próprio, menu, dígitos únicos, limites e calendário real antes de salvar', async () => {
  const { newCallFlow, validateCallFlow } = await load();
  const valid = newCallFlow(); valid.name = 'URA';
  valid.config.mode = 'menu'; valid.config.prompt_id = id;
  valid.config.options = [{ digit: '1', target: { kind: 'extension', id: targetId } }];
  valid.config.schedule_enabled = true; valid.config.windows = [{ days: [1, 7], start: '22:00', end: '06:00' }];
  const scope = { extensionIds: [targetId], queueIds: [], promptIds: [id] };
  assert.doesNotThrow(() => validateCallFlow(valid, scope));
  const changes = [f => f.config.options.push(f.config.options[0]), f => f.config.options[0].digit = '*', f => f.config.fallback = {kind:'queue',id:targetId}, f => f.config.prompt_id = targetId, f => f.config.timeout_seconds = 31, f => f.config.repeats = 4, f => f.config.windows[0].days = [0], f => f.config.windows[0].end = '25:00', f => f.config.windows[0].days = [1,1], f => f.config.holidays = ['2026-02-30'], f => f.config.holidays = ['2026-11-10','2026-11-10'], f => f.config.timezone = 'Invalid/Zone', f => f.test_extension = 900];
  for (const change of changes) { const flow = structuredClone(valid); change(flow); assert.throws(() => validateCallFlow(flow, scope)); }
});

function client() {
  const calls = []; const state = { error: null, uploadError: null, removeError: null };
  return { calls, state, rpc(name, params) { calls.push({ name, params });
    return { abortSignal: async () => ({ error: state.error, data: name === 'pbx_create_audio_prompt' ? { id, organization_id:org, storage_path:`${org}/${id}.wav`, status:'pending' } : [] }) };
  }, storage: { from(bucket) { return {
    async upload(path, blob, options) { calls.push({ upload: path, bucket, blob, options }); return { error: state.uploadError, data:{} }; },
    async remove(paths) { calls.push({ remove:paths, bucket }); return { error:state.removeError, data:[] }; },
  }; } } };
}

test('reserva RPC por empresa, envia WAV privado sem sobrescrever e só então conclui', async () => {
  const { createPbxCallFlowsApi } = await load(); const db = client(); const api = createPbxCallFlowsApi(db,org);
  const prepared = { blob:new Blob(['wav'],{type:'audio/wav'}),sha256:'a'.repeat(64),durationSeconds:1 };
  const prompt = await api.reservePrompt('Saudação',prepared);
  await api.uploadPrompt(prompt,prepared.blob); await api.finishPrompt(prompt.id);
  assert.deepEqual(db.calls[0], { name:'pbx_create_audio_prompt',params:{p_organization_id:org,p_label:'Saudação',p_sha256:'a'.repeat(64),p_duration_seconds:1,p_size_bytes:3} });
  assert.equal(db.calls[1].bucket,'pbx-audio-prompts'); assert.equal(db.calls[1].upload,`${org}/${id}.wav`);
  assert.equal(db.calls[1].options.upsert,false); assert.equal(db.calls[1].options.contentType,'audio/wav');
  assert.equal(db.calls[2].name,'pbx_finish_audio_prompt_upload'); assert.equal(db.calls[2].params.p_prompt_id,id);
});

test('falhas de upload/exclusão são visíveis e nenhuma metadata é apagada se Storage falhar', async () => {
  const { createPbxCallFlowsApi } = await load(); const db = client(); const api = createPbxCallFlowsApi(db,org);
  const prompt = {id, organization_id:org,storage_path:`${org}/${id}.wav`};
  db.state.uploadError = {message:'Falha de envio'};
  await assert.rejects(api.uploadPrompt(prompt,new Blob(['x'])), /Falha de envio/);
  db.state.removeError = {message:'Arquivo em uso'};
  await assert.rejects(api.deletePrompt(prompt), /Arquivo em uso/);
  assert.equal(db.calls.some(call=>call.name==='pbx_delete_audio_prompt'),false);
  db.state.removeError = null; await api.deletePrompt(prompt);
  assert.equal(db.calls.at(-1).name,'pbx_delete_audio_prompt');
  await assert.rejects(api.uploadPrompt({...prompt,organization_id:targetId},new Blob(['x'])), /empresa|aviso/i);
});

test('save/list/retry sempre usam a empresa e parâmetros reais da migração', async () => {
  const { createPbxCallFlowsApi,newCallFlow } = await load(); const db = client(); const api = createPbxCallFlowsApi(db,org);
  const flow = newCallFlow(); flow.name='Direto'; await api.saveFlow(flow); await api.listFlows(); await api.listPrompts(); await api.retryFlow(id);
  assert.deepEqual(db.calls[0].params,{p_organization_id:org,p_flow_id:null,p_name:'Direto',p_test_extension:910,p_enabled:false,p_config:flow.config});
  assert.deepEqual(db.calls.map(call=>call.name),['pbx_save_call_flow','pbx_list_call_flows','pbx_list_audio_prompts','pbx_retry_call_flow']);
  assert.ok(db.calls.every(call=>call.params.p_organization_id===org));
});

test('página completa oferece rascunho, revisão de falhas, retry/cleanup e parser TSX válido', async () => {
  const path='src/features/telephony/presentation/UnionPbxFlowsPage.tsx'; const source=readFileSync(path,'utf8');
  assert.ok((await transformWithEsbuild(source,path,{loader:'tsx'})).code);
  for (const text of ['preparePbxPrompt','reservePrompt','uploadPrompt','finishPrompt','deletePrompt','validateCallFlow','saveFlow','retryFlow','Não altera a entrada da operadora','Concluir envio','Tentar envio novamente','Feriados','Fora do horário','Salvar fluxo']) assert.ok(source.includes(text),text);
  assert.match(source,/\.eq\('organization_id', activeOrganizationId\)/);
  assert.match(source,/scope\.abort\(\)/); assert.match(source,/hasPermission\('pbx.manage'\)/);
});

test('fluxos têm navegação protegida e só destinos aplicados entram no telefone persistente', () => {
  const admin=readFileSync('src/app/Admin.tsx','utf8');
  const phone=readFileSync('src/features/telephony/presentation/UnionPbxToolPage.tsx','utf8');
  assert.match(admin,/route.subpage === "fluxos"/);
  assert.match(admin,/canManagePbxTool \? <UnionPbxFlowsPage/);
  assert.match(phone,/supabase.rpc\("pbx_available_test_flows",\{p_organization_id:activeOrganizationId\}\)/);
  assert.match(phone,/\.\.\.testFlows.map\(item=>item.number\)/);
  assert.match(phone,/onManageFlows/);
  assert.doesNotMatch(phone,/A discagem externa por este telefone ainda não foi habilitada/);
});
