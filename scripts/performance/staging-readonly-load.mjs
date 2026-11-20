#!/usr/bin/env node
/** Union World — bounded, read-only load test. Never use against production. */
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';

const TRUE = 'SIM';
const safeRpcs = new Set([
  'load_admin_notifications_v1',
  'union_whatsapp_inbox_counts',
  'my_organization_permissions',
  'load_orders_reference_data_v1',
  'search_service_order_page_v1',
  'get_organization_audit_log_detail_v2',
]);
const integer = (name, def, min, max) => {
  const raw = process.env[name];
  const value = raw === undefined ? def : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max)
    throw Error(name + ' precisa estar entre ' + min + ' e ' + max);
  return value;
};
const percentile = (sorted, part) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * part) - 1)] : null;
const stats = (samples) => {
  const sorted = samples.slice().sort((a, b) => a - b);
  return {count: sorted.length, p50_ms: percentile(sorted, .5), p95_ms: percentile(sorted, .95), p99_ms: percentile(sorted, .99), max_ms: sorted.at(-1) ?? null};
};
const blockedHosts = /(^|\.)(unionworld\.com\.br|supabase\.co|supabase\.in|eletronicaartvideo\.com\.br)$/i;
function assertSafeTarget(target) {
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw Error('Informe apenas a origem HTTP(S), sem path, usuário, query ou hash.');
  const host = url.hostname.toLowerCase();
  if (blockedHosts.test(host)) throw Error('BLOQUEADO: host de produção Union World/Supabase.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(host);
  if (!local) {
    if (process.env.LOAD_TEST_STAGING_APPROVED !== TRUE ||
        process.env.LOAD_TEST_DATA_ISOLATED !== TRUE ||
        process.env.LOAD_TEST_ALLOWED_HOST?.toLowerCase() !== host ||
        !/^(staging|homolog|qa|test|sandbox)[.-]/i.test(host)) {
      throw Error('BLOQUEADO: teste remoto requer hostname homologado, allowlist exata e duas confirmações SIM.');
    }
    if (url.protocol !== 'https:') throw Error('Teste remoto exige HTTPS.');
  }
  return url.origin;
}
function loadScenarios(file, selftest) {
  if (selftest) return [{name:'mock_ro', method:'GET', path:'/__load_fixture/read', body:null, weight:1}];
  if (!file) throw Error('LOAD_TEST_SCENARIOS_FILE obrigatório para homologação.');
  const value = JSON.parse(readFileSync(file, 'utf-8'));
  if (!Array.isArray(value) || value.length === 0 || value.length > 20)
    throw Error('O arquivo deve ter de 1 a 20 cenários.');
  return value.map((s) => {
    if (!s || typeof s !== 'object' || typeof s.name !== 'string' || !/^[a-z][a-z0-9_-]{1,63}$/.test(s.name))
      throw Error('Nome inválido de cenário.');
    if (s.method !== 'POST' || !/^\/rest\/v1\/rpc\/[a-z0-9_]+$/.test(s.path))
      throw Error('Cenário ' + s.name + ': somente RPC POST autorizada, sem querystring.');
    const rpc = s.path.split('/').at(-1);
    if (!safeRpcs.has(rpc)) throw Error('Cenário ' + s.name + ': RPC fora da allowlist read-only.');
    if (!s.body || typeof s.body !== 'object' || Array.isArray(s.body))
      throw Error('Cenário ' + s.name + ': body JSON de parâmetros obrigatório.');
    const weight = s.weight ?? 1;
    if (!Number.isInteger(weight) || weight < 1 || weight > 100)
      throw Error('Cenário ' + s.name + ': weight inválido.');
    return {name:s.name, path:s.path, method:'POST', weight, body:s.body};
  });
}
async function startMock() {
  let counter = 0;
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/__load_fixture/read') {
      res.writeHead(405); res.end(); return;
    }
    counter++;
    const n = counter;
    // Known synthetic slowouts/errors validate collection, not the CRM.
    const status = n % 101 === 0 ? 503 : 200;
    setTimeout(() => {
      res.writeHead(status, {'content-type':'application/json', 'cache-control':'no-store'});
      res.end(JSON.stringify({synthetic:true, ok: status === 200}));
    }, n % 59 === 0 ? 75 : 3);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {server, origin:'http://127.0.0.1:' + server.address().port};
}
function chooseScenario(items, i) {
  const count = items.reduce((s,x)=>s+x.weight,0);
  let choice = i % count;
  for (const item of items) { if (choice < item.weight) return item; choice -= item.weight; }
  return items[0];
}
async function runPhase({origin, scenarios, users, rps, seconds, token, apikey, stopOnErrors}) {
  const started = performance.now();
  const deadline = started + seconds * 1000;
  const maxRequests = integer('LOAD_TEST_MAX_REQUESTS', 10000, 1, 100000);
  const timeouts = integer('LOAD_TEST_REQUEST_TIMEOUT_MS', 6000, 200, 30000);
  const spacing = 1000 / rps;
  let nextAt = started, issued = 0, active = 0, maxActive = 0, errors = 0, immediateStop = null;
  const samples=[], outcomes=new Map(), byScenario = new Map();
  const fetchHeaders = {'accept':'application/json'};
  if (token) fetchHeaders.authorization = 'Bearer ' + token;
  if (apikey) fetchHeaders.apikey = apikey;
  async function worker() {
    while (!immediateStop) {
      if (issued >= maxRequests) break;
      const scheduled = nextAt;
      if (scheduled >= deadline) break;
      nextAt += spacing;
      issued++;
      const number = issued;
      const wait = scheduled - performance.now();
      if (wait > 0) await pause(wait);
      if (immediateStop || performance.now() > deadline) break;
      const item=chooseScenario(scenarios,number-1);
      const headers={...fetchHeaders};
      let body;
      if (item.body) {headers['content-type']='application/json';body=JSON.stringify(item.body);}
      active++; maxActive=Math.max(active,maxActive);
      const t0=performance.now();
      let status='transport_error', ok=false;
      try {
        const response=await fetch(origin + item.path, {
          method:item.method, headers, body, cache:'no-store', redirect:'error', signal:AbortSignal.timeout(timeouts)
        });
        status=String(response.status);ok=response.ok;
        await response.arrayBuffer();
        if (response.status === 402) immediateStop='HTTP 402: provedor pode estar restringindo o serviço.';
      } catch (e) {status=e?.name === 'TimeoutError' ? 'timeout' : 'transport_error';}
      const duration = Math.round((performance.now()-t0)*100)/100;
      active--;
      if (ok) samples.push(duration); else errors++;
      const pair = byScenario.get(item.name) ?? {ok:0,error:0,samples:[]};
      if (ok){ pair.ok++; pair.samples.push(duration);} else pair.error++;
      byScenario.set(item.name,pair);
      outcomes.set(status,(outcomes.get(status)||0)+1);
      if (stopOnErrors && issued>=100 && errors/(samples.length+errors)>.05)
        immediateStop='Erros acima de 5%; interrupção de segurança.';
    }
  }
  await Promise.all(Array.from({length:users},()=>worker()));
  const elapsedSec=(performance.now()-started)/1000;
  const completed=samples.length+errors;
  return {
    virtual_users:users, rps_cap:rps, duration_requested_s:seconds,
    duration_observed_s:Math.round(elapsedSec*100)/100,
    requests:completed, success:samples.length, errors,
    error_rate_pct:completed?Math.round(errors/completed*10000)/100:0,
    achieved_rps:Math.round(completed/elapsedSec*100)/100,
    peak_in_flight:maxActive, stop_reason:immediateStop,
    outcomes:Object.fromEntries(outcomes), success_latency:stats(samples),
    scenarios:Object.fromEntries([...byScenario].map(([name,v])=>[name,{success:v.ok,errors:v.error,...stats(v.samples)}]))
  };
}
async function main() {
  const isSelf = !process.env.LOAD_TEST_TARGET;
  const mock = isSelf ? await startMock() : null;
  try {
    const origin=assertSafeTarget(mock?.origin ?? process.env.LOAD_TEST_TARGET);
    const scenarios=loadScenarios(process.env.LOAD_TEST_SCENARIOS_FILE,isSelf);
    const token = !isSelf ? process.env.LOAD_TEST_AUTH_TOKEN : undefined;
    const apikey = !isSelf ? process.env.LOAD_TEST_ANON_KEY : undefined;
    if (!isSelf && (!token || !apikey)) throw Error('Homologação requer token e chave ANON de ambiente isolado em variáveis de ambiente.');
    const users=integer('LOAD_TEST_USERS',isSelf?100:10,1,1000);
    const rps=integer('LOAD_TEST_RPS',isSelf?100:10,1,100);
    const seconds=integer('LOAD_TEST_SECONDS',isSelf?3:30,1,300);
    const report=await runPhase({origin,scenarios,users,rps,seconds,token,apikey,stopOnErrors:!isSelf});
    const result={kind:isSelf?'SELFTEST_MOCK_ONLY_NOT_CRM':'STAGING_READ_ONLY',at:new Date().toISOString(),target_kind:isSelf?'loopback-mock':'isolated-staging',...report};
    const output = process.env.LOAD_TEST_OUTPUT || 'load-test-result.json';
    writeFileSync(output, JSON.stringify(result,null,2)+'\n', {flag:'w'});
    console.log('Modo: ' + result.kind + '; VUs=' + users + '; limite=' + rps + ' req/s; concluídas=' + report.requests + '; sucesso=' + report.success + '; erros=' + report.errors + '; p95=' + report.success_latency.p95_ms + 'ms; pico simultâneo=' + report.peak_in_flight);
    console.log('Relatório salvo em ' + output);
    if (!isSelf && (report.stop_reason || report.error_rate_pct > 1)) process.exitCode=2;
  } finally { if (mock) await new Promise(resolve=>mock.server.close(resolve)); }
}
main().catch(e=>{console.error('Teste não iniciado ou falhou: ' + e.message);process.exitCode=1;});
