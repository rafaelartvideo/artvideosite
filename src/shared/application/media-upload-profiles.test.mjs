import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const root=new URL('../../',import.meta.url);
const stub='data:text/javascript,export const supabase=globalThis.__mediaProfileClient;';
registerHooks({resolve(s,c,next){
 if(s==='@/lib/active-organization') return {url:'data:text/javascript,export async function getActiveOrganizationId(){return "org";}',shortCircuit:true};
 if(s==='@/lib/supabase') return {url:stub,shortCircuit:true};
 if(s==='@/infrastructure/query/storage-preview-cache') return {url:'data:text/javascript,export function getStoragePreviewUrl(){}',shortCircuit:true};
 if(s.startsWith('@/'))return next(new URL(s.slice(2)+'.ts',root).href,c);
 return next(s,c);
}});
const writes=[];
globalThis.__mediaProfileClient={auth:{getSession:async()=>({data:{session:{user:{id:'u'}}}})},storage:{from:()=>({upload:async(p,f)=>{writes.push({p,f});return {};}})},from:()=>({insert:v=>({select:()=>({single:async()=>{writes.push(v);return {data:{id:'m'}};}})})})};
const {uploadMediaFile}=await import('../infrastructure/media.repository.ts');
test('avatar and logo uploads use purpose dimensions and register the actual encoded file',async t=>{
 const oldDoc=globalThis.document,oldBitmap=globalThis.createImageBitmap;
 t.after(()=>{globalThis.document=oldDoc;globalThis.createImageBitmap=oldBitmap;});
 const dimensions=[];
 globalThis.createImageBitmap=async()=>({width:4000,height:3000,close(){}});
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray([0,0,0,255])})}),toBlob(cb,type){dimensions.push(this.width);cb(new Blob([new Uint8Array(1000)],{type}));}})};
 for(const [bucket,width] of [['avatars',512],['brand-images',1600]]){
  writes.length=0;
  const original=new File([new Uint8Array(1000000)],'large.png',{type:'image/png'});
  await uploadMediaFile(bucket,original,'org',undefined,'Catalog description');
  const uploaded=writes[0],metadata=writes[1];
  assert.equal(dimensions.at(-1),width);
  assert.equal(uploaded.f.size,1000);
  assert.notEqual(uploaded.f,original);
  assert.equal(metadata.alt_text,'Catalog description');
  assert.equal(metadata.file_size,uploaded.f.size);
  assert.equal(metadata.mime_type,uploaded.f.type);
  assert.equal(metadata.file_name,uploaded.f.name);
  assert.equal(metadata.organization_id,'org');
 }
});
