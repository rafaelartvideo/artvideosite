import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registrationPageHasGlobalTotal} from '../../features/registrations/domain/registration-page-total.mjs';
test('página sem filtros já contém o total global; ordenação/paginação não exigem segunda consulta',()=>{
 assert.equal(registrationPageHasGlobalTotal({}),true);
 assert.equal(registrationPageHasGlobalTotal({page:3,pageSize:20,sort:'name_desc'}),true);
});
test('cada restrição mantém a consulta independente do total global',()=>{
 for(const filter of [{nameSearch:'Rafael'},{documentSearch:'123'},{role:'customer'},{status:'active'},{creatorFilter:'system'},{createdDate:'2026-11-21'},{employeeOnly:true}]){
  assert.equal(registrationPageHasGlobalTotal(filter),false,JSON.stringify(filter));
 }
});
test('Cadastros evita a RPC de contagem apenas quando a página já contém o total global',()=>{
 const source=readFileSync('src/features/registrations/presentation/TabRegistrations.tsx','utf8');
 assert.match(source,/const pageHasGlobalTotal = registrationPageHasGlobalTotal\(/);
 const count=source.slice(source.indexOf('const registrationsCountQuery'),source.indexOf('// Não substituir uma página'));
 assert.match(count,/enabled:[^\n]*!pageHasGlobalTotal/);
 assert.match(count,/pageHasGlobalTotal \? totalItems :/);
 assert.match(count,/role: "all", status: "all", employeeOnly: false/);
});
