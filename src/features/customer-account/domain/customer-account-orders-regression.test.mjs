import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");

test("Minha Conta usa carregamento azul circular centralizado em todas as seções",()=>{
  const shared=read("src/features/customer-account/presentation/CustomerSectionLoading.tsx");
  assert.match(shared,/LoaderCircle size=\{30\}/);
  assert.match(shared,/text-\[#1032DC\]/);
  assert.match(shared,/items-center justify-center/);
  for(const path of ["CustomerAddresses.tsx","CustomerFavorites.tsx","CustomerProfile.tsx"]){
    assert.match(read("src/features/customer-account/presentation/"+path),/<CustomerSectionLoading/);
  }
});
test("a navegação da Minha Conta usa Minhas Ordens de Serviços e Assinaturas",()=>{
  const page=read("src/features/customer-account/presentation/CustomerAccountPage.tsx");
  assert.match(page,/Minhas Ordens de Serviços/);
  assert.match(page,/"signatures", "Assinaturas"/);
  assert.doesNotMatch(page,/"documents", "Documentos"/);
  assert.match(page,/<CustomerCrmHistory portal=\{portal\}/);
  assert.match(page,/<CustomerSignatures userId=\{userId\}/);
});
test("ordens de serviço aparecem em cards no mobile e tabela no desktop com situação real",()=>{
  const page=read("src/features/customer-account/presentation/CustomerCrmHistory.tsx");
  const detail=read("src/features/customer-account/presentation/CustomerOrderDetailsModal.tsx");
  assert.match(page,/<table/);
  assert.ok(page.includes("md:hidden"));
  assert.ok(page.includes("md:block"));
  assert.ok(page.includes('aria-label="Minhas ordens de serviço"'));
  assert.ok(page.includes('<th className="px-4 py-3">Equipamento</th>'));
  assert.ok(page.includes('<th className="px-4 py-3">Situação</th>'));
  assert.ok(!page.includes("Equipamento / serviço"));
  assert.ok(!page.includes(">Status</th>"));
  assert.ok(page.includes("customerOrderEquipment(item)"));
  assert.ok(page.includes("item.situation_name"));
  assert.ok(page.includes("item.situation_color"));
  assert.ok(!page.includes("item.model||item.description"));
  assert.match(page,/<CustomerOrderDetailsModal order=\{selected\}/);
  assert.match(page,/bg-red-500/);
  assert.match(page,/bg-blue-600/);
  assert.match(page,/bg-emerald-500/);
  assert.match(detail,/OrderProgress/);
  assert.match(detail,/detail\.situations/);
  assert.match(detail,/Situações da OS/);
  assert.match(detail,/createPortal/);
  assert.match(detail,/h-\[100dvh\]/);
  assert.match(detail,/equipmentFields\.map/);
  assert.match(detail,/filter\(field=>isFilled\(field\.value\)\)/);
  assert.doesNotMatch(detail,/\["Aberta", "Em atendimento"/);
  assert.match(detail,/Dados do equipamento/);
  assert.match(detail,/Produtos e serviços associados/);
  assert.match(detail,/Fotos do equipamento e da etiqueta/);
  assert.match(detail,/Documentos da OS/);
  assert.match(detail,/Baixar certificado/);
});
test("consultas privadas exigem identidade verificada e isolam dados por OS/cliente",()=>{
  const sql=read("supabase/migrations/20261028151952_artvideo_customer_orders_signatures_center.sql");
  const edge=read("supabase/functions/artvideo-customer-access/index.ts");
  assert.match(sql,/private\.artvideo_verified_portal_customer_v1\(\)/);
  assert.match(sql,/o\.customer_id=v_customer/);
  assert.match(sql,/require_external_signature=true/);
  assert.doesNotMatch(sql,/token_ciphertext.*into v_documents/);
  assert.match(edge,/if\(action==="customer_order_media"\)/);
  assert.match(edge,/if\(action==="customer_signature_link"\)/);
  assert.match(edge,/artvideo_customer_signatures_v1/);
  assert.match(edge,/decryptSignatureToken/);
  assert.match(edge,/expires_at\)\.getTime\(\)<=Date\.now\(\)/);
});
test("assinaturas pendentes, concluídas e expiradas preservam regras de validade",()=>{
  const page=read("src/features/customer-account/presentation/CustomerSignatures.tsx");
  assert.match(page,/Pendentes/);
  assert.match(page,/Concluídas/);
  assert.match(page,/Expiradas\/Canceladas/);
  assert.match(page,/Solicitar novo convite/);
  assert.match(page,/signed_document/);
  assert.match(page,/customer_signature_link/);
});

test("a consulta autenticada entrega situações vinculadas ao tipo e passagens reais, separadas do status",()=>{
  const sql=read("supabase/migrations/20261028170000_customer_order_situations_timeline.sql");
  assert.match(sql,/service_type_situations/);
  assert.match(sql,/service_order_situation_visits/);
  assert.match(sql,/current_only/);
  assert.match(sql,/'situations',v_situations/);
  assert.match(sql,/o\.customer_id=v_customer/);
  assert.match(sql,/sts\.organization_id=v_org/);
  assert.match(sql,/v\.organization_id=v_org/);
});

test("portal verificado entrega situação da OS sem confundir com status e sem nome do serviço",()=>{
  const sql=read("supabase/migrations/20261028224000_customer_account_orders_situation_equipment.sql");
  const types=read("src/features/customer-account/infrastructure/customer-account.repository.ts");
  assert.match(sql,/private\.artvideo_verified_portal_customer_v1\(\)/);
  assert.match(sql,/so\.customer_id=v_customer_id/);
  assert.match(sql,/sit\.id=so\.situation_id/);
  assert.match(sql,/sit\.color as situation_color/);
  assert.match(sql,/sit\.name/);
  assert.match(sql,/et\.name/);
  assert.match(sql,/eb\.name/);
  assert.match(sql,/em\.name/);
  assert.match(sql,/'Sem situação'/);
  assert.match(sql,/coalesce\(gs\.name,svc\.title/);
  assert.match(types,/situation_name\?: string/);
  assert.match(types,/situation_color\?: string/);
  assert.match(types,/equipment\?: string/);
});

test("assinaturas seguem tabela desktop e cards mobile com barras coloridas, sem badges de situação",()=>{
  const page=read("src/features/customer-account/presentation/CustomerSignatures.tsx");
  assert.match(page,/md:hidden/);
  assert.match(page,/md:block/);
  assert.match(page,/<table/);
  assert.match(page,/role="alert"/);
  assert.match(page,/edgeTone\[state\]/);
  assert.match(page,/bg-emerald-500/);
  assert.match(page,/bg-amber-400/);
  assert.match(page,/bg-orange-500/);
  assert.match(page,/bg-red-500/);
  assert.match(page,/bg-slate-400/);
  assert.match(page,/48 \* 60 \* 60 \* 1000/);
  assert.match(page,/Expirando/);
  assert.match(page,/Concluída/);
  assert.match(page,/Cancelada/);
  assert.match(page,/Expirada/);
  assert.match(page,/Pendente/);
  assert.match(page,/>Situação<\/th>/);
  assert.doesNotMatch(page,/statusStyle|rounded-md border px-2 py-1/);
  assert.match(page,/onClick=\{\(\)=>void openItem\(item\)\}/);
  assert.match(page,/query\.refetch\(\)/);
});

test("visão geral mostra card de assinaturas usando consulta verificada em cache",()=>{
  const page=read("src/features/customer-account/presentation/CustomerAccountPage.tsx");
  const signatures=read("src/features/customer-account/presentation/CustomerSignatures.tsx");
  const hook=read("src/features/customer-account/application/useCustomerSignatures.ts");
  assert.match(page,/useCustomerSignatures\(userId, Boolean\(portal\?\.crm_access\)\)/);
  assert.match(page, /label:"Assinaturas",count:signaturesQuery\.isPending/);
  assert.match(page,/target:"signatures"/);
  assert.match(signatures,/useCustomerSignatures\(userId\)/);
  assert.match(hook,/artvideo_customer_signatures_v1/);
  assert.match(hook,/enabled: Boolean\(userId\) && enabled/);
  assert.match(hook,/queryKey: \["artvideo-customer-signatures", userId\]/);
});

test("nota fiscal anexada no CRM aparece em documentos da OS sem misturar anexos internos",()=>{
  const sql=read("supabase/migrations/20261028230000_customer_os_invoice_documents.sql");
  const ui=read("src/features/customer-account/presentation/CustomerOrderDetailsModal.tsx");
  const types=read("src/features/customer-account/infrastructure/customer-account.repository.ts");
  assert.match(sql,/private\.artvideo_verified_portal_customer_v1\(\)/);
  assert.match(sql,/o\.id=p_order_id and o\.customer_id=v_customer and o\.organization_id=v_org/);
  assert.match(sql,/public\.service_order_situation_media sm/);
  assert.match(sql,/public\.attachment_types at/);
  assert.match(sql,/lower\(btrim\(at\.name\)\)='nota fiscal'/);
  assert.match(sql,/sm\.organization_id=v_org and sm\.service_order_id=p_order_id/);
  assert.match(sql,/'type',d\.doc_type/);
  assert.match(sql,/'invoice'::text as doc_type/);
  assert.match(sql,/'signature'::text as doc_type/);
  assert.match(sql,/not exists \(/);
  assert.doesNotMatch(sql,/jsonb_build_object\([^)]*storage_path/);
  assert.match(types,/type:"signature"\|"invoice"/);
  assert.match(ui,/doc\.type==="invoice"/);
  assert.match(ui,/Visualizar nota fiscal/);
  assert.match(ui,/Baixar nota fiscal/);
  assert.match(ui,/customer_invoice_file/);
  assert.match(ui,/Nenhum documento disponível nesta OS/);
});

test("nota fiscal só abre após validação da OS e classificação no servidor, com URL curta",()=>{
  const edge=read("supabase/functions/artvideo-customer-access/index.ts");
  const branch=edge.slice(edge.indexOf('if(action==="customer_invoice_file")'),
    edge.indexOf('if(action==="customer_signature_link")'));
  assert.match(branch,/uuid\(orderId\)\|\|!uuid\(attachmentId\)/);
  assert.match(branch,/portalAssetContext\(request,orderId\)/);
  assert.match(branch,/doc\.id===attachmentId&&doc\.type==="invoice"/);
  assert.match(branch,/service_order_situation_media/);
  assert.match(branch,/eq\("organization_id",org\)/);
  assert.match(branch,/eq\("service_order_id",orderId\)/);
  assert.match(branch,/attachment_types/);
  assert.match(branch,/nota fiscal/);
  assert.match(branch,/file\.bucket_id!=="service-images"/);
  assert.match(branch,/createSignedUrl\(file\.storage_path,120,options\)/);
  assert.match(branch,/download:name/);
  assert.doesNotMatch(branch,/getPublicUrl|storage_path:|bucket_id:|service_role/);
});
