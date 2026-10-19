import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Protect the crucial provider contract: locating a protocol is not sending text.
const api = await readFile(new URL('../../../../supabase/functions/sac-digital-api/index.ts', import.meta.url),'utf8');
const dialog = await readFile(new URL('../../quotes/presentation/QuoteSacDigitalDialog.tsx', import.meta.url),'utf8');

test('SAC existing conversation is only a pointer and does not dispatch text',()=>{
 const start = api.indexOf('if (action === "start_new_conversation")');
 const end = api.indexOf('if (action === "my_operator_binding")',start);
 const code=api.slice(start,end);
 assert.ok(start>=0 && end>start);
 assert.match(code,/mode: "existing"/);
 assert.match(code,/existing: true/);
 const existing=code.slice(code.indexOf('mode: "existing"')-400,code.indexOf('mode: "existing"')+190);
 assert.doesNotMatch(existing,/sendLocalSubmission|runResourceOperation\(\s*36/);
});

test('quote dialog dispatches through send_message when opening an existing chat',()=>{
 const found=dialog.indexOf('if(response.mode==="existing")');
 const newStart=dialog.indexOf('}else if(response.mode==="protocol")');
 assert.ok(found>=0 && newStart>found);
 const existing=dialog.slice(found,newStart);
 assert.match(existing,/sendSacDigitalTextMessage\(/);
 assert.match(existing,/refreshSacDigitalProtocol\(/);
 assert.match(existing,/receipt\?\.success/);
 assert.match(existing,/delivery_status/);
 assert.doesNotMatch(existing,/setAcceptedProtocol\(response\.protocol\);\s*\/\//);
});

test('quote dialog does not conflate provider acceptance with WhatsApp delivery',()=>{
 assert.match(dialog,/Envio aceito pela SAC/);
 assert.match(dialog,/não significa que o WhatsApp já entregou/);
 assert.doesNotMatch(dialog,/Mensagem confirmada pela SAC Digital/);
 assert.match(dialog,/failure\.outcome==="unknown"/);
 assert.match(dialog,/Conferir conversa/);
 assert.match(dialog,/clientRequestId|requestId\.current/);
});

test('brand-new SAC protocol is accepted without triggering a second, duplicate send',()=>{
 const start=dialog.indexOf('}else if(response.mode==="protocol")');
 const end=dialog.indexOf('}else{',start);
 assert.ok(start>=0 && end>start);
 assert.doesNotMatch(dialog.slice(start,end),/sendSacDigitalTextMessage\(/);
});
