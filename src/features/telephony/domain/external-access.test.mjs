import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformWithEsbuild} from 'vite';

test('external permission is bound to both company and authenticated assigned endpoint',async()=>{
 const {code}=await transformWithEsbuild(readFileSync('src/features/telephony/application/external-access.ts','utf8'),'external-access.ts',{loader:'ts'});
 const {externalDialingAllowed:allowed}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const grant={organizationId:'own',endpoint:'uw-own',allowed:true};
 assert.equal(allowed(false,false,'own','uw-own',grant),true);
 for(const [org,endpoint,g] of [['foreign','uw-own',grant],['own','uw-foreign',grant],['own','uw-own',null],['own','uw-own',{...grant,allowed:false}]])assert.equal(allowed(true,false,org,endpoint,g),false);
 assert.equal(allowed(true,true,'platform','union-301',null),true);
 assert.equal(allowed(false,true,'platform','union-301',grant),false);
});
