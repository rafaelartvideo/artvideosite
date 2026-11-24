import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformWithEsbuild} from 'vite';
const modelPath='src/features/telephony/domain/trunk-setup-guide.ts';
async function model(){const source=readFileSync(modelPath,'utf8').replace(/^import type .*;$/gm,'');const compiled=await transformWithEsbuild(source,modelPath,{loader:'ts'});return import('data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'));}
const empty=()=>Object.fromEntries(['providers','contracts','connections','trunks','dids','groups','capacity_pools','outbound_routes'].map(key=>[key,[]]));
test('guided order builds references before capacity and reviews activation last',async()=>{const m=await model();assert.deepEqual(m.TRUNK_SETUP_STEPS.map(step=>step.key),['providers','contracts','connections','trunks','dids','groups','capacity_pools','outbound_routes','review']);assert.ok(m.TRUNK_SETUP_STEPS.every(step=>step.title&&step.description&&step.instructions.length&&step.example));assert.equal(m.TRUNK_SETUP_STEPS.find(step=>step.key==='dids').optional,true);});
test('registration dependencies explain the missing earlier record without guessing capacity',async()=>{const m=await model();const doc=empty();assert.equal(m.setupPrerequisite('providers',doc),null);assert.equal(m.setupPrerequisite('connections',doc),'providers');doc.providers=[{id:'p'}];assert.equal(m.setupPrerequisite('connections',doc),'contracts');doc.contracts=[{id:'c'}];assert.equal(m.setupPrerequisite('connections',doc),null);assert.equal(m.setupPrerequisite('groups',doc),'connections');doc.connections=[{id:'a'}];assert.equal(m.setupPrerequisite('groups',doc),'trunks');assert.equal(m.nextSetupStep('outbound_routes'),'review');assert.equal(m.nextSetupStep('review'),'review');});
test('guided layout separates previous configuration and keeps advanced diagnostics out of onboarding',async()=>{const guide=readFileSync('src/features/telephony/presentation/UnionPbxTrunkSetupGuide.tsx','utf8');assert.match(guide,/aria-current/);assert.match(guide,/Etapa/);assert.match(guide,/Próxima etapa/);assert.match(guide,/Conferir e ativar/);assert.doesNotMatch(guide,/bg-white|text-black/);assert.ok((await transformWithEsbuild(guide,'guide.tsx',{loader:'tsx',jsx:'automatic'})).code);const page=readFileSync('src/features/telephony/presentation/UnionPbxTrunksPage.tsx','utf8');assert.match(page,/<details[^>]*data-pbx-previous/);assert.match(page,/Linhas existentes/);const editor=readFileSync('src/features/telephony/presentation/UnionPbxUniversalTelephony.tsx','utf8');assert.match(editor,/Salvar e continuar/);assert.match(editor,/Opções avançadas/);assert.match(editor,/Detalhes da central e histórico/);assert.match(editor,/data\.can_activate/);});


test('review is a separate screen and cannot enable routes before server admission',async()=>{
 const React=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
 const guide=readFileSync('src/features/telephony/presentation/UnionPbxTrunkSetupGuide.tsx','utf8').replace(/^import .*;$/gm,'');
 const domain=readFileSync(modelPath,'utf8').replace(/^import type .*;$/gm,'');
 const compiled=await transformWithEsbuild(domain+'\n'+guide,'guide-render.tsx',{loader:'tsx',jsx:'transform',jsxFactory:'React.createElement'});
 const make=new Function('React','AdminButton',compiled.code.replace(/^export /gm,'')+'\nreturn UnionPbxTrunkSetupGuide;');
 const Button=({children,variant,...props})=>React.createElement('button',props,children);const Guide=make(React,Button);
 const doc={...empty(),schema_version:1,routing_enabled:false};
 const html=renderToStaticMarkup(React.createElement(Guide,{step:'review',document:doc,locked:false,onSelect(){},canActivate:false,onActivate(){}},React.createElement('form',{'data-editor':'hidden'},'NOT_IN_REVIEW')));
 assert.doesNotMatch(html,/NOT_IN_REVIEW/);assert.match(html,/Ativação ainda não liberada/);assert.match(html,/<button disabled="">Solicitar ativação das rotas/);assert.match(html,/aria-current="step"/);
 const active=renderToStaticMarkup(React.createElement(Guide,{step:'review',document:{...doc,routing_enabled:true},locked:false,onSelect(){},canActivate:false,onActivate(){}},null));
 assert.match(active,/<button>Desativar novas rotas/);
 const first=renderToStaticMarkup(React.createElement(Guide,{step:'providers',document:doc,locked:false,onSelect(){},canActivate:false,onActivate(){}},React.createElement('form',null,'CURRENT_EDITOR')));
 assert.match(first,/CURRENT_EDITOR/);assert.doesNotMatch(first,/Solicitar ativação das rotas/);assert.match(first,/Como preencher/);assert.match(first,/Exemplo: Minha operadora/);
});

test('capacity guide names each scope and allows an inbound-only setup without an outbound group',async()=>{const m=await model();const doc=empty();for(const key of ['providers','contracts','connections','trunks'])doc[key]=[{id:key,name:'Named '+key}];assert.equal(m.setupPrerequisite('capacity_pools',doc),null);const targets=m.capacitySetupTargets(doc,'org');assert.deepEqual(targets.map(row=>row.scope),['organization','provider','contract','connection','trunk']);assert.equal(targets[0].scope_id,'org');assert.ok(targets.slice(1).every(row=>row.label.includes('Named')));doc.groups=[{id:'group',name:'Atendimento'}];assert.equal(m.capacitySetupTargets(doc,'org').at(-1).scope,'group');});
