import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
// New Storage writers require explicit review of optimization or original-byte
// integrity. This inventory is an architecture guard, not a codec verifier.
const reviewed = {
  "src/shared/infrastructure/media.repository.ts": 1,
  "src/features/finance/infrastructure/finance-documents.repository.ts": 1,
  "src/features/documents/infrastructure/document-signatures.repository.ts": 1,
  "src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx": 1,
  "src/features/technician-panel/infrastructure/technician-tasks.repository.ts": 1,
  "src/features/orders/infrastructure/order-images.repository.ts": 1,
  "src/features/orders/infrastructure/order-quote.repository.ts": 1,
  "src/features/orders/infrastructure/order-documents.repository.ts": 1,
  "src/features/management/infrastructure/management.repository.ts": 3,
  "src/features/registrations/infrastructure/employee-signatures.repository.ts": 1,
  "src/features/platform-providers/infrastructure/platform-providers.repository.ts": 1,
  "supabase/functions/product-lookup/index.ts": 1,
  "supabase/functions/document-signature-admin/main.ts": 2,
  "supabase/functions/order-mobile-edit/index.ts": 1,
  "supabase/functions/device-checklist/index.ts": 1,
  "supabase/functions/document-signature-public/final-document-service.ts": 1,
  "supabase/functions/document-signature-public/main.ts": 1,
  "supabase/functions/union-whatsapp-inbox/index.ts": 1,
  "supabase/functions/artvideo-site-quote-media/index.ts": 1,
  "supabase/functions/document-signature-pdf/main.ts": 2,
  "supabase/functions/sac-digital-api/index.ts": 1,
  "supabase/functions/sac-avatar-maintenance/index.ts": 1,
  "supabase/functions/order-mobile-checklist/index.ts": 2,
  "supabase/functions/device-capture/index.ts": 1
};
test('new direct Storage writers require an explicit upload policy review', async()=>{
 for(const base of ['src','supabase/functions']){
  const files=await readdir(base,{recursive:true});
  for(const relative of files){
   if(!/\.(ts|tsx|mjs)$/.test(relative)||relative.includes('.test.'))continue;
   const path=base+'/'+relative;
   const n=((await readFile(path,'utf8')).match(/\.upload(?:ToSignedUrl)?\(/g)||[]).length;
   assert.ok(n <= (reviewed[path]||0),`${path}: review the new Storage upload and use the central optimizer or document binary integrity`);
  }
 }
});
