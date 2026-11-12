import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';

const path = 'supabase/functions/union-pbx-agent/index.ts';
const agentId = '86aa884f-02c0-4ddd-af77-99391b177287';
const organizationId = 'ffec0c6c-c18e-4f01-83e8-88dcdac82a8b';
const managedEndpoint = `uwt-${organizationId.replaceAll('-', '')}-${agentId.replaceAll('-', '')}-ep`;

async function bridge({ fail = false, enabled = true, admitted = true, platform = true, admissionError = false, sipAdmitted = true, sipHistory = [managedEndpoint], recordingAdmitted=true, policy=null, recording=null, purge=[] } = {}) {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64');
  let handler;
  const calls = [];
  const updates = [];
  const admissions = [];
  const filters = [];
  const storage=[];
  const admin = {
    storage:{from(bucket){return {async createSignedUrl(path,seconds){storage.push({bucket,path,seconds});return {data:{signedUrl:'https://private.test/notice'}};},async createSignedUploadUrl(path,options){storage.push({bucket,path,options});return {data:{signedUrl:'https://private.test/upload'}};},async remove(paths){storage.push({bucket,paths});return {data:[]};}};}},
    from(table) {
      const query = {
        select() { return query; }, eq(...args) { filters.push([table, ...args]); return query; }, lt() { return query; },
        gt() { return query; }, order() { return query; }, limit() { return query; },
        abortSignal() { return query; }, delete() { return query; },
        update(value) { if (table === 'pbx_agents') updates.push(value); return query; },
        then(resolve) { return Promise.resolve(resolve({ data: [] })); },
        async maybeSingle() { return { data: table==='pbx_call_recordings'?recording:{ id: agentId, organization_id: organizationId, enabled, public_key: publicKey, last_sequence: 0 } }; },
      };
      assert.ok(table.startsWith('pbx_'));
      return query;
    },
    async rpc(name, args) {
      if (name === 'pbx_admit_agent_request') {
        admissions.push(args);
        return admissionError ? { error: { code: 'XX000' } } : { data: { allowed: admitted, is_platform: platform } };
      }
      calls.push({ name, args });
      if(name==='pbx_admit_recording_poll')return {data:recordingAdmitted};
      if(name==='pbx_poll_recording_policy')return {data:policy};
      if(name==='pbx_prepare_recording_upload')return recordingAdmitted?{data:recording}:{error:{code:'42501'}};
      if(name==='pbx_finish_recording_upload'||name==='pbx_finish_recording_purge'||name==='pbx_report_recording_policy')return {data:recordingAdmitted};
      if(name==='pbx_claim_recording_purge')return {data:purge};
      if(name==='pbx_admit_sip_trunk_poll')return {data:sipAdmitted};
      if(name==='pbx_poll_sip_trunks')return {data:[]};
      if(name==='pbx_sip_history_endpoints')return {data:sipHistory};
      return fail ? { error: { code: '23514' } } :
      name === 'pbx_poll_queue_availability' ? { data: [] } : { data: { accepted: true, acknowledged: (args.p_records || args.p_results).length } }; },
  };


  globalThis.__historyCreateClient = () => admin;
  globalThis.Deno = { env: { get: () => 'configured' }, serve: value => { handler = value; } };
  const source = readFileSync(path, 'utf8').replace(/^import .*createClient.*;$/m, 'const createClient = globalThis.__historyCreateClient;');
  const { code } = await transformWithEsbuild(source, path, { loader: 'ts' });
  await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${crypto.randomUUID()}`);
  return {
    calls,
    updates,
    admissions,
    filters,
    storage,
    async send(body, tamper = false) {
      const time = String(Date.now()), sequence = '1', raw = JSON.stringify(body);
      const signature = await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(`${time}\n${sequence}\n${raw}`));
      return handler(new Request('https://example.test', { method: 'POST', body: tamper ? raw + ' ' : raw,
        headers: { 'Content-Type': 'application/json', 'X-Pbx-Agent': agentId, 'X-Pbx-Time': time,
          'X-Pbx-Sequence': sequence, 'X-Pbx-Signature': Buffer.from(signature).toString('base64') } }));
    },
  };
}

test('flow commands are opt-in and reports remain signed and bound to organization/version', async () => {
  const legacy=await bridge();
  assert.equal((await legacy.send({action:'poll',protocol_version:2})).status,200);
  assert.equal(legacy.filters.some(item=>item[0]==='pbx_call_flows'),false);
  const current=await bridge();
  const response=await current.send({action:'poll',protocol_version:2,features:['flows-v1']});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).flow_jobs,[]);
  assert.ok(current.filters.some(item=>item[0]==='pbx_call_flows'&&item[1]==='organization_id'&&item[2]===organizationId));
  const report=await bridge();
  const flowId=crypto.randomUUID(),version='2026-11-10T20:00:00Z';
  assert.equal((await report.send({action:'report_flow',id:flowId,version,status:'applied'})).status,200);
  for(const [field,value] of [['id',flowId],['organization_id',organizationId],['updated_at',version],['provisioning_status','pending']]){
    assert.ok(report.filters.some(item=>item[0]==='pbx_call_flows'&&item[1]===field&&item[2]===value));
  }
  const forged=await bridge();
  assert.equal((await forged.send({action:'report_flow',id:flowId,version,status:'applied'},true)).status,401);
  assert.equal(forged.filters.some(item=>item[0]==='pbx_call_flows'),false);
});

test('managed history refuses foreign, malformed and oversized endpoint responses',async()=>{
 for(const sipHistory of [[managedEndpoint.replace(organizationId.replaceAll('-',''),'0'.repeat(32))],['union-fvx-in'],Array(101).fill(managedEndpoint),null]){
  const partner=await bridge({platform:false,sipHistory});
  const response=await partner.send({action:'poll',protocol_version:3,features:['sip_trunks_v1']});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).history_endpoints,[]);
 }
});

test('histórico passa pela assinatura e usa apenas o agente verificado, ignorando empresa forjada', async () => {
  const b = await bridge();
  const records = [{ event_id: 'sample:1' }];
  const response = await b.send({ action: 'report_calls', records, organization_id: 'forged', agent_id: 'forged' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true, acknowledged: 1 });
  assert.deepEqual(b.calls, [{ name: 'pbx_ingest_call_records', args: { p_agent_id: agentId, p_records: records } }]);
});

test('every runtime action requires database admission after signature verification', async () => {
  for (const body of [
    { action: 'poll', protocol_version: 2 },
    { action: 'report_calls', records: [{}] },
    { action: 'report_availability', results: [{}] },
    { action: 'report_login', id: agentId, ciphertext: 'A'.repeat(342) + '==' },
    { action: 'report', id: agentId, version: '2026-11-10T14:00:00Z', status: 'applied' },
    { action: 'report_queue', id: agentId, version: '2026-11-10T14:00:00Z', status: 'applied' },
    { action: 'report_sip_trunks', results: [{id:agentId,revision:1,status:'applied'}] },
  ]) {
    const b = await bridge({ admitted: false, platform: false });
    assert.equal((await b.send(body)).status, 403, body.action);
    assert.equal(b.admissions.length, 1);
    assert.equal(b.calls.length, 0, 'no runtime RPC after rejected admission');
    assert.equal(b.updates.length, 1, 'only replay/heartbeat advanced');
  }
});

test('signed poll submits profile identity to service-only admission using the verified agent', async () => {
  const b = await bridge({ platform: false });
  const context = 'uwi-' + organizationId.replaceAll('-', '');
  assert.equal((await b.send({ action: 'poll', protocol_version: 3, profile_id: organizationId,
    profile_context: context, agent_id: 'forged', organization_id: 'forged' })).status, 200);
  assert.deepEqual(b.admissions[0], { p_agent_id: agentId, p_sequence: 1, p_action: 'poll',
    p_protocol_version: 3, p_profile_id: organizationId, p_profile_context: context });
  assert.ok(b.calls.some(call => call.name === 'pbx_poll_queue_availability'));
  assert.ok(b.filters.some(filter => filter[0] === 'pbx_browser_login_requests' && filter[1] === 'agent_id' && filter[2] === agentId));
  assert.equal(b.updates[0].capability_seen_at, undefined, 'generic heartbeat must not forge capability');
});

test('invalid signature never reaches capability admission and denied poll cannot publish telemetry', async () => {
  const invalid = await bridge();
  assert.equal((await invalid.send({ action: 'poll', protocol_version: 3 }, true)).status, 401);
  assert.equal(invalid.admissions.length, 0);
  const denied = await bridge({ admitted: false, platform: false });
  assert.equal((await denied.send({ action: 'poll', protocol_version: 2, profile_id: 'forged' })).status, 403);
  assert.equal(denied.filters.filter(filter => filter[0] === 'pbx_queues').length, 0);
});

test('login delivery is bound to the verified agent rather than organization alone', async () => {
  const b = await bridge();
  assert.equal((await b.send({ action: 'report_login', id: agentId, ciphertext: 'A'.repeat(342) + '==' })).status, 200);
  assert.ok(b.filters.some(filter => filter[0] === 'pbx_browser_login_requests' && filter[1] === 'agent_id' && filter[2] === agentId));
});

test('admission failure closes provisioning and partner polls never query external trunks', async () => {
  const unavailable = await bridge({ admissionError: true });
  assert.equal((await unavailable.send({ action: 'poll', protocol_version: 3 })).status, 503);
  assert.equal(unavailable.calls.length, 0);
  assert.equal(unavailable.filters.some(filter => filter[0] === 'pbx_extensions'), false);
  const partner = await bridge({ platform: false });
  assert.equal((await partner.send({ action: 'poll', protocol_version: 3,
    profile_id: organizationId, profile_context: `uwi-${organizationId.replaceAll('-', '')}` })).status, 200);
  assert.equal(partner.filters.some(filter => filter[0] === 'pbx_trunks'), false);
});

test('assinatura inválida e agente revogado não escrevem histórico', async () => {
  const b = await bridge();
  assert.equal((await b.send({ action: 'report_calls', records: [{}] }, true)).status, 401);
  assert.equal(b.calls.length, 0);
  const revoked = await bridge({ enabled: false });
  assert.equal((await revoked.send({ action: 'report_calls', records: [{}] })).status, 401);
  assert.equal(revoked.calls.length, 0);
});

test('lotes fora do limite não chegam ao banco e rejeição não recebe confirmação', async () => {
  const b = await bridge();
  for (const records of [null, [], Array(11).fill({})]) {
    assert.equal((await b.send({ action: 'report_calls', records })).status, 400);
  }
  assert.equal(b.calls.length, 0);
  const failed = await bridge({ fail: true });
  const response = await failed.send({ action: 'report_calls', records: [{}] });
  assert.equal(response.status, 400);
  assert.notEqual((await response.json()).accepted, true);
});

test('confirmações de pausa usam somente agente assinado e lote limitado', async () => {
  const b = await bridge();
  const results = [{ queue_id: 'sample', status: 'applied' }];
  const response = await b.send({ action: 'report_availability', results, agent_id: 'forged' });
  assert.equal(response.status, 200);
  assert.deepEqual(b.calls, [{ name: 'pbx_report_queue_availability', args: { p_agent_id: agentId, p_results: results } }]);
  assert.equal((await b.send({ action: 'report_availability', results: Array(11).fill({}) })).status, 400);
});

test('somente protocolo compatível recebe pausas e rollback do agente restaura protocolo antigo', async () => {
  const b = await bridge();
  const current = await b.send({ action: 'poll', protocol_version: 2 });
  assert.equal(current.status, 200);
  assert.deepEqual((await current.json()).availability_jobs, []);
  assert.ok(b.admissions.some(row => row.p_protocol_version === 2));
  assert.ok(b.calls.some(call => call.name === 'pbx_poll_queue_availability'));
  const old = await bridge();
  assert.equal((await old.send({ action: 'poll' })).status, 200);
  assert.ok(old.admissions.some(row => row.p_protocol_version === null));
  assert.equal(old.calls.filter(call => call.name === 'pbx_poll_queue_availability').length, 0);
});

test('SIP secrets require signed isolated partner poll and separately admitted capability',async()=>{
 const partner=await bridge({platform:false});
 const response=await partner.send({action:'poll',protocol_version:3,features:['sip_trunks_v1']});
 assert.equal(response.status,200);const payload=await response.json();assert.deepEqual(payload.sip_trunks,[]);
 assert.deepEqual(payload.history_endpoints,[managedEndpoint]);
 assert.ok(partner.calls.some(call=>call.name==='pbx_sip_history_endpoints'&&call.args.p_agent_id===agentId));
 assert.ok(partner.calls.some(call=>call.name==='pbx_admit_sip_trunk_poll'&&call.args.p_agent_id===agentId&&call.args.p_sequence===1));
 assert.ok(partner.calls.some(call=>call.name==='pbx_poll_sip_trunks'&&call.args.p_agent_id===agentId));
 const denied=await bridge({platform:false,sipAdmitted:false});
 await denied.send({action:'poll',protocol_version:3,features:['sip_trunks_v1']});
 assert.equal(denied.calls.some(call=>call.name==='pbx_poll_sip_trunks'),false);
 assert.equal(denied.calls.some(call=>call.name==='pbx_sip_history_endpoints'),false);
 for(const options of [{platform:true},{platform:false}]){
  const old=await bridge(options);await old.send({action:'poll',protocol_version:2,features:['sip_trunks_v1']});
  assert.equal(old.calls.some(call=>call.name==='pbx_poll_sip_trunks'),false);
  assert.equal(old.calls.some(call=>call.name==='pbx_sip_history_endpoints'),false);
 }
});

const recordingId='7251964c-c24a-47c9-aac8-b1aef88c746a';
function wav(){const b=Buffer.alloc(16044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(16000,40);return b;}
async function recordingRow(bytes=wav()) {const {createHash}=await import('node:crypto');return {id:recordingId,organization_id:organizationId,agent_id:agentId,event_id:'exact-cdr:1',policy_revision:agentId,scope:'internal',storage_path:`${organizationId}/${recordingId}.wav`,status:'uploading',expires_at:new Date(Date.now()+60000).toISOString(),size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),duration_seconds:1};}

test('recording poll is opt-in, separately admitted, signed and returns only its notice snapshot',async()=>{
 const prompt={id:recordingId,storage_path:`${organizationId}/${recordingId}.wav`,sha256:'a'.repeat(64),size_bytes:44,duration_seconds:1};
 for(const version of [2,3]){
  const b=await bridge({policy:{organization_id:organizationId,notice_enabled:true,notice_prompt:prompt}});
  const response=await b.send({action:'poll',protocol_version:version,features:['recordings_v1'],recording_report:{revision:agentId,status:'failed',error:'secret'}});
  assert.equal(response.status,200);assert.equal((await response.json()).recording_policy.notice_prompt.url,'https://private.test/notice');assert.equal(b.storage[0].seconds,120);
  assert.equal(b.calls.find(x=>x.name==='pbx_report_recording_policy').args.p_error,'Recording policy application failed');
 }
 for(const body of [{action:'poll',protocol_version:2},{action:'poll',protocol_version:3,features:['recordings_v1',42]}]){
  const b=await bridge();const r=await b.send(body);assert.equal((await r.json()).recording_policy,undefined);assert.equal(b.storage.length,0);assert.equal(b.calls.some(x=>x.name==='pbx_admit_recording_poll'),false);
 }
 const denied=await bridge({recordingAdmitted:false});assert.equal((await (await denied.send({action:'poll',protocol_version:3,features:['recordings_v1']})).json()).recording_policy,undefined);assert.equal(denied.storage.length,0);
 const forged=await bridge();assert.equal((await forged.send({action:'poll',protocol_version:3,features:['recordings_v1']},true)).status,401);assert.equal(forged.calls.length,0);
});

test('recording prepare only signs exact owned paths after capability RPC and preserves ready idempotency',async()=>{
 const recording=await recordingRow();const record={...recording};
 const b=await bridge({recording});const r=await b.send({action:'report_calls',recording_transfer:{kind:'prepare',record}});assert.equal(r.status,200);assert.equal((await r.json()).signed_url,'https://private.test/upload');assert.deepEqual(b.storage[0].options,{upsert:false});
 for(const options of [{recording:{...recording,storage_path:`${agentId}/${recording.id}.wav`}},{recording,recordingAdmitted:false},{recording,admitted:false}]){const denied=await bridge(options);assert.notEqual((await denied.send({action:'report_calls',recording_transfer:{kind:'prepare',record}})).status,200);assert.equal(denied.storage.length,0);}
 const ready=await bridge({recording:{...recording,status:'ready'}});assert.equal((await (await ready.send({action:'report_calls',recording_transfer:{kind:'prepare',record}})).json()).already_ready,true);assert.equal(ready.storage.length,0);
 const combined=await bridge({recording});assert.equal((await combined.send({action:'report_calls',records:[{event_id:recording.event_id}],recording_transfer:{kind:'prepare',record}})).status,200);assert.ok(combined.calls.findIndex(x=>x.name==='pbx_ingest_call_records')<combined.calls.findIndex(x=>x.name==='pbx_prepare_recording_upload'));
});

test('recording complete streams actual WAV digest, refuses invalid format and does not delete on transient fetch',async()=>{
 const original=globalThis.fetch;
 try{
  for(const invalid of [false,'format','digest','duration','size']){
   const bytes=wav();if(invalid==='format')bytes.writeUInt16LE(2,22);
   const recording=await recordingRow(bytes),b=await bridge({recording,policy:{enabled:true}});
   if(invalid==='digest')recording.sha256='0'.repeat(64);
   if(invalid==='duration')recording.duration_seconds=2;
   if(invalid==='size')recording.size_bytes=bytes.length-1;
   globalThis.fetch=async(url,options)=>{assert.equal(options.redirect,'error');assert.equal(options.headers.apikey,'configured');assert.ok(url.endsWith(recording.storage_path));return new Response(new ReadableStream({start(c){c.enqueue(bytes.subarray(0,30));c.enqueue(bytes.subarray(30));c.close();}}));};
   const r=await b.send({action:'report_calls',recording_transfer:{kind:'complete',recording_id:recording.id}});assert.equal(r.status,invalid?400:200);assert.equal(b.calls.some(x=>x.name==='pbx_finish_recording_upload'),!invalid);assert.equal(b.storage.length,invalid?1:0);
   assert.ok(b.filters.some(x=>x[0]==='pbx_call_recordings'&&x[1]==='agent_id'&&x[2]===agentId));
  }
  const b=await bridge({recording:await recordingRow(),policy:{enabled:true}});globalThis.fetch=async()=>{throw Error('network');};assert.equal((await b.send({action:'report_calls',recording_transfer:{kind:'complete',recording_id:recordingId}})).status,503);assert.equal(b.storage.length,0);
  const stale=await bridge({recording:await recordingRow()});globalThis.fetch=async()=>{assert.fail('stale capability reached Storage');};assert.equal((await stale.send({action:'report_calls',recording_transfer:{kind:'complete',recording_id:recordingId}})).status,400);
 }finally{globalThis.fetch=original;}
});

test('recording purge deletes only bounded exact organization claims before acknowledging',async()=>{
 const b=await bridge({purge:[{id:recordingId,storage_path:`${organizationId}/${recordingId}.wav`}]});assert.deepEqual(await (await b.send({action:'report_calls',recording_transfer:{kind:'purge'}})).json(),{accepted:true,acknowledged:1});assert.deepEqual(b.storage[0].paths,[`${organizationId}/${recordingId}.wav`]);
 const bad=await bridge({purge:[{id:recordingId,storage_path:`${agentId}/${recordingId}.wav`}]});assert.equal((await bad.send({action:'report_calls',recording_transfer:{kind:'purge'}})).status,400);assert.equal(bad.storage.length,0);
});

test('platform housekeeping can purge expired server claims for offline companies without granting partners that scope',async()=>{
 const owner='11111111-1111-4111-8111-111111111111';
 const claim={id:recordingId,organization_id:owner,storage_path:`${owner}/${recordingId}.wav`};
 const platform=await bridge({platform:true,purge:[claim]});
 assert.equal((await platform.send({action:'report_calls',recording_transfer:{kind:'purge'}})).status,200);
 assert.deepEqual(platform.storage[0].paths,[claim.storage_path]);
 const partner=await bridge({platform:false,purge:[claim]});
 assert.equal((await partner.send({action:'report_calls',recording_transfer:{kind:'purge'}})).status,400);
 assert.equal(partner.storage.length,0);
});
