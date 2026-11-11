import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

// O contrato ativo da SAC legada é a ausência de processamento. Estes testes
// substituem os testes históricos que exigiam envio para um provedor desligado.
const retiredEndpoints = [
  'sac-digital-webhook',
  'sac-digital-api',
  'sac-digital-worker',
  'sac-digital-menu',
  'sac-digital-oauth',
  'sac-avatar-maintenance',
];

test('endpoints da SAC legada não fazem leitura, escrita ou chamadas externas', async () => {
  for (const slug of retiredEndpoints) {
    const path = slug === 'sac-avatar-maintenance'
      ? 'supabase/functions/sac-avatar-maintenance/index.ts'
      : `supabase/functions/${slug}/index.ts`;
    const source = await read(path);
    assert.match(source, /Deno\.serve\(/, slug);
    assert.match(source, /disabled: true|status: 204/, slug);
    assert.doesNotMatch(source, /createClient\s*\(|\.rpc\s*\(|\.from\s*\(|\.storage\.|fetch\s*\(/, slug);
  }
});

test('webhook antigo aceita sem processar e não gera retries por erro HTTP', async () => {
  const source = await read('supabase/functions/sac-digital-webhook/index.ts');
  assert.match(source, /status: 204/);
  assert.doesNotMatch(source, /status: 5\d\d/);
});

test('a API antiga responde desativado em vez de enviar mensagens', async () => {
  const source = await read('supabase/functions/sac-digital-api/index.ts');
  assert.match(source, /status: 410/);
  assert.match(source, /code: "sac_disabled"/);
});

test('CRM não exibe nem abre o módulo SAC legado', async () => {
  const admin = await read('src/app/Admin.tsx');
  assert.doesNotMatch(admin, /import\(["']@\/features\/sac-digital\/presentation\/SacDigitalToolPage/);
  assert.doesNotMatch(admin, /<SacDigitalToolPage|<SacDigitalSettingsPage/);
  assert.match(admin, /route\.resourceId === "sac-digital"[\s\S]*?<Navigate to=\{adminPath\("tools"\)\} replace/);
  assert.match(admin, /UnionWhatsAppInboxPage/);
});

test('repository bloqueia a SAC legada antes de chamar rede ou comprimir mídia', async () => {
  const repo = await read('src/features/sac-digital/infrastructure/sac-digital.repository.ts');
  assert.match(repo, /const SAC_DIGITAL_DISABLED = true/);
  const invoker = repo.slice(repo.indexOf('async function invokeSacDigitalApi'), repo.indexOf('export function testSacDigitalConnection'));
  assert.ok(invoker.indexOf('if (SAC_DIGITAL_DISABLED)') >= 0);
  assert.ok(invoker.indexOf('if (SAC_DIGITAL_DISABLED)') < invoker.indexOf('supabase.functions.invoke('));
  const sendMedia = repo.slice(repo.indexOf('export async function sendSacDigitalMediaMessage'), repo.indexOf('export function sendSacDigitalOrderMessage'));
  assert.ok(sendMedia.indexOf('if (SAC_DIGITAL_DISABLED)') >= 0);
  assert.ok(sendMedia.indexOf('if (SAC_DIGITAL_DISABLED)') < sendMedia.indexOf('prepareImageForUpload('));
  assert.match(repo, /enabled: false,[\s\S]*?connection_status: "not_configured"/);
});
