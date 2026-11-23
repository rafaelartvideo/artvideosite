import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const helper=readFileSync("src/features/whatsapp-channels/domain/whatsapp-location.ts","utf8");
const webhook=readFileSync("supabase/functions/union-whatsapp-webhook/index.ts","utf8");
const page=readFileSync("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx","utf8");

test("Localização recebida é interpretada como coordenadas com nome e endereço",async()=>{
  const built=await transformWithEsbuild(helper,"whatsapp-location.ts",{loader:"ts",format:"esm"});
  const {parseWhatsAppLocation}=await import("data:text/javascript;base64,"+Buffer.from(built.code).toString("base64"));
  const point=parseWhatsAppLocation("geo:-10.9472,-37.0731\nCondomínio Exemplo\nAracaju - SE");
  assert.equal(point.latitude,-10.9472);
  assert.equal(point.longitude,-37.0731);
  assert.equal(point.name,"Condomínio Exemplo");
  assert.equal(point.address,"Aracaju - SE");
  assert.equal(point.mapsUrl,"https://www.google.com/maps/search/?api=1&query=-10.9472%2C-37.0731");
  assert.equal(parseWhatsAppLocation("geo:0,0\n\n").latitude,0);
  assert.equal(parseWhatsAppLocation("geo:91,-37"),null);
  assert.equal(parseWhatsAppLocation("geo:-10,181"),null);
  assert.equal(parseWhatsAppLocation("geo:NaN,0"),null);
  assert.equal(parseWhatsAppLocation("javascript:alert(1)"),null);
  assert.equal(parseWhatsAppLocation(""),null);
});

test("Webhook grava coordenadas e interface não tenta recuperar localização como mídia",async()=>{
  assert.ok((await transformWithEsbuild(page,"UnionWhatsAppInboxPage.tsx",{loader:"tsx"})).code.length>100);
  assert.match(webhook,/message\.liveLocationMessage/);
  assert.match(webhook,/degreesLatitude/);
  assert.match(webhook,/degreesLongitude/);
  assert.ok(webhook.includes('const locationBody=validLocation'));
  assert.ok(webhook.includes('message_type: typeHint, body_text: typeHint==="location" ? locationBody : body'));
  assert.ok(page.includes('message.message_type === "location"'));
  assert.match(page,/Abrir no Google Maps/);
  assert.match(page,/Coordenadas não disponíveis nesta mensagem/);
});
