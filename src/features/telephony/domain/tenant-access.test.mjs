import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';
const read = path => readFileSync(path, 'utf8');

test('partner access requires the PBX module and permission while Union inbound stays exclusive', () => {
  const admin = read('src/app/Admin.tsx');
  assert.match(admin, /canAccessPbxTool = \(isPlatformOperatorOrganization \|\| hasModule\("pbx"\)\) && hasPermission\("pbx.view"\)/);
  assert.match(admin, /canManagePbxTool && isPlatformOperatorOrganization \? <UnionPbxInboundPage/);
  assert.match(admin, /onManageInbound=\{canManagePbxTool && isPlatformOperatorOrganization/);
  assert.match(admin, /key=\{`\$\{user.id\}:\$\{activeOrganizationId\}`\}/);
});

test('internal telephony can be distributed without claiming registration or external service', () => {
  const integration = read('src/features/integrations/presentation/PlatformIntegrationsPage.tsx');
  assert.match(integration, /key: "pbx"[^\n]*telefonia interna[^\n]*ready: true/);
  assert.doesNotMatch(integration, /const disabled =[^\n]*selected === "pbx"/);
  assert.match(integration, /implantação e o registro individual/);
});

test('partner phone has no manual Union credentials or line and only lists managed endpoints', () => {
  const phone = read('src/features/telephony/presentation/UnionPbxToolPage.tsx');
  assert.match(phone, /useState\(isPlatformOperatorOrganization \? SIP_USER : ""\)/);
  assert.match(phone, /if \(!isPlatformOperatorOrganization\) return;/);
  assert.match(phone, /isPlatformOperatorOrganization && \(!managedExtension \|\| manualMode\)/);
  assert.match(phone, /isPlatformOperatorOrganization && <AdminButton[^>]*onClick=\{\(\) => setManualMode\(true\)\}/);
  assert.match(phone, /isPlatformOperatorOrganization \? "\(11\) 4290-1575/);
  assert.match(phone, /item\.is_managed && item\.endpoint_name !== SIP_USER/);
  assert.match(phone, /!isPlatformOperatorOrganization && !managedExtension/);
  assert.match(phone, /isPlatformOperatorOrganization && onManageInbound/);
});

test('managed extension setup reserves queue and echo numbers and pages parse', async () => {
  const extension = read('src/features/telephony/presentation/UnionPbxExtensionsPage.tsx');
  assert.match(extension, /number >= 850 && number <= 899/);
  assert.match(extension, /number === 900/);
  assert.match(extension, /isPlatformOperatorOrganization \? "O ramal 301/);
  const panel=read('src/features/telephony/presentation/UnionPbxAgentPanel.tsx');
  assert.match(extension,/legacyProfile=\{isPlatformOperatorOrganization\}/);
  assert.match(panel,/legacyProfile = false/);
  assert.match(panel,/legacyProfile \? "" : `--profile \$\{organizationId\} `/);
  assert.match(panel,/\{profileOption\}configure/);
  assert.match(panel,/telefonia dos ramais já instalados exige uma desativação separada/);
  for (const file of ['src/app/Admin.tsx', 'src/features/integrations/presentation/PlatformIntegrationsPage.tsx',
    'src/features/telephony/presentation/UnionPbxToolPage.tsx', 'src/features/telephony/presentation/UnionPbxExtensionsPage.tsx',
    'src/features/telephony/presentation/UnionPbxAgentPanel.tsx', 'src/features/telephony/presentation/UnionPbxQueuesPage.tsx']) {
    assert.ok((await transformWithEsbuild(read(file), file, { loader: 'tsx' })).code.length > 100);
  }
});
