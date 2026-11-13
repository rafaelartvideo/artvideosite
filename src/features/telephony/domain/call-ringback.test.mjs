import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {transformWithEsbuild} from 'vite';
async function load(){const p='src/features/telephony/application/call-ringback.ts';assert.ok(existsSync(p),'telefone deve tratar tom local de chamada');const {code}=await transformWithEsbuild(readFileSync(p,'utf8'),p,{loader:'ts'});return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
function fixture(){const events=new Map();return {direction:'outgoing',on:(n,f)=>events.set(n,f),emit:(n,v)=>events.get(n)?.(v)};}
test('180 e 183 acionam fallback, 100 não; atender e terminar impedem eventos tardios',async()=>{
 const {bindOutgoingRingback}=await load();
 for(const end of ['accepted','confirmed','ended','failed']){const s=fixture();const values=[];let stopped=false;
 bindOutgoingRingback(s,{progress:n=>{if(!stopped)values.push(n)},stop:()=>{stopped=true}},()=>true);
 s.emit('progress',{response:{status_code:100}});s.emit('progress',{response:{status_code:180}});s.emit('progress',{response:{status_code:183,body:'SDP não é áudio'}});s.emit(end);s.emit('progress',{response:{status_code:180}});
 assert.deepEqual(values,[180,183]);assert.equal(stopped,true);}
});
test('recebidas e eventos de outra sessão não geram tom de saída',async()=>{const {bindOutgoingRingback}=await load();for(const [direction,current] of [['incoming',true],['outgoing',false]]){let starts=0;const s=fixture();s.direction=direction;bindOutgoingRingback(s,{progress:()=>starts++,stop:()=>{}},()=>current);s.emit('progress',{response:{status_code:180}});assert.equal(starts,0);}});
test('todas as origens usam o mesmo telefone e preparam áudio no gesto de ligar',()=>{
 const p=readFileSync('src/features/telephony/presentation/UnionPbxToolPage.tsx','utf8');
 assert.match(p,/bindOutgoingRingback\(session/);assert.match(p,/onStream:.*observe/s);
 for(const name of ['callEcho','callInternal','originateExternal']){const part=p.slice(p.indexOf('const '+name+' ='),p.indexOf('\n  const ',p.indexOf('const '+name+' =')+10));assert.match(part,/prepareRingback\(\)/,name);}
 assert.match(p,/ringbackRef\.current\?\.dispose\(\)/);
});
test('fallback mantém cadência, respeita saída escolhida e cede ao áudio real, não apenas SDP',async t=>{
 const {createCallRingback,ringbackWave}=await load();const audio=[];let tick;let level=0;let disconnected=0;
 const previousAudio=globalThis.Audio,previousContext=globalThis.AudioContext;
 class FakeAudio{volume=0;currentTime=0;paused=false;play(){return Promise.resolve()}pause(){this.paused=true}removeAttribute(){}load(){}setSinkId(id){this.sinkId=id;return Promise.resolve()}constructor(){audio.push(this)}}
 class FakeContext{state='running';destination={};createMediaStreamSource(){return {connect(){},disconnect(){disconnected++}}}createAnalyser(){return {fftSize:512,connect(){},getFloatTimeDomainData(a){a.fill(level)}}}createGain(){return {gain:{value:1},connect(){}}}close(){return Promise.resolve()}}
 globalThis.Audio=FakeAudio;globalThis.AudioContext=FakeContext;
 t.mock.method(globalThis,'setInterval',cb=>{tick=cb;return 42});t.mock.method(globalThis,'clearInterval',()=>{});
 try{
  const blocked=[];const tone=createCallRingback({getOutput:()=>({sinkId:'headset'}),onBlocked:v=>blocked.push(v)});
  tone.prepare();await Promise.resolve();tone.progress(180);assert.equal(audio[0].sinkId,'headset');assert.ok(audio[0].volume>0);
  audio[0].currentTime=2;tone.progress(183);assert.equal(audio[0].currentTime,2,'novo progress não reinicia cadência');
  tone.observe({});tick();assert.ok(audio[0].volume>0,'track e SDP silenciosos não removem fallback');
  level=0.1;tick();level=0;tick();assert.ok(audio[0].volume>0,'um estalo isolado não remove o tom');
  level=0.1;tick();tick();tick();assert.equal(audio[0].volume,0,'voz, aviso ou tom remoto desliga o tom local');
  level=0;tick();tone.progress(180);assert.equal(audio[0].volume,0,'pausa do tom remoto não reativa outro tom');
  tone.dispose();tone.progress(180);assert.equal(audio[0].paused,true);assert.equal(disconnected,1);
  const bytes=new DataView(ringbackWave());assert.equal(bytes.getUint32(24,true),8000);assert.equal(bytes.byteLength,80044);
  assert.ok(bytes.getInt16(44+2*100,true)!==0);assert.equal(bytes.getInt16(44+2*9000,true),0);
 }finally{globalThis.Audio=previousAudio;globalThis.AudioContext=previousContext;}
});
test('bloqueio do navegador é indicado e uma nova chamada não herda fim ou áudio da anterior',async()=>{
 const {createCallRingback}=await load();const previous=globalThis.Audio,previousContext=globalThis.AudioContext;const audio=[];globalThis.AudioContext=class {state='running';close(){return Promise.resolve()}};
 globalThis.Audio=class {volume=0;fail=true;constructor(){audio.push(this)}play(){return this.fail?Promise.reject(Error('autoplay')):Promise.resolve()}pause(){}removeAttribute(){}load(){}};
 try{const blocks=[];const a=createCallRingback({getOutput:()=>null,onBlocked:v=>blocks.push(v)});a.prepare();await new Promise(r=>setImmediate(r));assert.equal(blocks.at(-1),true);audio[0].fail=false;a.prepare();await new Promise(r=>setImmediate(r));assert.equal(blocks.at(-1),false);a.stop();const b=createCallRingback({getOutput:()=>null,onBlocked:()=>{}});audio[1].fail=false;b.prepare();b.progress(180);assert.ok(audio[1].volume>0);a.progress(180);assert.equal(audio[0].volume,0);b.dispose();}finally{globalThis.Audio=previous;globalThis.AudioContext=previousContext;}
});
test('retorno interno também prepara tom e desconexão/cancelamento liberam recursos',()=>{
 const p=readFileSync('src/features/telephony/presentation/UnionPbxToolPage.tsx','utf8');
 const calls=[...p.matchAll(/uaRef\.current\.call\(/g)];assert.equal(calls.length,4);
 for(const m of calls)assert.match(p.slice(m.index-80,m.index),/prepareRingback\(\)/);
 assert.match(p,/ua\.on\("disconnected",[\s\S]*?ringbackRef\.current\?\.dispose\(\)/);
 assert.match(p,/const hangup = \(\) => \{\s*ringbackRef\.current\?\.dispose\(\)/);
});
test('falha de análise silencia fallback ao receber mídia, informa bloqueio e permite recuperação no clique',async t=>{
 const {createCallRingback}=await load();const oldAudio=globalThis.Audio,oldContext=globalThis.AudioContext;const audios=[];let ctx;let tick;
 globalThis.Audio=class {volume=0;constructor(){audios.push(this)}play(){return Promise.resolve()}pause(){}removeAttribute(){}load(){}};
 globalThis.AudioContext=class {state='suspended';failResume=true;failAnalyser=false;destination={};constructor(){ctx=this}resume(){if(this.failResume)return Promise.reject(Error('blocked'));this.state='running';return Promise.resolve()}createMediaStreamSource(){return {connect(){},disconnect(){}}}createAnalyser(){if(this.failAnalyser)throw Error('analyser');return {fftSize:512,connect(){},getFloatTimeDomainData(a){a.fill(0.1)}}}createGain(){return {gain:{value:1},connect(){}}}close(){return Promise.resolve()}};
 t.mock.method(globalThis,'setInterval',cb=>{tick=cb;return 123});t.mock.method(globalThis,'clearInterval',()=>{});
 try{const blocks=[];const tone=createCallRingback({getOutput:()=>null,onBlocked:v=>blocks.push(v)});tone.prepare();await new Promise(r=>setImmediate(r));tone.progress(180);tone.observe({});assert.equal(audios[0].volume,0);assert.equal(blocks.at(-1),true);
 ctx.failResume=false;ctx.failAnalyser=true;tone.prepare();await new Promise(r=>setImmediate(r));assert.equal(audios[0].volume,0);assert.equal(blocks.at(-1),true,'falha de análise não é escondida pelo play bem-sucedido');
 ctx.failAnalyser=false;tone.prepare();await new Promise(r=>setImmediate(r));assert.ok(audios[0].volume>0);assert.equal(blocks.at(-1),false);tick();tick();tick();assert.equal(audios[0].volume,0);tone.dispose();
 }finally{globalThis.Audio=oldAudio;globalThis.AudioContext=oldContext;}
});
