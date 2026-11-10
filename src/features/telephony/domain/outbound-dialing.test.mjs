import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformWithEsbuild} from 'vite';

async function load(){
  const path='src/features/telephony/application/outbound-dialing.ts';
  const {code}=await transformWithEsbuild(readFileSync(path,'utf8'),path,{loader:'ts'});
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
test('normaliza telefone nacional com DDD para o formato FVX já validado',async()=>{
  const {normalizeNationalDestination:normalize}=await load();
  for(const value of ['(79) 98803-7605','79988037605','5579988037605','+55 (79) 98803-7605'])
    assert.equal(normalize(value),'5579988037605');
  assert.equal(normalize('(11) 4290-1575'),'551142901575');
});
test('recusa SIP, injeção, DDI estrangeiro, números especiais e DDD inválido',async()=>{
  const {normalizeNationalDestination:normalize}=await load();
  for(const value of ['', '301','900','08001234567','03001234567','+14155552671','20988037605',
    '0079988037605','79988037605@evil.example','sip:79988037605','79988037605\n','79988037605\r',
    '79988037605\r\nHeader: yes','79988037605;foo'])
    assert.equal(normalize(value),null,value);
});
test('discador externo depende da organização plataforma e envia só o número normalizado',()=>{
  const page=readFileSync('src/features/telephony/presentation/UnionPbxToolPage.tsx','utf8');
  const admin=readFileSync('src/app/Admin.tsx','utf8');
  assert.match(admin,/allowExternalCalls=\{isPlatformOperatorOrganization\}/);
  assert.match(page,/allowExternalCalls && callState === "idle"/);
  assert.match(page,/const destination = normalizeNationalDestination\(externalTarget\)/);
  assert.match(page,/if \(!allowExternalCalls \|\| !destination/);
  assert.match(page,/aria-label="Telefone com DDD"/);
});
