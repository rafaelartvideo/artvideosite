import { supabase } from "@/lib/supabase";

type ServiceVariantInput = {
  title: string;
  description: string;
  price: string;
};

type PriceFactorInput = {
  name: string;
  description: string;
  impact: "increase" | "decrease";
  amount: string;
  unit: string;
};

type ServiceSectionInput = {
  title: string;
  content: string;
};

type ServiceFaqInput = {
  question: string;
  answer: string;
};

export type ServiceAggregateScope = {
  variants?: boolean;
  inclusions?: boolean;
  exclusions?: boolean;
  priceFactors?: boolean;
  sections?: boolean;
  faqs?: boolean;
};

type SaveServiceAggregateInput = {
  serviceId?: string;
  payload: Record<string, unknown>;
  userId: string | null;
  variants: ServiceVariantInput[];
  inclusions: string[];
  exclusions: string[];
  priceFactors: PriceFactorInput[];
  sections: ServiceSectionInput[];
  faqs: ServiceFaqInput[];
  scope?: ServiceAggregateScope;
};

export async function loadServicesCatalog() {
  const [servicesResult, categoriesResult, brandsResult, productsResult] = await Promise.all([
    supabase.from("services").select("*, service_variants(*), service_inclusions(*), service_exclusions(*), service_price_factors(*), service_faqs(*), service_sections(*)").order("sort_order"),
    supabase.from("service_categories").select("id, name").order("sort_order"),
    supabase.from("brands").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("products").select("id, name").eq("is_active", true).order("created_at", { ascending: false }),
  ]);

  const error = servicesResult.error || categoriesResult.error || brandsResult.error || productsResult.error;
  if (error) throw error;

  return { services: servicesResult.data ?? [], categories: categoriesResult.data ?? [], brands: brandsResult.data ?? [], products: productsResult.data ?? [] };
}

export async function deleteService(serviceId: string): Promise<void> {
  const { error } = await supabase.from("services").delete().eq("id", serviceId);
  if (error) throw error;
}

export async function setServiceActive(serviceId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from("services").update({ is_active: isActive }).eq("id", serviceId);
  if (error) throw error;
}

async function replaceServiceRows(table: string, serviceId: string, rows: Record<string, unknown>[], relationName: string): Promise<void> {
  const { error: deleteError } = await supabase.from(table).delete().eq("service_id", serviceId);
  if (deleteError) throw new Error(`Erro ao remover ${relationName}: ${deleteError.message}`);
  if (rows.length === 0) return;
  const { error: insertError } = await supabase.from(table).insert(rows);
  if (insertError) throw new Error(`Erro ao salvar ${relationName}: ${insertError.message}`);
}

export async function saveServiceAggregate({ serviceId: existingServiceId, payload, userId, variants, inclusions, exclusions, priceFactors, sections, faqs, scope }: SaveServiceAggregateInput): Promise<string> {
  let serviceId = existingServiceId;
  const shouldReplace = (key: keyof ServiceAggregateScope) => scope?.[key] !== false;

  if (serviceId) {
    if (Object.keys(payload).length > 0) {
      const { error } = await supabase.from("services").update(payload).eq("id", serviceId);
      if (error) throw new Error(`Erro ao atualizar serviço: ${error.message}`);
    }
  } else {
    const { data, error } = await supabase.from("services").insert({ ...payload, created_by: userId }).select("id").single();
    if (error) throw new Error(`Erro ao criar serviço: ${error.message}`);
    serviceId = data?.id;
  }

  if (!serviceId) throw new Error("ID do serviço não obtido.");

  if (shouldReplace("variants")) await replaceServiceRows("service_variants", serviceId, variants.map((variant, sortOrder) => ({ service_id: serviceId, title: variant.title, description: variant.description || null, price: variant.price ? Number(variant.price) : null, icon: null, is_active: true, sort_order: sortOrder })), "variantes antigas");
  if (shouldReplace("inclusions")) await replaceServiceRows("service_inclusions", serviceId, inclusions.filter(Boolean).map((description, sortOrder) => ({ service_id: serviceId, description, sort_order: sortOrder })), "inclusões");
  if (shouldReplace("exclusions")) await replaceServiceRows("service_exclusions", serviceId, exclusions.filter(Boolean).map((description, sortOrder) => ({ service_id: serviceId, description, sort_order: sortOrder })), "exclusões");
  if (shouldReplace("priceFactors")) await replaceServiceRows("service_price_factors", serviceId, priceFactors.filter(factor => factor.name.trim()).map((factor, sortOrder) => ({ service_id: serviceId, name: factor.name.trim(), description: factor.description || null, impact: factor.impact, amount: Number(factor.amount) || 0, unit: factor.unit || null, sort_order: sortOrder })), "fatores");
  if (shouldReplace("sections")) await replaceServiceRows("service_sections", serviceId, sections.filter(section => section.title.trim() && section.content.trim()).map((section, sortOrder) => ({ service_id: serviceId, title: section.title.trim(), content: section.content.trim(), sort_order: sortOrder })), "seções");
  if (shouldReplace("faqs")) await replaceServiceRows("service_faqs", serviceId, faqs.filter(faq => faq.question).map((faq, sortOrder) => ({ service_id: serviceId, question: faq.question, answer: faq.answer, section_id: null, is_active: true, sort_order: sortOrder })), "FAQs");

  return serviceId;
}
