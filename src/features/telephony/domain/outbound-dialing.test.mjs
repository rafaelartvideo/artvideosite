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
test('discador externo preserva saída Union e exige autorização específica para parceiros',()=>{
  const page=readFileSync('src/features/telephony/presentation/UnionPbxToolPage.tsx','utf8');
  const admin=readFileSync('src/app/Admin.tsx','utf8');
  assert.match(admin,/allowExternalCalls=\{isPlatformOperatorOrganization\}/);
  assert.match(page,/canUseExternal && callState === "idle"/);
  assert.match(page,/const destination = normalizeNationalDestination\(externalTarget\)/);
  assert.match(page,/if \(!canUseExternal \|\| !destination/);
  assert.match(page,/externalDialingAllowed\(allowExternalCalls,isPlatformOperatorOrganization,activeOrganizationId,sipUser,externalGrant\)/);
  assert.match(page,/supabase.rpc\('pbx_can_dial_external'/);
  assert.match(page,/aria-label="Telefone com DDD"/);
});

test('click-to-call da OS e demais links tel usa a sessao SIP da Union, sem cruzar empresas', () => {
  const pbx = readFileSync('src/features/telephony/presentation/UnionPbxToolPage.tsx', 'utf8');
  const event = readFileSync('src/features/orders/domain/order-contact-actions.ts', 'utf8');
  const os = readFileSync('src/features/orders/presentation/OrderDetailsContent.tsx', 'utf8');
  const completion = readFileSync('src/features/orders/presentation/OrderCompletionModal.tsx', 'utf8');
  const monitor = readFileSync('src/features/orders/presentation/OrderDetailsPage.tsx', 'utf8');
  assert.ok(pbx.includes('if (!isPlatformOperatorOrganization || !canUseExternal || !activeOrganizationId) return;'));
  assert.ok(pbx.includes('requestedOrganizationId !== activeOrganizationId'));
  assert.ok(pbx.includes('normalizeNationalDestination(rawPhone)'));
  assert.ok(pbx.includes('window.addEventListener(PHONE_CALL_EVENT, handleIntegrationCall)'));
  assert.ok(pbx.includes('document.addEventListener("click", handlePhoneAnchorClick, true)'));
  assert.ok(pbx.includes('anchor.hasAttribute("data-phone-number")'));
  assert.ok(pbx.includes('originateExternal(destination, rawPhone)'));
  assert.ok(pbx.includes('Conecte seu ramal e clique em Ligar'));
  assert.ok(pbx.includes('uaRef.current.call(`sip:${destination}@${SIP_HOST}`'));
  assert.ok(event.includes('organizationId: organizationId || null'));
  assert.ok(os.includes('notifyPhoneCallIntegration(callContact.phone, detail.id, detail.organization_id)'));
  assert.ok(completion.includes('notifyPhoneCallIntegration(callContact.phone, orderId, organizationId)'));
  assert.ok(monitor.includes('notifyPhoneCallIntegration(phoneContactLinks(contactPhone).phone, detail.id)'));
});
