import test from "node:test";
import assert from "node:assert/strict";
import { QUICK_REPLY_VARIABLES, renderWhatsAppQuickReply, whatsappTimeGreeting } from "./quick-reply-variables.mjs";

const at=(time)=>new Date(time);
const context={operatorName:"Rafael Ferreira",customerName:"Elmo da Costa",protocol:"ATD-000002"};

test("saudação automática respeita o relógio de São Paulo",()=>{
  assert.equal(whatsappTimeGreeting(at("2026-11-11T11:00:00Z")),"Bom dia");
  assert.equal(whatsappTimeGreeting(at("2026-11-11T17:00:00Z")),"Boa tarde");
  assert.equal(whatsappTimeGreeting(at("2026-11-11T23:00:00Z")),"Boa noite");
});

test("variáveis de mensagem rápida são renderizadas usando a conversa atual",()=>{
  const result=renderWhatsAppQuickReply(
    "{horario}! Sou {operador} ({operador_completo}). Tudo bem, {cliente}? Protocolo: {protocolo}.",context,
    at("2026-11-11T17:15:00Z"),
  );
  assert.equal(result,"Boa tarde! Sou Rafael (Rafael Ferreira). Tudo bem, Elmo da Costa? Protocolo: ATD-000002.");
  assert.equal(renderWhatsAppQuickReply("{saudacao} às {hora}, em {data}",context,at("2026-11-11T17:15:00Z")),
    "Boa tarde às 14:15, em 11/11/2026");
});

test("variáveis desconhecidas e campos não informados não inventam dados",()=>{
  assert.equal(renderWhatsAppQuickReply("Oi {cliente}, {operador}! {desconhecido}",{}),
    "Oi {cliente}, {operador}! {desconhecido}");
  assert.equal(renderWhatsAppQuickReply("{ OPERADOR }",{operatorName:"Rafael Souza"}),"Rafael");
  assert.ok(QUICK_REPLY_VARIABLES.some(item=>item.token==="{horario}"));
});
