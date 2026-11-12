import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
test('Uniq nao renderiza interface, menu nem campos de vinculo',()=>{
  for(const path of [
    'src/features/admin-shell/presentation/AdminLayout.tsx',
    'src/features/admin-shell/presentation/AdminSidebar.tsx',
    'src/app/Admin.tsx',
    'src/features/access/presentation/UserAccessSection.tsx',
    'src/features/registrations/presentation/TabRegistrations.tsx',
    'src/features/employees/domain/permission-taxonomy.ts',
  ])assert.doesNotMatch(read(path), /UniqCallOverlay|tools\.uniq\.use|uniq_subscriber_id|web\.uniq\.app/);
  for(const path of [
    'src/features/telephony/presentation/UniqCallOverlay.tsx',
    'src/features/telephony/infrastructure/uniq-call.repository.ts',
    'src/features/telephony/domain/uniq-call.ts',
  ])assert.equal(existsSync(path),false,path);
});
test('legado Uniq nao pode fazer chamadas ou aceitar webhook',()=>{
  for(const path of ['supabase/functions/uniq-call/index.ts','supabase/functions/uniq-webhook/index.ts']){
    assert.ok(read(path).includes('status: 410'));
    assert.doesNotMatch(read(path),/fetch\(|createClient\(|supabase\.rpc\(/);
  }
  assert.ok(read('public/u/index.php').includes('http_response_code(410)'));
  assert.doesNotMatch(read('public/u/index.php'),/curl_exec|uniq-webhook\?token=/);
});
test('migracao apos o legado revoga acesso e remove cron sem apagar dados historicos',()=>{
  const sql=read('supabase/migrations/20261112005500_retire_uniq_runtime.sql');
  assert.match(sql,/cron\.unschedule\(v_jobid\)/);
  assert.match(sql,/revoke all on table public\.uniq_calls/);
  assert.doesNotMatch(sql,/drop table|truncate .*uniq_calls|delete from public\.uniq_calls/i);
});
