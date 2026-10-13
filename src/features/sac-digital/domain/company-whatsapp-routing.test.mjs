import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root=new URL("../../../",import.meta.url);
const source=async(relative)=>readFile(new URL(relative,root),"utf8");

test("CRM WhatsApp checks tenant SAC status and falls back to wa.me ONLY when disabled",async()=>{
 const action=await source("features/sac-digital/presentation/CompanyWhatsAppAction.tsx");
 assert.match(action,/getSacDigitalIntegrationStatus\(targetOrganization\)/);
 assert.match(action,/if \(integration\.enabled === true\)/);
 assert.match(action,/new: "1"/);
 assert.match(action,/phone: digits/);
 assert.match(action,/adminPath\("tools", "sac-digital"\)/);
 assert.match(action,/tab\.location\.replace\(`https:\/\/wa\.me\/\$\{digits\}`\)/);
 assert.match(action,/catch \(error\) \{\s*if \(!tab\.closed\) tab\.close\(\)/);
});

test("SAC deep link prefills New Conversation without sending messages",async()=>{
 const page=await source("features/sac-digital/presentation/SacDigitalToolPage.tsx");
 assert.match(page,/const routeStartConversation = new URLSearchParams/);
 assert.match(page,/setNewConversationStarter\(\{ phone: digits, name: routeStartName\.slice\(0, 180\) \}\)/);
 assert.match(page,/setNewConversationOpen\(true\)/);
 assert.match(page,/params\.delete\("phone"\)/);
});

test("Registration details inline creation metadata and put customer file next to contacts",async()=>{
 const details=await source("features/registrations/presentation/RegistrationDetails.tsx");
 const toolbar=await source("features/registrations/presentation/RegistrationDetailsToolbar.tsx");
 assert.doesNotMatch(details,/<Section title="Cadastro">/);
 assert.match(details,/Cadastrado em <strong>/);
 assert.match(details,/onOpenCustomerHistory=\{roles\.includes\("customer"\)/);
 assert.doesNotMatch(details,/<BtnSecondary onClick=\{\(\) => onOpenCustomerHistory/);
 assert.match(toolbar,/Ficha do cliente/);
 const indexContacts=toolbar.indexOf('title="Contatos"');
 const indexCustomer=toolbar.indexOf('title="Ficha do cliente"');
 assert.ok(indexContacts>=0 && indexCustomer>indexContacts,"Customer file goes after contacts");
});

test("Customer, contacts, OS completion and partner shortcuts reuse single SAC routing action",async()=>{
 for(const path of [
  "features/customers/presentation/CustomerDetailsPage.tsx",
  "features/registrations/presentation/RegistrationContactsPage.tsx",
  "features/orders/presentation/OrderCompletionModal.tsx",
  "features/orders/presentation/OrderDetailsContent.tsx",
  "features/partner-companies/presentation/PartnerCompanyDetails.tsx",
 ]) {
  const body=await source(path);
  assert.match(body,/CompanyWhatsAppAction/,path);
 }
});
