import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';
const read = path => readFileSync(path, 'utf8');
test('Integrações PABX seleciona empresa explicitamente e remonta o painel ao trocar destino', async () => {
 const page=read('src/features/integrations/presentation/PlatformIntegrationsPage.tsx');
 assert.match(page,/selected === "pbx" && canAdministerPbx/);
 assert.match(page,/setPbxCompany\(company\)/);
 assert.match(page,/key=\{pbxCompany.id\}/);
 assert.match(page,/organizationId=\{pbxCompany.id\}/);
 assert.match(page,/administration/);
 assert.match(page,/registrationEnabled=\{pbxCompany.status === "active"/);
 assert.doesNotMatch(page,/disabled=\{!enabled \|\| company.status !== "active"\}/);
 assert.match(page,/isPlatformOperatorOrganization && hasPermission\("platform.management.manage"\)/);
 await transformWithEsbuild(page,'PlatformIntegrationsPage.tsx',{loader:'tsx'});
});
test('tela da empresa exibe apenas estado e técnico exige opção administrativa explícita', () => {
 const panel=read('src/features/telephony/presentation/UnionPbxAgentPanel.tsx');
 assert.match(panel,/administration = false/);
 assert.match(panel,/\{administration && <details/);
 assert.match(panel,/if \(!administration \|\| busy\) return/);
 assert.ok(panel.indexOf('aria-label="Atualizar estado da central"') < panel.indexOf('{administration && <details'));
 assert.match(panel,/registeredId \|\| agents.find/);
 assert.match(panel,/key|Chave pública/);
});
test('servidor separa administração da plataforma de gestão de ramais', () => {
 const sql=read('supabase/migrations/20261125123903_platform_pbx_agent_administration.sql');
 assert.match(sql,/private\.pbx_can_administer_agents/);
 assert.match(sql,/private\.is_platform_organization\(m.organization_id\)/);
 assert.match(sql,/m.status='active'/);
 assert.match(sql,/private\.has_effective_organization_permission\(m.organization_id,'platform.management.manage'\)/);
 assert.match(sql,/private\.pbx_org_enabled\(p_organization_id\)/);
 assert.match(sql,/pg_get_functiondef/);
 assert.doesNotMatch(sql,/create or replace function private\.pbx_has_permission/);
});
