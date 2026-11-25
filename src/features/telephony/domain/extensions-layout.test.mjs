import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';
const read = name => readFileSync(`src/features/telephony/presentation/${name}.tsx`, 'utf8');

test('ramais destacam cadastro e lista antes da administração técnica', () => {
  const page = read('UnionPbxExtensionsPage');
  assert.doesNotMatch(page, /Gerenciamento seguro|Nenhuma senha SIP|atualização manual sem consultas repetidas/);
  assert.ok(page.indexOf('Ramais cadastrados') < page.lastIndexOf('<UnionPbxAgentPanel'));
  assert.match(page, /canManage && <AdminButton[^>]*onClick=\{beginNew\}/);
});

test('central mantém estado visível e recolhe comandos e credenciais por padrão', () => {
  const panel = read('UnionPbxAgentPanel');
  const disclosure = panel.indexOf('<details');
  assert.ok(disclosure > panel.indexOf('aria-label="Estado da central"'));
  assert.doesNotMatch(panel.slice(disclosure, panel.indexOf('>', disclosure)), /\bopen\b/);
  assert.match(panel, /<summary[^>]*>Configurações avançadas da central<\/summary>/);
  for (const text of ['Ponte com a VPS', 'Autorizar uma VPS', 'pbx_register_agent', 'pbx_disable_agent']) {
    assert.ok(panel.includes(text));
  }
  assert.ok(panel.indexOf('Autorizar uma VPS') > disclosure);
  assert.match(panel, /isAgentHeartbeatFresh/);
  assert.match(panel, /Configuração pendente/);
});

test('componentes de ramais compilam como TSX', async () => {
  for (const name of ['UnionPbxExtensionsPage', 'UnionPbxAgentPanel']) {
    await transformWithEsbuild(read(name), `${name}.tsx`, { loader: 'tsx' });
  }
});
