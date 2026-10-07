import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSacRequest, mediaLimit, canonicalJson, mergeDeliveryEvidence } from './sac-contracts.mjs';

test('operational send keeps protocol in path and caption in body', () => {
  assert.deepEqual(buildSacRequest(78,{protocol:'123456',type:'image',url:'https://example.org/image.jpg',caption:'Olá'}), {
    method:'POST',path:'/operator/att/send/123456',body:{type:'image',url:'https://example.org/image.jpg',caption:'Olá'},mode:'operator',scopes:['protocol','send']
  });
});
test('observations preserve Portuguese contract fields and do not accept injected URL', () => {
  assert.deepEqual(buildSacRequest(35,{protocolo:'123456',observacao:'Retorno amanhã'}).body,{protocolo:'123456',observacao:'Retorno amanhã'});
  assert.throws(()=>buildSacRequest(35,{protocolo:'123456',observacao:'x',url:'https://evil.test'}), /Campo não permitido/);
});
test('paginated route encodes query text and never interpolates another parameter', () => {
  assert.equal(buildSacRequest(3,{p:2,filter:1,search:'55&filter=7'}).path,'/client/contact/search?p=2&filter=1&search=55%26filter%3D7');
  assert.throws(()=>buildSacRequest(2,{p:0}),/Página/);
});
test('message validation rejects undocumented data URLs and missing content', () => {
  assert.throws(()=>buildSacRequest(36,{protocol:'123456',type:'image',url:'data:image/png;base64,xx'}),/HTTPS/);
  assert.throws(()=>buildSacRequest(40,{number:'5511999999999',name:'Teste',channel:'c',type:'text'}),/Texto/);
});
test('campaign broadcast prohibits repeated media types and invalid campaign type', () => {
  assert.throws(()=>buildSacRequest(26,{canal_id:'c',titulo:'Oferta',tipo_campanha:'1',tipo_filtro:'todos',conteudo:[{type:'texto',value:'a'},{type:'texto',value:'b'}]}),/repetido/);
  assert.throws(()=>buildSacRequest(26,{canal_id:'c',titulo:'Oferta',tipo_campanha:'2',tipo_filtro:'todos',conteudo:[{type:'texto',value:'a'}]}),/Opção/);
  assert.equal(buildSacRequest(26,{canal_id:'c',titulo:'Oferta',tipo_campanha:'3',tipo_filtro:'todos',conteudo:[{type:'imagem',value:'https://example.org/i.png'}]}).body.conteudo[0].type,'imagem');
});
test('provider limits apply equally to manager and conservatively to unverified operator limits', () => {
  assert.equal(mediaLimit('image'),1048576);assert.equal(mediaLimit('audio'),3145728);assert.equal(mediaLimit('video'),5242880);assert.equal(mediaLimit('file'),5242880);
  assert.throws(()=>mediaLimit('executable'),/Tipo/);
});
test('canonical hash input ignores object key order while preserving array and repeated messages', () => {
  assert.equal(canonicalJson({b:2,a:{z:3,c:4}}),'{"a":{"c":4,"z":3},"b":2}');
  assert.notEqual(canonicalJson({messages:['oi','oi']}),canonicalJson({messages:['oi']}));
});
test('old delivery evidence cannot regress read and unknown is never sent', () => {
  assert.equal(mergeDeliveryEvidence('read','sent'),'read');
  assert.equal(mergeDeliveryEvidence('queued','unknown'),'queued');
  assert.equal(mergeDeliveryEvidence('unknown','delivered'),'delivered');
});
test('campaign filters use published suffix and status does not require a broadcast filter',()=>{
 assert.deepEqual(buildSacRequest(26,{canal_id:'c',titulo:'Oferta',tipo_campanha:1,tipo_filtro:'contatos',contatos_filtro:['12'],conteudo:[{type:'texto',value:'Olá'}]}).body,{canal_id:'c',titulo:'Oferta',tipo_campanha:1,tipo_filtro:'contatos',contatos_filtro:['12'],conteudo:[{type:'texto',value:'Olá'}]});
 assert.equal(buildSacRequest(26,{canal_id:'c',titulo:'Status',tipo_campanha:3,conteudo:[{type:'texto',value:'Bom dia'}]}).body.tipo_campanha,3);
});
