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
