import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';

for (const file of ['UnionPbxToolPage', 'UnionPbxExtensionsPage', 'UnionPbxQueuesPage', 'UnionPbxInboundPage', 'UnionPbxAgentPanel']) {
  test(`${file} usa botões compartilhados e tema do CRM`, async () => {
    const path = `src/features/telephony/presentation/${file}.tsx`;
    const source = readFileSync(path, 'utf8');
    assert.ok(source.includes('AdminButton'));
    if (file !== 'UnionPbxToolPage') assert.doesNotMatch(source, /<button\b/);
    else assert.match(source, /aria-label=\{`Tecla \$\{digit\}`\}/);
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

test('PABX usa console do operador e modais protegidos mantendo a chamada', async () => {
  const navPath = 'src/features/telephony/presentation/UnionPbxOperatorWorkspace.tsx';
  const nav = readFileSync(navPath, 'utf8');
  const pagePath = 'src/features/telephony/presentation/UnionPbxToolPage.tsx';
  const page = readFileSync(pagePath, 'utf8');
  const adminPath = 'src/app/Admin.tsx';
  const admin = readFileSync(adminPath, 'utf8');
  assert.match(nav, /AdminSubsectionTabs<WorkspaceMode>/);
  assert.match(nav, /Subseções da central de chamadas/);
  assert.match(nav, /role="group" aria-label="Ações do PABX"/);
  assert.match(nav, /<AdminButton variant="secondary" size="sm" aria-label="Dispositivos e testes de áudio"/);
  assert.match(nav, /<AdminButton variant="secondary" size="sm" title="Configurações gerais do módulo"/);
  assert.match(nav, /<AdminButton variant="secondary" size="sm" onClick=\{onBack\}/);
  assert.doesNotMatch(nav, /trailing=\{|ADMIN_SUBSECTION_TAB_CLASS/);
  assert.match(nav, /xl:grid-cols-\[minmax\(270px,345px\)_minmax\(0,1fr\)\]/);
  assert.match(nav, /open=\{detailsOpen && isActive\}/);
  assert.match(nav, /title="Detalhes do contato"/);
  assert.doesNotMatch(nav, /aria-label="Detalhes da seleção"/);
  assert.doesNotMatch(nav, /Navegação do operador|<PageHeader/);
  for (const item of ['"chamadas"', '"contatos"', '"historico"', '"gravacoes"', '"fluxos"', '"troncos"', '"entrada"']) {
    assert.ok(nav.includes(item), item);
  }
  assert.doesNotMatch(nav, /id: "filas" as const|id: "ramais" as const/);
  assert.match(nav, /aria-label="Configurações gerais do PABX"/);
  assert.match(nav, /aria-label="Dispositivos e testes de áudio"/);
  assert.match(nav, /const pageSize = 10/);
  assert.match(nav, /table: "pbx_call_logs", filter/);
  assert.doesNotMatch(nav, /Atualizar chamadas|setPageSize\(/);
  assert.match(nav, /canManage \?/);
  assert.match(nav, /canManageInbound \?/);
  assert.match(nav, /loadCallHistory/);
  assert.match(nav, /setPage/);
  assert.match(nav, /queryFn: async \(\{signal\}\)/);
  assert.match(nav, /enabled: Boolean\(activeOrganizationId && isActive\)/);
  assert.match(admin, /canManagePbxTool && isPlatformOperatorOrganization/);
  assert.match(admin, /<AdminDialog[\s\S]*?title=\{\(\{/);
  assert.match(page, /<UnionPbxOperatorWorkspace/);
  assert.match(page, /aria-label="Teclado de discagem"/);
  assert.match(page, /internalDestinationReady/);
  assert.match(page, /registeredAndIdle/);
  assert.match(page, /const callInternal = \(\) => \{\s*if \(dialTarget === "900"\)/);
  assert.match(page, /onOutputPending=/);
  for (const [path, source] of [[navPath, nav], [pagePath, page], [adminPath, admin]]) {
    assert.ok((await transformWithEsbuild(source, path, { loader: 'tsx' })).code);
  }
});
