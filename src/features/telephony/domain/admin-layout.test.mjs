import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';

for (const file of ['UnionPbxToolPage', 'UnionPbxExtensionsPage', 'UnionPbxQueuesPage', 'UnionPbxInboundPage', 'UnionPbxAgentPanel']) {
  test(`${file} usa botões compartilhados e tema do CRM`, async () => {
    const path = `src/features/telephony/presentation/${file}.tsx`;
    const source = readFileSync(path, 'utf8');
    assert.ok(source.includes('AdminButton'));
    assert.doesNotMatch(source, /<button\b/);
    assert.doesNotMatch(source, /#0057e7|#0057E7/);
    assert.ok((await transformWithEsbuild(source, path, { loader: 'tsx' })).code.length > 100);
  });
}
for (const file of ['UnionPbxExtensionsPage', 'UnionPbxQueuesPage', 'UnionPbxInboundPage', 'UnionPbxAgentPanel', 'UnionPbxQueueLiveStatus']) {
  test(`${file} limita consultas e cancela resultados na saída da empresa`, () => {
    const source = readFileSync(`src/features/telephony/presentation/${file}.tsx`, 'utf8');
    assert.ok(source.includes('pbxRequest('));
    assert.ok(source.includes('AbortController'));
    assert.ok(source.includes('.abortSignal('));
  });
}
test('planejamento de entrada não apresenta como atual um destino fixo antigo', () => {
  const source = readFileSync('src/features/telephony/presentation/UnionPbxInboundPage.tsx', 'utf8');
  assert.doesNotMatch(source, /Roteamento identificado no Asterisk|com ligação direta para/);
  assert.ok(source.includes('AdminSelect'));
  assert.ok(source.includes('AdminWorkspaceSkeleton'));
});

test('PABX organiza a central por subseções reais sem conceder gerenciamento a quem não pode', async () => {
  const navPath = 'src/features/telephony/presentation/UnionPbxSectionTabs.tsx';
  const nav = readFileSync(navPath, 'utf8');
  const pagePath = 'src/features/telephony/presentation/UnionPbxToolPage.tsx';
  const page = readFileSync(pagePath, 'utf8');
  const adminPath = 'src/app/Admin.tsx';
  const admin = readFileSync(adminPath, 'utf8');

  assert.match(nav, /AdminSubsectionTabs/);
  for (const label of ['telefone', 'historico', 'ramais', 'filas', 'fluxos', 'entrada']) {
    assert.ok(nav.includes(label), `Subseção ${label} deve existir`);
  }
  assert.match(nav, /canManage\s*\?/);
  assert.match(nav, /canManageInbound\s*\?/);
  assert.match(admin, /canManagePbxTool && isPlatformOperatorOrganization/);
  assert.match(admin, /route\.subpage as UnionPbxSection/);
  assert.match(page, /UnionPbxSectionTabs active="telefone"/);
  assert.match(page, /xl:grid-cols-\[minmax\(0,0\.9fr\)_minmax\(0,1\.1fr\)\]/);
  assert.match(page, /title="Teclado de discagem"/);
  assert.match(page, /internalDestinationReady/);
  assert.match(page, /registeredAndIdle/);
  assert.match(page, /const callInternal = \(\) => \{\s*if \(dialTarget === "900"\)/);
  assert.doesNotMatch(page, /<button\b/);
  for (const [path, source] of [[navPath, nav], [pagePath, page], [adminPath, admin]]) {
    assert.ok((await transformWithEsbuild(source, path, { loader: 'tsx' })).code);
  }
});
