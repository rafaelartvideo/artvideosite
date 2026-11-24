import { supabase } from "@/lib/supabase";

export type WarrantyCertificateTemplate = {
  title: string;
  brand_subtitle: string;
  footer_slogan: string;
  legal_notice: string;
  coverage: string;
  exclusions: string;
  warranty_rows: string;
  technician_label: string;
  client_label: string;
  section_services: string;
  section_products: string;
  section_coverage: string;
  section_exclusions: string;
  show_seal: boolean;
  show_signatures: boolean;
};

export const DEFAULT_WARRANTY_CERTIFICATE_TEMPLATE: WarrantyCertificateTemplate = {
  title: "CERTIFICADO DE GARANTIA",
  brand_subtitle: "ASSISTÊNCIA TÉCNICA ESPECIALIZADA",
  footer_slogan: "",
  legal_notice: "Documento não fiscal. Este certificado não exclui, restringe nem substitui os direitos e garantias legais aplicáveis.",
  coverage: "Cobre falhas relacionadas ao serviço executado e às peças discriminadas na OS, quando aplicável.\nA cobertura contratual refere-se ao reparo realizado, em condições normais de uso.\nO atendimento em garantia poderá solicitar a identificação da OS vinculada.",
  exclusions: "Danos novos por mau uso, quedas, umidade, oxidação, surtos elétricos ou desgaste natural não relacionados ao reparo não integram a cobertura contratual.\nIntervenções externas serão avaliadas quanto à relação com a falha reclamada.\nA cobertura refere-se ao serviço executado e não implica necessariamente a substituição integral do equipamento.\nPermanecem preservadas a garantia legal e as demais disposições do Código de Defesa do Consumidor.",
  warranty_rows: "Peças substituídas discriminadas na OS | Conforme garantia aplicável às peças e direitos legais\nGarantia adicional | Quando prevista expressamente na OS",
  technician_label: "Responsável técnico",
  client_label: "Assinatura do cliente",
  section_services: "SERVIÇOS",
  section_products: "PRODUTOS",
  section_coverage: "COBERTURA DA GARANTIA",
  section_exclusions: "CONDIÇÕES E EXCLUSÕES",
  show_seal: true,
  show_signatures: true,
};

export async function loadWarrantyCertificateTemplate(organizationId: string): Promise<WarrantyCertificateTemplate> {
  const { data, error } = await supabase.from("warranty_certificate_templates")
    .select("config").eq("organization_id", organizationId).maybeSingle();
  if (error) throw error;
  const config = data?.config && typeof data.config === "object" && !Array.isArray(data.config)
    ? data.config as Partial<WarrantyCertificateTemplate> : {};
  const resolved = { ...DEFAULT_WARRANTY_CERTIFICATE_TEMPLATE, ...config };
  // Também esconde o slogan padrão caso tenha sido salvo no modelo antigo.
  if (/^Seu equipamento em boas mãos\.?$/i.test(String(resolved.footer_slogan || "").trim())) {
    resolved.footer_slogan = "";
  }
  return resolved;
}

export async function saveWarrantyCertificateTemplate(organizationId: string, config: WarrantyCertificateTemplate) {
  const { error } = await supabase.from("warranty_certificate_templates").upsert({
    organization_id: organizationId, config, updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id" });
  if (error) throw error;
}

export type CertificateOrderItem = {
  name: string;
  description: string;
  quantity: number;
  inventoryId: string | null;
  amount: number | null;
};

export async function loadWarrantyCertificateOrderItems(organizationId: string, serviceOrderId: string) {
  const [commercial, used, order] = await Promise.all([
    supabase.from("service_order_items")
      .select("item_type,title_snapshot,description_snapshot,quantity,inventory_item_id,subtotal")
      .eq("organization_id", organizationId).eq("service_order_id", serviceOrderId).order("created_at"),
    supabase.from("service_order_used_items")
      .select("inventory_item_id,quantity,inventory_item:inventory_items(name,unit)")
      .eq("organization_id", organizationId).eq("service_order_id", serviceOrderId),
    supabase.from("service_orders")
      .select("service_price,parts_total,subtotal,discount_amount,final_total,service_type:service_types(charge_customer),general_service:general_services(name),service:services(title)")
      .eq("organization_id", organizationId).eq("id", serviceOrderId).single(),
  ]);
  if (commercial.error) throw commercial.error;
  if (used.error) throw used.error;
  if (order.error) throw order.error;
  const data = order.data;
  const noCharge = (data.service_type as unknown as {charge_customer?:boolean}|null)?.charge_customer === false && Number(data.final_total) === 0;
  const financial = {service_price:data.service_price,parts_total:data.parts_total,subtotal:data.subtotal,discount_amount:data.discount_amount,final_total:data.final_total,no_charge:noCharge};
  const services: CertificateOrderItem[] = [];
  const products: CertificateOrderItem[] = [];
  for (const item of commercial.data ?? []) {
    const name = String(item.title_snapshot || "").trim();
    if (!name) continue;
    const mapped = {
      name,
      description: String(item.description_snapshot || "").trim(),
      quantity: Number(item.quantity || 1),
      inventoryId: item.inventory_item_id || null,
      amount: noCharge || item.subtotal == null ? null : Number(item.subtotal),
    };
    if (["product","produto"].includes(item.item_type)) products.push(mapped);
    if (["service","custom_service","servico"].includes(item.item_type)) services.push(mapped);
  }
  if (!services.length) {
    const general = data?.general_service as unknown as { name?: string } | null;
    const legacy = data?.service as unknown as { title?: string } | null;
    const name = String(general?.name || legacy?.title || "").trim();
    if (name) services.push({ name, description: "", quantity: 1, inventoryId: null, amount: noCharge || data.service_price == null ? null : Number(data.service_price) });
  }
  const catalogProductIds = new Set(products.map(item => item.inventoryId).filter(Boolean));
  for (const item of used.data ?? []) {
    if (item.inventory_item_id && catalogProductIds.has(item.inventory_item_id)) continue;
    const inventory = item.inventory_item as unknown as { name?: string } | null;
    if (inventory?.name) products.push({
      name: inventory.name, description: "", quantity: Number(item.quantity || 1),
      inventoryId: item.inventory_item_id || null, amount: null,
    });
  }
  return { services, products, financial };
}
