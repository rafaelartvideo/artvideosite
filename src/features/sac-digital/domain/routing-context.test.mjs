import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('routing requests carry the selected external protocol and preserve department authorization availability', async () => {
 const repository = await readFile(new URL('../infrastructure/sac-digital.repository.ts', import.meta.url), 'utf8');
 const page = await readFile(new URL('../presentation/SacDigitalToolPage.tsx', import.meta.url), 'utf8');
 assert.match(repository, /getSacDigitalRoutingOptions\(organizationId: string, protocol: string\)/);
 assert.match(repository, /department_authorization_required: data\.department_authorization_required === true/);
 assert.match(page, /getSacDigitalRoutingOptions\(activeOrganizationId, selectedProtocol\.external_protocol_id\)/);
 assert.match(page, /Para listar outros departamentos, autorize seu Operador novamente\./);
});
