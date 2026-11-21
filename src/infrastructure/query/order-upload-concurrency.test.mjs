import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';
import {prepareAtomicOrderUploads} from '../../features/orders/application/order-upload-concurrency.mjs';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('new order photos run at most two uploads and retain input ordering',async()=>{
  const images=Array.from({length:4},(_,i)=>({key:String(i),file:{i}}));const pending=[];let active=0,peak=0;
  const result=prepareAtomicOrderUploads(images,file=>{active++;peak=Math.max(peak,active);return new Promise(resolve=>pending.push(()=>{active--;resolve('media-'+file.i);}));});
  assert.equal(pending.length,2);pending[1]();await turn();assert.equal(pending.length,3);
  pending[0]();await turn();pending[2]();pending[3]();
  assert.equal((await result).failed,false);assert.equal(peak,2);
  assert.deepEqual(images.map(i=>i.mediaId),['media-0','media-1','media-2','media-3']);
});
test('failure waits for other active uploads and stops queued photos before cleanup',async()=>{
  const images=Array.from({length:4},(_,i)=>({key:String(i),file:{i}}));const pending=[];let settled=false;
  const result=prepareAtomicOrderUploads(images,file=>new Promise((resolve,reject)=>pending.push({file,resolve,reject}))).then(r=>{settled=true;return r;});
  pending[0].reject(new Error('upload failed'));await turn();assert.equal(settled,false);assert.equal(pending.length,2);
  pending[1].resolve('second-media');const value=await result;
  assert.equal(value.failed,true);assert.equal(value.uploaded[0].mediaId,'second-media');assert.equal(pending.length,2);
});
test('restricted connections remain serial and existing media are not uploaded again',async()=>{
  const images=[{mediaId:'existing'},{file:{i:1}},{file:{i:2}}];let calls=0,active=0,peak=0;
  await prepareAtomicOrderUploads(images,async()=>{calls++;active++;peak=Math.max(peak,active);await turn();active--;return 'new';},1);
  assert.equal(calls,2);assert.equal(peak,1);assert.equal(images[0].mediaId,'existing');
});

async function submissionHarness(){
  const source=readFileSync('src/features/orders/application/order-submission.ts','utf8');
  const repositoryNames=source.match(/^import\s*\{([\s\S]*?)\}\s*from "\.\.\/infrastructure\/orders.repository";/)[1].split(',').map(s=>s.trim()).filter(Boolean);
  const calls=[],cleanups=[];
  const deps=Object.fromEntries(repositoryNames.map(name=>[name,()=>{throw new Error('unexpected legacy operation '+name);} ]));
  deps.createServiceOrderAtomic=async args=>{calls.push(args);return {data:{id:args.orderId},error:null};};
  deps.cleanupFailedOrderCreationImages=async args=>{cleanups.push(args);};
  deps.orderImageSortOrder=(_kind,index)=>index;
  deps.prepareAtomicOrderUploads=prepareAtomicOrderUploads;
  const stripped=source.replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm,'').replace('export async function persistServiceOrder','async function persistServiceOrder');
  const {code}=await transform(stripped+'\nreturn persistServiceOrder;',{loader:'ts'});
  return {save:new Function(...Object.keys(deps),code)(...Object.values(deps)),calls,cleanups};
}
const base={organizationId:'org',editingOrder:null,creationRequestId:'request',payload:{},selectedTechnicianIds:[],selectedSellerIds:[],technicalValues:[],saveTechnicalValues:async()=>{}};
test('real atomic submission waits for all uploads and commits links in input order',async()=>{
  const h=await submissionHarness(),pending=[];
  const result=h.save({...base,orderImages:[0,1,2].map(i=>({key:String(i),file:{i}})),uploadImage:file=>new Promise(resolve=>pending.push(()=>resolve('media-'+file.i)))});
  assert.equal(h.calls.length,0);pending[1]();await turn();pending[0]();await turn();assert.equal(h.calls.length,0);pending[2]();
  assert.equal((await result).success,true);assert.equal(h.calls.length,1);assert.equal(h.calls[0].orderId,'request');
  assert.deepEqual(h.calls[0].mediaLinks.map(m=>m.media_id),['media-0','media-1','media-2']);
});
test('real atomic failure cleans late successful uploads before returning and never creates an order',async()=>{
  const h=await submissionHarness(),pending=[];let done=false;
  const result=h.save({...base,orderImages:[{mediaId:'existing'},...Array.from({length:3},(_,i)=>({file:{i}}))],uploadImage:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))}).then(r=>{done=true;return r;});
  pending[0].reject(new Error('failed'));await turn();assert.equal(done,false);assert.equal(h.cleanups.length,0);
  pending[1].resolve('late-success');assert.equal((await result).stage,'images');
  assert.equal(h.calls.length,0);assert.equal(pending.length,2);
  assert.deepEqual(h.cleanups[0],{orderId:'request',organizationId:'org',mediaIds:['late-success']});
});
