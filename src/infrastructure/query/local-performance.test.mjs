import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLocalPerformance, rpcName, summarize } from './local-performance.mjs';
import { screenName, contentReady } from './performance-screen-rules.mjs';

test('screen labels remove record identifiers and readiness requires real content',()=>{
  assert.equal(screenName('/admin/orders/private-customer-id'),'orders.detail');
  assert.equal(screenName('/admin/site/solicitacoes/pedidos'),'site.detail');
  assert.equal(screenName('/admin/finance/receivables'),'finance.detail');
  assert.equal(screenName('/admin/secret-user-name'),'other');
  assert.equal(contentReady('finance',['Financeiro'],'Carregando'),false);
  assert.equal(contentReady('finance',['Financeiro','Resumo financeiro'],''),true);
  assert.equal(contentReady('orders',['Ordens de Serviço'],'Carregando'),false);
  assert.equal(contentReady('orders',['Ordens de Serviço'],'513 OS encontradas'),true);
  assert.equal(contentReady('orders',['Ordens de Serviço'],'1 OS encontrada'),true);
  assert.equal(contentReady('orders',['Ordens de Serviço'],'Total do filtro: 12 OS'),true);
  assert.equal(contentReady('inventory',['Estoque'],'1 item cadastrado'),true);
});

test('quantiles require adequate samples; failures remain visible',()=>{
  const rows=Array.from({length:1000},(_,i)=>({durationMs:i+1,outcome:'success'}));
  assert.deepEqual(summarize(rows),{total:1000,success:1000,errors:0,censored:0,p50:500,p95:950,p99:990});
  assert.equal(summarize(rows.slice(0,199)).p95,null);
  assert.equal(summarize(rows.slice(0,999)).p99,null);
  const s=summarize([...rows,{durationMs:20000,outcome:'timeout'}]);
  assert.equal(s.total,1001);assert.equal(s.errors,1);assert.equal(s.p99,990);
});
test('opt-in, immutable context, bounded retention and expiry',()=>{
  let now=0;const p=createLocalPerformance({now:()=>now,maxSamples:3,maxDurationMs:100});
  p.record('rpc','load_auth_access_v1',1,'success');assert.equal(p.export().samples.length,0);
  p.start({build:'abc',session:'s1',network:'wifi',cache:'warm'});
  const span=p.begin('rpc','load_auth_access_v1');
  p.context({session:'s2'});now=10;span.end('success');
  assert.equal(p.export().samples[0].context.session,'s1');
  assert.equal(p.export().samples[0].offsetMs,10);
  for(let i=0;i<5;i++)p.record('rpc','load_auth_access_v1',i,'success');
  assert.equal(p.export().samples.length,3);assert.equal(p.export().dropped,3);
  now=101;p.record('rpc','load_auth_access_v1',2,'success');assert.equal(p.active(),false);
});
test('only RPC names retained, never query strings or tokens',()=>{
  assert.equal(rpcName('https://example.supabase.co/rest/v1/rpc/load_auth_access_v1?token=secret'),'load_auth_access_v1');
  assert.equal(rpcName('https://example.supabase.co/rest/v1/customers?cpf=secret'),null);
  const p=createLocalPerformance();p.start({build:'a',session:'b',secret:'DO_NOT_STORE'});
  assert.ok(!JSON.stringify(p.export()).includes('DO_NOT_STORE'));
});
test('fetch records actual body completion, keeps response and errors intact',async()=>{
  let now=0;const p=createLocalPerformance({now:()=>now});p.start({});
  let calls=0;const wrapped=p.wrapFetch(async()=>{calls++;now=5;return new Response('{"ok":true}');});
  const response=await wrapped('https://example.supabase.co/rest/v1/rpc/test');
  assert.equal(p.export().samples[0].kind,'rpc_headers');
  now=25;assert.equal(await response.text(),'{"ok":true}');
  const body=p.export().samples.find(s=>s.kind==='rpc_body');assert.equal(body.durationMs,25);
  assert.equal(calls,1);
  const error=new DOMException('expired','TimeoutError');
  const failed=p.wrapFetch(async()=>{throw error;});
  await assert.rejects(failed('https://example.supabase.co/rest/v1/rpc/test'),e=>e===error);
  assert.equal(p.export().samples.at(-1).outcome,'timeout');
});
test('disabled instrumentation transparently preserves fetch arguments and native Response',async()=>{
  const p=createLocalPerformance(),response=new Response('unchanged');
  const input=new Request('https://a/rest/v1/rpc/test');const init={headers:{'x-test':'unchanged'}};
  let calls=0;
  const result=await p.wrapFetch(async(received,options)=>{calls++;assert.equal(received,input);assert.equal(options,init);return response;})(input,init);
  assert.equal(result,response);assert.equal(Object.hasOwn(result,'text'),false);
  assert.equal(await result.text(),'unchanged');assert.equal(calls,1);assert.equal(p.export().samples.length,0);
});
test('strata never pool cache/session/network or RPC',()=>{
  const p=createLocalPerformance();p.start({session:'a',network:'wifi',cache:'warm'});
  p.record('rpc_body','one',1,'success');p.context({cache:'cold'});p.record('rpc_body','one',2,'success');
  p.context({session:'b'});p.record('rpc_body','two',3,'success');
  assert.equal(p.report().length,3);
});
test('unfinished requests are censored, and stopping preserves their denominator',()=>{
  const p=createLocalPerformance();p.start({});p.begin('rpc_body','pending');
  assert.equal(p.report()[0].censored,1);
  assert.equal(p.export().pending.length,1);
  p.stop();assert.equal(p.report()[0].censored,1);
  assert.equal(p.export().pending.length,0);
});
test('response completing after collection expiry remains censored',()=>{
  let time=0;const p=createLocalPerformance({now:()=>time,maxDurationMs:10});p.start({});
  const span=p.begin('rpc_body','slow');time=20;span.end();
  assert.equal(p.report()[0].censored,1);assert.equal(p.report()[0].success,0);
  p.stop();span.end();assert.equal(p.report()[0].censored,1);
});
test('late spans cannot enter a new collection and HTTP statuses stay distinct',async()=>{
  const p=createLocalPerformance();p.start({});const old=p.begin('rpc','old');p.start({});old.end();
  assert.equal(p.export().samples.length,0);
  const response=await p.wrapFetch(async()=>new Response('{}',{status:504}))('https://a/rest/v1/rpc/test');
  await response.text();assert.equal(p.export().samples.at(-1).outcome,'http_504');
});
test('real screen observer stays idle unless enabled and cleans up ready navigation',async()=>{
  const {transform}=await import('esbuild');
  const source=readFileSync('src/infrastructure/query/LocalPerformanceObserver.tsx','utf8');
  const {code}=await transform(source.slice(source.indexOf('export function LocalPerformanceObserver')).replace('export function','function')+'\nreturn LocalPerformanceObserver;',{loader:'tsx'});
  for(const [enabled,path] of [[false,'/admin/finance'],[true,'/admin/finance'],[true,'/admin/finance/receivables']]){
    const p=createLocalPerformance();if(enabled)p.start({});
    const cleanups=[],frames=[];let observes=0,disconnects=0;
    const doc={hidden:false,visibilityState:'visible',body:{textContent:''},addEventListener(){},removeEventListener(){},
      querySelectorAll:()=>[{textContent:'Resumo financeiro',getClientRects:()=>[{}]}],querySelector:()=>({textContent:''})};
    class Observer{observe(){observes++;}disconnect(){disconnects++;}}
    const Component=new Function('useLocation','useAuth','useState','useRef','useEffect','useLayoutEffect','localPerformance','networkContext','performanceAlias','subscribePerformance','screenName','contentReady','READY_SCREENS','document','MutationObserver','requestAnimationFrame','cancelAnimationFrame',code)(
      ()=>({pathname:path}),()=>({user:{id:'private-user'},activeOrganizationId:'private-org',loading:false}),
      n=>[n,()=>{}],value=>({current:value}),fn=>cleanups.push(fn()),fn=>fn(),p,()=> 'wifi',kind=>kind+'-local',()=>()=>{},screenName,contentReady,
      new Set(['finance']),doc,Observer,fn=>{frames.push(fn);return frames.length;},()=>{},
    );
    assert.equal(Component(),null);while(frames.length)frames.shift()();
    const supported=enabled&&path==='/admin/finance';assert.equal(observes,supported?1:0);
    if(supported){assert.equal(p.export().samples.find(s=>s.kind==='screen_ready').outcome,'success');assert.ok(!JSON.stringify(p.export()).includes('private-user'));}
    assert.equal(p.export().pending.length,0);
    cleanups.forEach(fn=>fn?.());if(enabled)assert.ok(disconnects>0);
  }
});
test('local control is invisible by default and its start action only enables local collection',async()=>{
  const React=await import('react');const {transform}=await import('esbuild');
  const source=readFileSync('src/infrastructure/query/LocalPerformancePanel.tsx','utf8');
  const {code}=await transform(source.slice(source.indexOf('export function LocalPerformancePanel')).replace('export function','function')+'\nreturn LocalPerformancePanel;',{loader:'tsx'});
  for(const open of [false,true]){
    let index=0,started=0;const p=createLocalPerformance(),effects=[];
    const api={start(options){started++;p.start({cache:options.cache});},stop:()=>p.stop(),download(){}};
    const Component=new Function('React','useState','useRef','useEffect','localPerformance','window',code)(
      React,initial=>[index++===0?open:initial,()=>{}],()=>({current:null}),effect=>effects.push(effect),p,{unionPerformance:api,addEventListener(){},removeEventListener(){}},
    );
    const tree=Component();if(!open){assert.equal(tree,null);assert.equal(started,0);continue;}
    const nodes=[];const walk=node=>{if(!React.isValidElement(node))return;nodes.push(node);React.Children.forEach(node.props.children,walk);};walk(tree);
    const button=nodes.find(node=>node.type==='button'&&node.props.children==='Iniciar nova coleta local');
    button.props.onClick();assert.equal(started,1);assert.equal(p.active(),true);assert.equal(p.export().samples.length,0);
  }
});
