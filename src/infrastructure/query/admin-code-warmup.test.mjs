import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';
import {scheduleOrderCodeWarmup} from '../../features/admin-shell/application/admin-code-warmup.mjs';
test('idle warmup loads one module only when authorized and foreground on adequate network',()=>{
  let callback,loads=0;const env={document:{hidden:false},navigator:{onLine:true,connection:{effectiveType:'4g'}},requestIdleCallback(fn){callback=fn;return 1;},cancelIdleCallback(){}};
  const stop=scheduleOrderCodeWarmup(true,()=>{loads++;},env);callback({timeRemaining:()=>20});assert.equal(loads,1);stop();
  env.navigator.connection.saveData=true;scheduleOrderCodeWarmup(true,()=>{loads++;},env);assert.equal(loads,1);
});
test('cancelled, unauthorized, hidden and busy idle callbacks never preload',()=>{
  let callback,loads=0;const env={document:{hidden:false},navigator:{onLine:true},requestIdleCallback(fn){callback=fn;return 1;},cancelIdleCallback(){}};
  scheduleOrderCodeWarmup(false,()=>loads++,env);assert.equal(callback,undefined);
  const stop=scheduleOrderCodeWarmup(true,()=>loads++,env);stop();callback({timeRemaining:()=>20});assert.equal(loads,0);
  scheduleOrderCodeWarmup(true,()=>loads++,env);callback({timeRemaining:()=>0});assert.equal(loads,0);
  scheduleOrderCodeWarmup(true,()=>loads++,env);env.document.hidden=true;callback({timeRemaining:()=>20});assert.equal(loads,0);
});
test('real warmup component respects access, Home route and authentication loading',async()=>{
  const source=readFileSync('src/features/admin-shell/application/AdminCodeWarmup.tsx','utf8');
  const {code}=await transform(source.slice(source.indexOf('export function AdminCodeWarmup')).replace('export function','function')+'\nreturn AdminCodeWarmup;',{loader:'tsx'});
  for(const entry of [{path:'/admin',allowed:true,module:true,loading:false,expected:1},{path:'/admin',allowed:false,module:true,loading:false,expected:0},{path:'/admin',allowed:true,module:false,loading:false,expected:0},{path:'/admin',allowed:true,module:true,loading:true,expected:0},{path:'/admin/finance',allowed:true,module:true,loading:false,expected:0},{path:'/admin',allowed:true,module:true,fetching:1,expected:0},{path:'/admin',allowed:true,module:true,lateBusy:true,expected:0},{path:'/admin',allowed:true,module:true,noHeading:true,expected:0}]){
    const loads=[],cleanups=[];let idle;
    const env={document:{hidden:false,querySelectorAll:()=>entry.noHeading?[]:[{textContent:'Bom dia, usuário'}]},navigator:{onLine:true},requestIdleCallback(fn){idle=fn;return 1;},cancelIdleCallback(){}};
    const Component=new Function('useEffect','useLocation','useAuth','scheduleOrderCodeWarmup','prefetchAdminModule','window','document','useIsFetching','useQueryClient',code)(
      fn=>cleanups.push(fn()),()=>({pathname:entry.path}),()=>({loading:entry.loading,session:{},activeOrganizationId:'org',hasPermission:()=>entry.allowed,hasModule:()=>entry.module}),scheduleOrderCodeWarmup,key=>loads.push(key),env,env.document,()=>entry.fetching??0,()=>({isFetching:()=>entry.lateBusy?1:entry.fetching??0}),
    );
    assert.equal(Component(),null);idle?.({timeRemaining:()=>20});assert.equal(loads.length,entry.expected);
    if(entry.expected)assert.deepEqual(loads,['orders']);cleanups.forEach(fn=>fn?.());
  }
});
