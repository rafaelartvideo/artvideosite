import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';

const path = 'src/features/telephony/presentation/UnionPbxTrunksPage.tsx';
const source = readFileSync(path, 'utf8');
test('trunks workspace parses as TSX and uses CRM theme controls', async () => {
  const result = await transformWithEsbuild(source, path, { loader: 'tsx', jsx: 'automatic' });
  assert.ok(result.code.length);
  assert.match(source, /FInput/);
  assert.match(source, /border-border bg-card/);
  assert.doesNotMatch(source, /bg-white|bg-black/);
});
test('tenant lifecycle destroys secrets and aborts stale requests', () => {
  assert.match(source, /hasPermission\('pbx\.manage'\)/);
  assert.match(source, /key=\{activeOrganizationId\}/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /scope\.current = null/);
  assert.match(source, /\.eq\('organization_id', organizationId\).*\.limit\(300\)\.abortSignal\(signal\)/);
  assert.match(source, /listSipTrunks\(supabase, organizationId, controller\.signal\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\./);
  assert.match(source, /type="password" autoComplete="new-password"/);
  assert.match(source, /finally \{[\s\S]*setPassword\(''\)/);
});
test('outbound authorization is explicit and inbound stays unavailable', () => {
  assert.match(source, /item\.desired_enabled && \(item\.provisioning_status === 'applied'/);
  assert.match(source, /platform && item\.provisioning_status === 'manual' && item\.number === 301 && item\.endpoint_name === 'union-301'/);
  assert.match(source, /draft\.allowed_extension_ids\.some/);
  assert.match(source, /Habilitar chamadas de saída explicitamente/);
  assert.match(source, /inbound_enabled: false/);
  assert.match(source, /Entrada para este tronco ainda não está disponível/);
  assert.match(source, /trunks\.some\(trunk => trunk\.enabled && trunk\.id !== draft\.id\)/);
});
test('mutation lock is acquired synchronously before IO and errors do not echo provider text', () => {
  assert.ok(source.indexOf('operation.current = true') < source.indexOf('await retrySipTrunk'));
  assert.match(source, /operation\.current \|\| loading/);
  assert.match(source, /confirmed = true;\s+setLoading\(true\)/);
  assert.match(source, /if \(!confirmed\) \{ operation\.current = false/);
  assert.match(source, /controller\.signal\.aborted/);
  assert.match(source, /retrySipTrunk\(supabase, organizationId, item\.id, controller\.signal\)/);
  assert.doesNotMatch(source, /\{item\.last_error\}|error\.message|JSON\.stringify/);
  assert.match(source, /Configuração aplicada não confirma registro/);
  assert.match(source, /quando não houver chamadas ativas/);
});
