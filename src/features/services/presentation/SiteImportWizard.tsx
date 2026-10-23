import { useMemo, useState } from "react";
import { Check, ChevronDown, ExternalLink, FileSearch, Globe2, Loader2, Package, Search, ShieldAlert, Wrench, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getArtVideoOrganizationId } from "@/lib/organization-identity";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import { saveServiceAggregate, setServicePublication } from "../infrastructure/services.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { ImageUpload } from "@/shared/ui/admin/AdminMedia";

type ContentType = "service" | "product" | "page";
type Destination = "short_description" | "description" | "inclusions" | "exclusions" | "faqs" | "variants" | "sections" | "orientations" | "terms" | "price" | "unmapped" | "ignore";
type DataBlock = {
  id: string; heading: string; text: string;
  suggestedTarget: Destination; confidence: "high" | "medium" | "low"; origin: "html" | "schema" | "manual"; sourceUrl?: string;
};
type ReviewBlock = DataBlock & { target: Destination };
type SourceItem = {
  id: string; type: ContentType; title: string; summary: string; category: string; sourceUrl: string;
  blocks?: DataBlock[]; faqs?: { question: string; answer: string }[];
  price?: number | null; imageUrl?: string | null; relatedUrls?: string[];
};
type ReviewItem = Omit<SourceItem, "blocks"> & {
  selected: boolean; type: ContentType; blocks: ReviewBlock[]; categoryId: string;
  categoryStrategy: "none" | "existing" | "new"; newCategory: string;
  mediaId: string; action: "create" | "merge";
};
type ResponsePayload = { items?: SourceItem[]; pagesVisited?: number; blocked?: number; warnings?: string[]; error?: string };
type ImportStats = { created: number; updated: number; skipped: number; failed: number };
const fieldNames: Record<Destination, string> = {
  short_description: "Descrição curta", description: "Descrição completa", inclusions: "Incluso",
  exclusions: "Não incluso", faqs: "Perguntas frequentes", variants: "Variações",
  sections: "Seções / informações técnicas", orientations: "Orientações (cards e modais)", terms: "Condições do serviço", price: "Preço base", unmapped: "Definir destino", ignore: "Ignorar",
};
const cleanName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const input = "w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10";
const productDestinations: Destination[] = ["unmapped", "short_description", "description", "price", "ignore"];
const serviceDestinations: Destination[] = ["unmapped", "short_description", "description", "inclusions", "exclusions", "faqs", "variants", "sections", "orientations", "terms", "price", "ignore"];
const supported = (type: ContentType, target: Destination) => type === "product" && !productDestinations.includes(target) ? "unmapped" : target;
const isService = (type: ContentType) => type !== "product";
function numberFrom(text: string): number | null {
  const sanitized = text.replace(/[^0-9,.]/g, "").trim();
  if (!sanitized) return null;
  const lastComma = sanitized.lastIndexOf(","), lastDot = sanitized.lastIndexOf(".");
  let normalized = sanitized;
  if (lastComma > lastDot) normalized = sanitized.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastComma >= 0) normalized = sanitized.replace(/,/g, "");
  else if (lastComma >= 0) normalized = sanitized.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(sanitized)) normalized = sanitized.replace(/\./g, "");
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const itemLink = (item: ReviewItem) => item.sourceUrl;
const chooseBlocks = (item: ReviewItem, target: Destination) => item.blocks.filter(b => b.target === target && b.text.trim());
function payloadFor(item: ReviewItem) {
  const description = chooseBlocks(item, "description").map(b => b.heading === "Resumo da página" ? b.text : b.heading + "\n" + b.text).join("\n\n").slice(0, 10000);
  const short = chooseBlocks(item, "short_description").map(b => b.text).join(" ").slice(0, 300);
  const sections = chooseBlocks(item, "sections").filter(b => b.heading.trim() && b.text.trim()).map(b => ({ title: b.heading.trim(), content: b.text.trim() }));
  const faqSeen = new Set<string>();
  const faqs = chooseBlocks(item, "faqs").filter(b => {
    const key = cleanName(b.heading);
    if (!key || !b.text.trim() || faqSeen.has(key)) return false;
    faqSeen.add(key); return true;
  }).map(b => ({ question: b.heading.trim(), answer: b.text.trim() }));
  const variants = chooseBlocks(item, "variants").map(b => ({ title: b.text.slice(0, 180), description: b.heading || "", price: "" }));
  const inclusions = chooseBlocks(item, "inclusions").map(b => b.text);
  const exclusions = chooseBlocks(item, "exclusions").map(b => b.text);
  const priceBlock = chooseBlocks(item, "price")[0];
  const price = priceBlock ? numberFrom(priceBlock.text) : null;
  const guidanceSeen = new Set<string>();
  const orientations = chooseBlocks(item, "orientations").filter(b => {
    const key = cleanName(b.heading);
    if (!key || !b.text.trim() || guidanceSeen.has(key)) return false;
    guidanceSeen.add(key); return true;
  }).map(b => ({ title: b.heading.trim(), content: b.text.trim() }));
  const terms = chooseBlocks(item, "terms").map(b => b.text).join("\n\n");
  return { description, short, sections, faqs, variants, inclusions, exclusions, price, orientations, terms };
}
function currentMatch(existing: any, block: ReviewBlock): string {
  if (!existing || block.target === "ignore" || block.target === "unmapped") return "";
  if (block.target === "short_description" && existing.short_description) return "Já preenchido na Artvideo (será preservado)";
  if (block.target === "description" && existing.description) return "Já preenchido na Artvideo (será preservado)";
  if (block.target === "price" && (existing.base_price != null || existing.price != null)) return "Preço já cadastrado (será preservado)";
  const linked: Record<string, [string, string]> = {
    inclusions: ["service_inclusions", "description"], exclusions: ["service_exclusions", "description"],
    faqs: ["service_faqs", "question"], variants: ["service_variants", "title"], sections: ["service_sections", "content"],
  };
  const field = linked[block.target];
  if (field && Array.isArray(existing[field[0]]) &&
    existing[field[0]].some((row: Record<string, unknown>) => cleanName(String(row[field[1]] || "")) === cleanName(block.target === "faqs" ? block.heading : block.text)))
    return "Informação já cadastrada (não será duplicada)";
  return "Informação nova para este campo";
}

export function SiteImportWizard({ onClose, onImported, services, products, categories }: {
  onClose: () => void; onImported: () => void; services: any[]; products: any[]; categories: any[];
}) {
  const { user, hasPermission } = useAuth();
  const canService = hasPermission("services.create");
  const canProduct = hasPermission("products.create") || hasPermission("inventory.create");
  const canServiceCategory = hasPermission("categories.create");
  const canProductCategory = hasPermission("inventory.categories.manage") || hasPermission("categories.create");
  const [url, setUrl] = useState("");
  const [artvideoOrganizationId, setArtvideoOrganizationId] = useState<string | null>(null);
  const [maxPages, setMaxPages] = useState(16);
  const [types, setTypes] = useState({ service: true, product: true, page: false });
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [opened, setOpened] = useState<string | null>(null);
  const [productCategories, setProductCategories] = useState<{ id: string; name: string }[]>([]);
  const [scanInfo, setScanInfo] = useState<{ pages: number; blocked: number; warnings: string[] } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishAfterImport, setPublishAfterImport] = useState(false);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [error, setError] = useState("");
  const existingService = useMemo(() => new Map(services.map(s => [cleanName(s.title || ""), s])), [services]);
  const existingProduct = useMemo(() => new Map(products.map(p => [cleanName(p.name || ""), p])), [products]);
  const selected = items.filter(item => item.selected);
  const unresolved = selected.flatMap(item => item.blocks.filter(b => b.target === "unmapped").map(b => item.title + ": " + b.heading));
  const incomplete = selected.flatMap(item => item.blocks.filter(b =>
    ["faqs", "sections", "orientations"].includes(b.target) && (!b.heading.trim() || !b.text.trim())
  ).map(b => item.title + ": " + (b.heading || fieldNames[b.target])));
  const getExisting = (item: ReviewItem) => item.type === "product" ? existingProduct.get(cleanName(item.title)) : existingService.get(cleanName(item.title));
  const allowed = (item: ReviewItem) => isService(item.type) ? canService : canProduct;
  const categoryOptions = (item: ReviewItem) => item.type === "product" ? productCategories : categories;
  const categoryAllowed = (item: ReviewItem) => item.type === "product" ? canProductCategory : canServiceCategory;
  function update(id: string, changes: Partial<ReviewItem>) {
    setItems(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
  }
  function updateBlock(id: string, blockId: string, changes: Partial<ReviewBlock>) {
    setItems(current => current.map(item => item.id === id ? {
      ...item, blocks: item.blocks.map(block => block.id === blockId ? { ...block, ...changes } : block),
    } : item));
  }
  function addManualBlock(id: string, target: "faqs" | "sections" | "orientations") {
    setItems(current => current.map(item => item.id === id ? {
      ...item, blocks: [...item.blocks, {
        id: "manual-" + Date.now() + "-" + Math.random().toString(36).slice(2),
        heading: "", text: "", suggestedTarget: target, target,
        origin: "manual" as const, confidence: "high" as const,
      }],
    } : item));
  }
  function removeBlock(id: string, blockId: string) {
    setItems(current => current.map(item => item.id === id ? {
      ...item, blocks: item.blocks.filter(block => block.id !== blockId),
    } : item));
  }
  async function scan() {
    setError("");
    if (!Object.values(types).some(Boolean)) { setError("Escolha pelo menos um tipo de conteúdo."); return; }
    try {
      const u = new URL(url.trim());
      if (!["https:", "http:"].includes(u.protocol)) throw Error("Endereço inválido.");
    } catch { setError("Insira o endereço completo do site, como https://www.exemplo.com.br/servicos."); return; }
    setScanning(true); setStats(null); setItems([]); setScanInfo(null); setOpened(null);
    try {
      const organizationId = await getArtVideoOrganizationId();
      setArtvideoOrganizationId(organizationId);
      const { data: categoryData } = await supabase.from("product_categories").select("id,name").eq("organization_id", organizationId).order("name");
      setProductCategories(categoryData || []);
      const { data, error: requestError } = await supabase.functions.invoke<ResponsePayload>("site-catalog-discovery", {
        body: { url: url.trim(), organizationId, maxPages, types: Object.entries(types).filter(([, checked]) => checked).map(([key]) => key) },
      });
      if (requestError || data?.error) {
        let detail = data?.error || requestError?.message || "Não foi possível analisar o site.";
        if (requestError && "context" in requestError && requestError.context instanceof Response) {
          try { const payload = await requestError.context.clone().json(); detail = payload?.error || detail; } catch { /* Unexpected server response */ }
        }
        throw Error(detail);
      }
      const found = new Set<string>();
      const parsed = (data?.items || []).filter(item => {
        if (!item.sourceUrl || !item.title || found.has(item.sourceUrl)) return false;
        found.add(item.sourceUrl); return true;
      }).map(item => {
        const blocks: DataBlock[] = item.blocks?.length ? [...item.blocks] : [
          ...(item.summary ? [{ id: "summary", heading: "Resumo da página", text: item.summary, suggestedTarget: "short_description" as Destination, confidence: "high" as const, origin: "html" as const }] : []),
        ];
        // Include structured FAQ questions even when HTML already contributed other blocks.
        const knownQuestions = new Set(blocks.filter(b => b.suggestedTarget === "faqs").map(b => cleanName(b.heading)));
        (item.faqs || []).forEach((faq, index) => {
          if (!faq.question || !faq.answer || knownQuestions.has(cleanName(faq.question))) return;
          blocks.push({ id: "faq-fallback-" + index, heading: faq.question, text: faq.answer,
            suggestedTarget: "faqs", confidence: "high", origin: "schema" });
          knownQuestions.add(cleanName(faq.question));
        });
        return {
          ...item, selected: false, categoryId: "", categoryStrategy: "none" as const, newCategory: item.category || "",
          action: "create" as const, mediaId: "",
          blocks: blocks.map(block => ({ ...block, target: supported(item.type, block.suggestedTarget) })),
        };
      });
      setItems(parsed);
      setScanInfo({ pages: data?.pagesVisited || 0, blocked: data?.blocked || 0, warnings: data?.warnings || [] });
    } catch (cause) { setError(systemErrorMessage(cause, "Não foi possível analisar o endereço.")); }
    finally { setScanning(false); }
  }
  function selectAll(checked: boolean) {
    setItems(current => current.map(item => ({ ...item, selected: checked && (isService(item.type) ? canService : canProduct) && !getExisting(item) })));
    if (checked && !opened) setOpened(items.find(item => allowed(item) && !getExisting(item))?.id || null);
  }
  async function resolveCategory(item: ReviewItem, organizationId: string, categoryCache: Map<string, string>) {
    if (item.categoryStrategy === "none") return null;
    if (item.categoryStrategy === "existing") return item.categoryId || null;
    if (!categoryAllowed(item)) throw Error("Sem permissão para criar categorias.");
    const name = item.newCategory.trim().slice(0, 110);
    if (!name) throw Error("Informe o nome da nova categoria.");
    const table = isService(item.type) ? "service_categories" : "product_categories";
    const key = table + ":" + cleanName(name);
    if (categoryCache.has(key)) return categoryCache.get(key)!;
    const { data: found, error: findError } = await supabase.from(table).select("id,name").eq("organization_id", organizationId);
    if (findError) throw findError;
    const existing = (found || []).find(cat => cleanName(cat.name) === cleanName(name));
    if (existing?.id) { categoryCache.set(key, existing.id); return existing.id; }
    const slug = await generateUniqueSlug(table, name);
    const { data, error: insertError } = await supabase.from(table).insert({
      organization_id: organizationId, name, slug, is_active: true, sort_order: 0,
    }).select("id").single();
    if (insertError) throw insertError;
    categoryCache.set(key, data.id);
    return data.id as string;
  }
  async function importOne(item: ReviewItem, organizationId: string, categoryCache: Map<string, string>, taken: Set<string>) {
    if (!allowed(item)) throw Error("Sem permissão para cadastrar este item.");
    const title = item.title.trim().slice(0, 150);
    if (!title) throw Error("O item está sem nome.");
    const result = payloadFor(item);
    const categoryId = await resolveCategory(item, organizationId, categoryCache);
    const previous = getExisting(item);
    if (previous && item.action !== "merge") throw Error("Já existe um cadastro com esse nome. Selecione complementar existente.");
    if (previous && !hasPermission(isService(item.type) ? "services.update" : "products.update") &&
      !(item.type === "product" && hasPermission("inventory.update"))) throw Error("Você não possui permissão para complementar este cadastro.");
    if (!previous && taken.has((isService(item.type) ? "service" : "product") + ":" + cleanName(title))) throw Error("Nome duplicado dentro desta seleção.");
    if (item.type === "product") {
      if (previous) {
        const { data: actual, error: fetchError } = await supabase.from("products").select("id,short_description,description,price,category_id,cover_media_id,is_active,show_in_catalog").eq("organization_id", organizationId).eq("id", previous.id).single();
        if (fetchError) throw fetchError;
        if (actual.is_active && actual.show_in_catalog) throw Error("Este item já está publicado. Oculte-o do site antes de complementar para não publicar alterações sem revisão.");
        const changes: Record<string, unknown> = {};
        if (!actual.short_description && result.short) changes.short_description = result.short;
        if (!actual.description && result.description) changes.description = result.description;
        if (actual.price == null && result.price !== null) changes.price = result.price;
        if (!actual.category_id && categoryId) changes.category_id = categoryId;
        if (!actual.cover_media_id && item.mediaId) changes.cover_media_id = item.mediaId;
        if (Object.keys(changes).length) {
          const { error: saveError } = await supabase.from("products").update(changes).eq("organization_id", organizationId).eq("id", actual.id);
          if (saveError) throw saveError;
        }
        if (publishAfterImport) {
          const { error: publishError } = await supabase.from("products")
            .update({ is_active: true, show_in_catalog: true }).eq("organization_id", organizationId).eq("id", actual.id);
          if (publishError) throw publishError;
        }
      } else {
        const slug = await generateUniqueSlug("products", title);
        const { error: saveError } = await supabase.from("products").insert({
          organization_id: organizationId, created_by: user?.id, name: title, slug,
          short_description: result.short || null, description: result.description || null,
          price: result.price, category_id: categoryId, cover_media_id: item.mediaId || null,
          is_active: publishAfterImport, show_in_catalog: publishAfterImport, is_featured: false,
        });
        if (saveError) throw saveError;
      }
    } else {
      if (previous) {
        const { data: actual, error: fetchError } = await supabase.from("services")
          .select("id,public_booking,short_description,description,base_price,price_mode,category_id,cover_media_id,is_active,show_in_catalog,service_inclusions(description),service_exclusions(description),service_variants(title,description,price),service_sections(title,content),service_faqs(question,answer)")
          .eq("organization_id", organizationId).eq("id", previous.id).single();
        if (fetchError) throw fetchError;
        if (actual.is_active && actual.show_in_catalog) throw Error("Este item já está publicado. Oculte-o do site antes de complementar para não publicar alterações sem revisão.");
        const changes: Record<string, unknown> = {};
        if (!actual.short_description && result.short) changes.short_description = result.short;
        if (!actual.description && result.description) changes.description = result.description;
        if (result.orientations.length || result.terms) {
          const config = actual.public_booking || {};
          const current = Array.isArray(config.orientations) ? config.orientations : [];
          const incoming = result.orientations.filter(o => !current.some((r:any) => cleanName(r.title + r.content) === cleanName(o.title + o.content)));
          changes.public_booking = {...config, orientations:[...current,...incoming], terms:config.terms || result.terms};
        }
        if (actual.base_price == null && result.price !== null) Object.assign(changes, { base_price: result.price, price_mode: "FIXED" });
        if (!actual.category_id && categoryId) changes.category_id = categoryId;
        if (!actual.cover_media_id && item.mediaId) changes.cover_media_id = item.mediaId;
        // Append only new rows. Rewriting all relations would destroy IDs, icons and linked sections of existing records.
        if (Object.keys(changes).length) {
          const { error: scalarError } = await supabase.from("services").update(changes).eq("organization_id", organizationId).eq("id", actual.id);
          if (scalarError) throw scalarError;
        }
        const additions = <T,>(existing: T[], incoming: T[], identity: (entry: T) => string) => {
          const seen = new Set(existing.map(entry => cleanName(identity(entry))));
          return incoming.filter(entry => {
            const key = cleanName(identity(entry));
            if (!key || seen.has(key)) return false;
            seen.add(key); return true;
          });
        };
        const insertExtra = async (table: string, rows: Record<string, unknown>[]) => {
          if (!rows.length) return;
          const { error: insertError } = await supabase.from(table).insert(rows.map((row, index) => ({
            ...row, organization_id: organizationId, service_id: actual.id, sort_order: index + 1000,
          })));
          if (insertError) throw Error("Falha ao complementar " + table + ": " + insertError.message);
        };
        await insertExtra("service_inclusions",
          additions((actual.service_inclusions || []).map(v => v.description), result.inclusions, v => v)
            .map(description => ({ title: description.slice(0, 160), description })));
        await insertExtra("service_exclusions",
          additions((actual.service_exclusions || []).map(v => v.description), result.exclusions, v => v)
            .map(description => ({ title: description.slice(0, 160), description })));
        await insertExtra("service_faqs",
          additions((actual.service_faqs || []).map(v => ({ question: v.question || "", answer: v.answer || "" })), result.faqs, v => v.question)
            .map(row => ({ ...row, is_active: true })));
        await insertExtra("service_sections",
          additions((actual.service_sections || []).map(v => ({ title: v.title || "", content: v.content || "" })), result.sections, v => v.title + " " + v.content)
            .map(row => ({ ...row, is_active: true })));
        await insertExtra("service_variants",
          additions((actual.service_variants || []).map(v => ({ title: v.title || "", description: v.description || "", price: v.price == null ? "" : String(v.price) })), result.variants, v => v.title)
            .map(row => ({ title: row.title, description: row.description, price: row.price ? Number(row.price) : null, is_active: true })));
        if (publishAfterImport) await setServicePublication(actual.id, true);
      } else {
        const slug = await generateUniqueSlug("services", title);
        const createdServiceId = await saveServiceAggregate({
          userId: user?.id || null,
          payload: {
            title, slug, category_id: categoryId, short_description: result.short || null,
            public_booking: {...(result.orientations.length ? {orientations:result.orientations} : {}), ...(result.terms ? {terms:result.terms} : {})},
            description: result.description || null, base_price: result.price, price_mode: result.price !== null ? "FIXED" : "QUOTE",
            is_active: false, show_in_catalog: false, is_featured: false, sort_order: 0, cover_media_id: item.mediaId || null,
          },
          variants: result.variants, inclusions: result.inclusions, exclusions: result.exclusions, priceFactors: [],
          sections: result.sections, faqs: result.faqs,
        });
        if (publishAfterImport) await setServicePublication(createdServiceId, true);
      }
    }
    taken.add((isService(item.type) ? "service" : "product") + ":" + cleanName(title));
    return previous ? "updated" : "created";
  }
  async function importSelected() {
    if (saving || !selected.length || !user?.id) return;
    if (unresolved.length) { setError("Defina o destino ou marque Ignorar em todos os trechos pendentes antes de importar."); return; }
    if (incomplete.length) { setError("Preencha título e conteúdo dos FAQs, informações técnicas e orientações ou selecione Ignorar: " + incomplete.slice(0, 5).join("; ")); return; }
    setSaving(true); setError(""); setStats(null);
    const counts: ImportStats = { created: 0, updated: 0, skipped: 0, failed: 0 };
    const failures: string[] = [];
    try {
      const organizationId = await getArtVideoOrganizationId();
      const taken = new Set<string>(), categoryCache = new Map<string, string>();
      for (const item of selected) {
        try {
          const state = await importOne(item, organizationId, categoryCache, taken);
          counts[state]++;
          update(item.id, { selected: false });
        } catch (cause) {
          counts.failed++;
          failures.push(item.title + ": " + systemErrorMessage(cause, "Erro ao salvar."));
        }
      }
      setStats(counts);
      if (failures.length) setError(failures.slice(0, 5).join("\n"));
      if (counts.created || counts.updated) onImported();
    } catch (cause) { setError(systemErrorMessage(cause, "Erro ao importar.")); }
    finally { setSaving(false); }
  }

  return <div role="dialog" aria-modal="true" aria-label="Importar de site" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 sm:p-5">
    <div className="flex h-[min(95vh,960px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div><h2 className="flex items-center gap-2 text-lg font-bold text-foreground"><Globe2 size={20} className="text-blue-500" /> Importar de site</h2>
          <p className="mt-1 text-xs text-muted-foreground">Mapeamento de campos: encontre informações, compare com a Artvideo e decida para onde cada trecho deve ir.</p></div>
        <button onClick={onClose} disabled={saving} className="rounded-lg p-2 hover:bg-muted" aria-label="Fechar"><X size={20} /></button>
      </header>
      <main className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <label htmlFor="site-import-url" className="block text-sm font-semibold">Endereço do site <span className="text-red-500">*</span></label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="site-import-url" className={input} value={url} onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void scan(); }} disabled={scanning || saving}
              placeholder="https://www.exemplo.com.br/servicos" />
            <BtnPrimary onClick={() => void scan()} loading={scanning} loadingText="Analisando..." disabled={saving || !url.trim()}><Search size={16} /> Analisar</BtnPrimary>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {(["service", "product", "page"] as const).map(key => <label key={key} className="flex items-center gap-2">
              <input type="checkbox" checked={types[key]} onChange={e => setTypes(old => ({ ...old, [key]: e.target.checked }))} />
              {key === "service" ? "Serviços" : key === "product" ? "Produtos" : "Outras páginas"}
            </label>)}
            <label className="ml-auto flex items-center gap-2 text-xs">Limite
              <select value={maxPages} onChange={e => setMaxPages(Number(e.target.value))} className="rounded-lg border border-border bg-background px-2 py-1.5">
                {[8, 16, 24].map(value => <option key={value} value={value}>{value} páginas</option>)}
              </select>
            </label>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldAlert size={15} className="mt-0.5 shrink-0" />
            São analisadas apenas páginas públicas permitidas. Os textos extraídos são rascunhos para revisão e adaptação; imagens externas não são copiadas automaticamente.</p>
        </section>

        {error && <p role="alert" className="whitespace-pre-line rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {scanInfo && <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          <strong>{scanInfo.pages} páginas visitadas</strong> · {items.length} itens encontrados · {scanInfo.blocked} ignoradas
          {scanInfo.warnings.map((warning, i) => <p key={i} className="mt-1 text-xs text-muted-foreground">{warning}</p>)}
        </div>}
        {stats && <div role="status" className="rounded-xl border border-blue-500/25 bg-blue-500/5 px-4 py-3 text-sm">
          {stats.created} criados · {stats.updated} complementados · {stats.skipped} ignorados · {stats.failed} erros. {publishAfterImport ? "Publicação solicitada para os itens concluídos." : "Itens novos foram salvos como rascunho (fora do site)."}
        </div>}
        {scanning && <div className="flex min-h-36 items-center justify-center gap-3 text-sm text-muted-foreground"><Loader2 size={22} className="animate-spin" /> Analisando seções, listas e perguntas frequentes...</div>}
        {!scanning && scanInfo && !items.length && <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Não encontramos dados suficientes neste endereço. Experimente a página exata de um serviço.</p>}

        {!scanning && items.length > 0 && <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="font-semibold">Revisão do catálogo</h3><p className="text-xs text-muted-foreground">Comparação entre os dados encontrados e os campos disponíveis na Union.</p></div>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" onChange={e => selectAll(e.target.checked)}
              checked={selected.length > 0 && selected.length === items.filter(i => allowed(i) && !getExisting(i)).length} /> Selecionar novos</label>
          </div>
          {items.map(item => {
            const existing = getExisting(item);
            const isOpen = opened === item.id;
            const pending = item.blocks.filter(block => block.target === "unmapped").length;
            const mapped = item.blocks.filter(block => block.target !== "ignore" && block.target !== "unmapped").length;
            return <article key={item.id} className={"overflow-hidden rounded-xl border " + (item.selected ? "border-blue-500/45 bg-blue-500/[0.035]" : "border-border bg-card")}>
              <div className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" checked={item.selected} disabled={!allowed(item) || saving} aria-label={"Selecionar " + item.title}
                  onChange={e => { update(item.id, { selected: e.target.checked }); if (e.target.checked) setOpened(item.id); }} />
                <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpened(isOpen ? null : item.id)}>
                  {item.type === "product" ? <Package size={17} className="shrink-0 text-muted-foreground" /> : item.type === "page" ? <FileSearch size={17} className="shrink-0 text-muted-foreground" /> : <Wrench size={17} className="shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span>
                    <span className="block text-xs text-muted-foreground">{mapped} correspondências · {pending} pendentes {item.relatedUrls?.length ? "· " + item.relatedUrls.length + " subpáginas vinculadas" : ""} {existing ? "· Já existe na Artvideo" : ""}</span>
                  </span>
                  <ChevronDown size={17} className={isOpen ? "rotate-180" : ""} />
                </button>
              </div>
              {isOpen && <div className="space-y-4 border-t border-border px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-medium">Nome na Artvideo
                    <input className={input} value={item.title} disabled={saving} onChange={e => update(item.id, { title: e.target.value })} /></label>
                  <label className="space-y-1 text-xs font-medium">Cadastrar como
                    <select className={input} value={item.type} disabled={saving} onChange={e => {
                      const type = e.target.value as ContentType;
                      update(item.id, { type, categoryId: "", categoryStrategy: "none", blocks: item.blocks.map(b => ({ ...b, target: supported(type, b.suggestedTarget) })) });
                    }}>
                      <option value="service">Serviço</option><option value="product">Produto</option><option value="page">Serviço (a partir de página)</option>
                    </select></label>
                </div>
                {existing && <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-3 text-sm">
                  <strong>Cadastro semelhante encontrado.</strong> Compare antes de complementar. Campos existentes não são substituídos.
                  {existing.is_active && existing.show_in_catalog && <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">Este cadastro já está publicado. Oculte-o do site antes de importar alterações, para evitar atualização pública imediata.</p>}
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs">
                    <p><span className="font-semibold">Artvideo:</span> {String(existing.short_description || existing.description || "Sem descrição")}</p>
                    <p><span className="font-semibold">Site de origem:</span> {item.summary || "Sem resumo"}</p>
                  </div>
                  <label className="mt-3 block text-xs font-semibold">Ação para esta correspondência
                    <select className={input + " mt-1"} value={item.action} onChange={e => update(item.id, { action: e.target.value as "create" | "merge" })}>
                      <option value="create">Não atualizar (ignorar duplicata)</option>
                      <option value="merge">Complementar cadastro existente, preservando seus dados</option>
                    </select>
                  </label>
                </div>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-medium">Categoria no catálogo
                    <select className={input} value={item.categoryStrategy} disabled={saving} onChange={e => update(item.id, { categoryStrategy: e.target.value as ReviewItem["categoryStrategy"] })}>
                      <option value="none">Definir depois</option><option value="existing">Selecionar existente</option>
                      {categoryAllowed(item) && <option value="new">Criar nova categoria</option>}
                    </select>
                  </label>
                  {item.categoryStrategy === "existing" && <label className="space-y-1 text-xs font-medium">Categoria da Artvideo
                    <select className={input} value={item.categoryId} onChange={e => update(item.id, { categoryId: e.target.value })}>
                      <option value="">Selecionar...</option>{categoryOptions(item).map(cat => <option value={cat.id} key={cat.id}>{cat.name}</option>)}
                    </select></label>}
                  {item.categoryStrategy === "new" && <label className="space-y-1 text-xs font-medium">Nome da nova categoria
                    <input className={input} value={item.newCategory} onChange={e => update(item.id, { newCategory: e.target.value })} /></label>}
                  {item.category && <p className="self-end text-xs text-muted-foreground">Origem sugeriu: {item.category}</p>}
                </div>
                {(item.imageUrl || item.selected) && <div className="rounded-xl border border-border p-3">
                  <div className="text-xs font-semibold">Imagem de capa</div>
                  {item.imageUrl && <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-blue-500 hover:underline"><ExternalLink size={12} /> Ver imagem de origem (referência)</a>}
                  {item.selected && <div className="mt-2"><ImageUpload bucket={isService(item.type) ? "service-images" : "product-images"} organizationId={artvideoOrganizationId} currentMediaId={item.mediaId || null}
                    onUpload={id => update(item.id, { mediaId: id })} label="Enviar imagem autorizada" /></div>}
                  <p className="mt-1 text-xs text-muted-foreground">Escolha um arquivo próprio ou que você tenha autorização para utilizar. O importador não copia a imagem do site.</p>
                </div>}
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div><p className="text-sm font-semibold">Comparação e mapeamento de informações</p>
                      <p className="text-xs text-muted-foreground">Esquerda: conteúdo da origem. Direita: destino correspondente na Union. Você pode editar antes de cadastrar.</p></div>
                    {pending > 0 && <div className="flex gap-2">
                      <button className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted" onClick={() => update(item.id, { blocks: item.blocks.map(b => b.target === "unmapped" ? { ...b, target: isService(item.type) ? "sections" : "description" } : b) })}>Pendentes → {isService(item.type) ? "Seções" : "Descrição"}</button>
                      <button className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted" onClick={() => update(item.id, { blocks: item.blocks.map(b => b.target === "unmapped" ? { ...b, target: "ignore" } : b) })}>Ignorar pendentes</button>
                    </div>}
                  </div>
                  <div className="space-y-2">
                    {!item.blocks.length && <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">Nenhum bloco detalhado pôde ser identificado nesta página.</p>}
                    {item.blocks.map(block => <div className="grid items-start gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-[minmax(0,1fr)_220px]" key={block.id}>
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold">Origem: {block.origin === "schema" ? "Dados estruturados" : block.origin === "manual" ? "Adicionado manualmente" : "Página"}</span>
                          <span className="text-muted-foreground">Sugestão: {fieldNames[block.suggestedTarget]}</span>
                          <span className="text-muted-foreground">· Confiança {block.confidence === "high" ? "alta" : block.confidence === "medium" ? "média" : "baixa"}</span>
                          {block.sourceUrl && block.sourceUrl !== item.sourceUrl && <a href={block.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Ver subpágina</a>}
                        </div>
                        <input aria-label={block.target === "faqs" ? "Pergunta" : "Título"} placeholder={block.target === "faqs" ? "Pergunta frequente" : block.target === "orientations" ? "Título do card Saiba mais" : "Título da informação"} className={input} value={block.heading} disabled={saving} onChange={e => updateBlock(item.id, block.id, { heading: e.target.value })} />
                        <textarea aria-label={block.target === "faqs" ? "Resposta" : "Conteúdo"} placeholder={block.target === "faqs" ? "Resposta para o cliente" : block.target === "orientations" ? "Texto completo do modal Saiba mais" : "Conteúdo da informação técnica"} className={input + " min-h-20 resize-y"} rows={3} value={block.text} disabled={saving} onChange={e => updateBlock(item.id, block.id, { text: e.target.value })} />
                        {["faqs", "orientations", "sections"].includes(block.target) && (!block.heading.trim() || !block.text.trim()) && <p className="text-xs font-medium text-amber-700">Preencha título e conteúdo, ou selecione Ignorar.</p>}
                      </div>
                      <label className="space-y-1 text-xs font-semibold">Destino na Artvideo
                        <select className={input} value={block.target} disabled={saving} onChange={e => updateBlock(item.id, block.id, { target: e.target.value as Destination })}>
                          {(item.type === "product" ? productDestinations : serviceDestinations).map(value => <option value={value} key={value}>{fieldNames[value]}</option>)}
                        </select>
                        {block.target === "unmapped" && <span className="block text-amber-600">Pendente de classificação</span>}
                        {block.target === "ignore" && <span className="block text-muted-foreground">Não será importado</span>}
                        {existing && block.target !== "ignore" && block.target !== "unmapped" && <span className="block text-xs font-normal text-muted-foreground">{currentMatch(existing, block)}</span>}
                        {block.origin === "manual" && <button type="button" disabled={saving} className="mt-2 block text-left text-xs font-medium text-red-600 hover:underline" onClick={() => removeBlock(item.id, block.id)}>Remover</button>}
                      </label>
                    </div>)}
                  </div>
                  {isService(item.type) && <div className="mt-3 flex flex-wrap gap-2">
                    <BtnSecondary onClick={() => addManualBlock(item.id, "faqs")} disabled={saving}>Adicionar pergunta e resposta</BtnSecondary>
                    <BtnSecondary onClick={() => addManualBlock(item.id, "orientations")} disabled={saving}>Adicionar orientação / Saiba mais</BtnSecondary>
                    <BtnSecondary onClick={() => addManualBlock(item.id, "sections")} disabled={saving}>Adicionar informação técnica</BtnSecondary>
                  </div>}
                  {item.blocks.some(b => b.target === "orientations" && !b.text.trim()) && <p className="mt-2 text-xs text-amber-700">O texto do modal pode carregar somente após o clique. O título foi encontrado; preencha o conteúdo antes de importar ou selecione Ignorar.</p>}
                </div>
                <a href={itemLink(item)} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-xs text-blue-500 hover:underline"><ExternalLink size={13} /> Página de origem</a>
              </div>}
            </article>;
          })}
        </section>}
      </main>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-background p-4">
        <div className="space-y-1"><p className="text-xs font-medium">{selected.length} selecionados · {unresolved.length} trechos pendentes · {incomplete.length} campos incompletos</p>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
            <input type="checkbox" checked={publishAfterImport} disabled={saving} onChange={event => setPublishAfterImport(event.target.checked)} />
            Publicar no site após importar com sucesso
          </label>
          <p className="text-xs text-muted-foreground">{publishAfterImport ? "Os itens importados ficarão ativos e visíveis no catálogo." : "Padrão: salvar como rascunho para revisar antes de publicar."}</p></div>
        <div className="flex gap-2"><BtnSecondary onClick={onClose} disabled={saving}>Voltar</BtnSecondary>
          <BtnPrimary onClick={() => void importSelected()} loading={saving} loadingText="Importando..." disabled={scanning || saving || !selected.length || unresolved.length > 0 || incomplete.length > 0}>
            <Check size={16} /> Importar ({selected.length})
          </BtnPrimary></div>
      </footer>
    </div>
  </div>;
}
