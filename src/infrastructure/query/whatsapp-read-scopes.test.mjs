import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/migrations/20261121182420_whatsapp_read_scope_sets.sql','utf8');

test('WhatsApp read scopes use fresh canonical authorization in private functions',()=>{
  assert.equal((sql.match(/language sql stable security definer/g)||[]).length,2);
  assert.equal((sql.match(/set search_path = ''/g)||[]).length,2);
  assert.match(sql,/\(select auth\.uid\(\)\) is not null/);
  assert.match(sql,/private\.has_effective_organization_permission\(c\.organization_id, 'whatsapp\.inbox\.view'\)/);
  assert.match(sql,/c\.state = 'connected'[\s\S]*c\.webhook_ready/);
  assert.match(sql,/b\.user_id = \(select auth\.uid\(\)\)[\s\S]*b\.is_active/);
  assert.match(sql,/private\.union_whatsapp_allowed\(b\.organization_id, p_capability\)/);
  for(const signature of ['union_whatsapp_read_accounts\\(\\)','union_whatsapp_read_organizations\\(text\\)']) {
    assert.match(sql,new RegExp(`revoke all on function private\\.${signature} from public, anon`));
    assert.match(sql,new RegExp(`grant execute on function private\\.${signature} to authenticated`));
  }
  assert.doesNotMatch(sql,/current_setting|set_config|user_metadata|grant[^;]*to anon/i);
});

test('policy subqueries are uncorrelated and preserve thread, participant and queue boundaries',()=>{
  assert.equal((sql.match(/from private\.union_whatsapp_read_accounts\(\) scope/g)||[]).length,2);
  for(const capability of ['view_all','view_assigned','view_queues']) {
    assert.ok(sql.includes(`organization_id in (select private.union_whatsapp_read_organizations('${capability}'))`));
  }
  assert.match(sql,/participant\.organization_id = union_whatsapp_conversations\.organization_id/);
  assert.match(sql,/participant\.conversation_id = union_whatsapp_conversations\.id/);
  assert.match(sql,/participant\.user_id = \(select auth\.uid\(\)\)[\s\S]*participant\.status = 'active'/);
  assert.match(sql,/member\.organization_id = union_whatsapp_conversations\.organization_id/);
  assert.match(sql,/member\.department_id = union_whatsapp_conversations\.department_id/);
  assert.match(sql,/forwarded_at is null or forwarded_by is distinct from \(select auth\.uid\(\)\)/);
  for(const [left,right] of [['id','conversation_id'],['organization_id','organization_id'],['channel_id','channel_id']]) {
    assert.ok(sql.includes(`thread.${left} = union_whatsapp_messages.${right}`));
  }
  assert.doesNotMatch(sql,/disable row level security|drop policy|alter table|create policy/i);
});
