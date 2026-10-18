import { useMemo, useState } from "react";
import { Check, ChevronLeft, ExternalLink, FileSearch, Globe2, Loader2, Package, Search, ShieldAlert, Wrench, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getArtVideoOrganizationId } from "@/lib/organization-identity";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import { saveServiceAggregate } from "../infrastructure/services.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";

type DiscoveryType = "service" | "product" | "page";
type DiscoveredItem = {
  id: string;
  type: DiscoveryType;
  title: string;
  summary: string;
  category: string;
  sourceUrl: string;
  faqs: { question: string; answer: string }[];
  price?: number | null;
  imageUrl?: string | null;
};
type EditableItem = DiscoveredItem & {
  selected: boolean;
  categoryId: string;
  includeSummary: boolean;
  includeFaq: boolean;
};
type ScanResponse = { items?: DiscoveredItem[]; pagesVisited?: number; blocked?: number; warnings?: string[]; error?: string };
const simplify = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const inputClass = "w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10";
const typeLabel: Record<DiscoveryType, string> = { service: "Serviço", product: "Produto", page: "Página" };

export function SiteImportWizard({ onClose, onImported, services, products, categories }: {
  onClose: () => void;
  onImported: () => void;
  services: any[];
  products: any[];
  categories: any[];
}) {
  const { user, hasPermission } = useAuth();
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(16);
  const [scanServices, setScanServices] = useState(true);
  const [scanProducts, setScanProducts] = useState(true);
  const [scanPages, setScanPages] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [scanInfo, setScanInfo] = useState<{ pages: number; blocked: number; warnings: string[] } | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number; failed: number } | null>(null);
  const [error, setError] = useState("");
  const canCreateService = hasPermission("services.create");
  const canCreateProduct = hasPermission("products.create") || hasPermission("inventory.create");
  const duplicates = useMemo(() => new Set([
    ...services.map(item => simplify(String(item.title || ""))),
    ...products.map(item => simplify(String(item.name || ""))),
  ]), [services, products]);
  const selected = items.filter(item => item.selected);
  const alreadyExists = (item: EditableItem) => duplicates.has(simplify(item.title));
  const setItem = (id: string, changes: Partial<EditableItem>) => setItems(current => current.map(item => item.id === id ? { ...item, ...changes } : item));

  async function scan() {
    if (!scanServices && !scanProducts && !scanPages) { setError("Selecione pelo menos um tipo de conteúdo."); return; }
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Informe um endereço HTTP ou HTTPS válido.");
    } catch { setError("Informe um endereço completo, como https://www.exemplo.com.br."); return; }
    setScanning(true); setResult(null); setScanInfo(null); setItems([]); setError("");
    try {
      const organizationId = await getArtVideoOrganizationId();
      const { data, error: scanError } = await supabase.functions.invoke<ScanResponse>("site-catalog-discovery", {
        body: { url: url.trim(), organizationId, maxPages, types: [
          ...(scanServices ? ["service"] : []),
          ...(scanProducts ? ["product"] : []),
          ...(scanPages ? ["page"] : []),
        ] },
      });
      if (scanError || data?.error) {
        let detail = data?.error || scanError?.message || "Não foi possível analisar o site.";
        if (scanError && "context" in scanError && scanError.context instanceof Response) {
          try { const payload = await scanError.context.clone().json(); detail = payload?.error || detail; } catch { /* An invalid response is shown as a generic error. */ }
        }
        throw new Error(detail);
      }
      const seen = new Set<string>();
      const cleaned = (data?.items || []).filter(item => {
        if (!item.title?.trim() || !item.sourceUrl || seen.has(item.sourceUrl)) return false;
        seen.add(item.sourceUrl);
        return true;
      });
      setItems(cleaned.map(item => ({
        ...item, selected: false, categoryId: "", includeSummary: true, includeFaq: false,
      })));
      setScanInfo({ pages: data?.pagesVisited || 0, blocked: data?.blocked || 0, warnings: data?.warnings || [] });
    } catch (cause) { setError(systemErrorMessage(cause, "Não foi possível analisar o site.")); }
    finally { setScanning(false); }
  }

  async function importSelected() {
    if (!selected.length || !user?.id) return;
    setSaving(true); setError(""); setResult(null);
    const seenNames = new Set(duplicates);
    let created = 0, skipped = 0, failed = 0;
    const organizationId = await getArtVideoOrganizationId().catch(() => "");
    if (!organizationId) { setError("Não foi possível identificar a empresa Artvideo."); setSaving(false); return; }
    for (const item of selected) {
      if (seenNames.has(simplify(item.title)) || (item.type === "product" ? !canCreateProduct : !canCreateService)) { skipped += 1; continue; }
      try {
        const title = item.title.trim().slice(0, 150);
        if (item.type === "product") {
          const slug = await generateUniqueSlug("products", title);
          const { error: insertError } = await supabase.from("products").insert({
            organization_id: organizationId, created_by: user.id, name: title, slug,
            short_description: item.includeSummary ? (item.summary || "").slice(0, 300) || null : null,
            category_id: null, is_active: false, show_in_catalog: false, is_featured: false,
          });
          if (insertError) throw insertError;
        } else {
          const slug = await generateUniqueSlug("services", title);
          await saveServiceAggregate({
            userId: user.id,
            payload: {
              title, slug, category_id: item.categoryId || null,
              short_description: item.includeSummary ? (item.summary || "").slice(0, 300) || null : null,
              price_mode: "QUOTE", base_price: null, is_active: false,
              show_in_catalog: false, is_featured: false, sort_order: 0,
            },
            variants: [], inclusions: [], exclusions: [], priceFactors: [], sections: [],
            faqs: item.includeFaq ? item.faqs.slice(0, 10) : [],
          });
        }
        seenNames.add(simplify(item.title));
        created += 1;
        setItem(item.id, { selected: false });
      } catch (cause) {
        failed += 1;
        if (!error) setError("Alguns registros não foram salvos. Verifique as permissões e tente novamente.");
      }
    }
    setResult({ created, skipped, failed });
    setSaving(false);
    if (created) onImported();
  }

  const selectAll = (checked: boolean) => setItems(current => current.map(item => ({
    ...item, selected: checked && !duplicates.has(simplify(item.title)) &&
      (item.type === "product" ? canCreateProduct : canCreateService),
  })));

  return <div role="dialog" aria-modal="true" aria-label="Importar conteúdo de um site" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 sm:p-5">
    <div className="flex h-[min(94vh,900px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div><h2 className="flex items-center gap-2 text-lg font-bold text-foreground"><Globe2 size={20} className="text-blue-500" /> Importar de site</h2>
          <p className="mt-1 text-xs text-muted-foreground">Analisar páginas públicas, escolher os dados e salvar como rascunho na Artvideo.</p></div>
        <button onClick={onClose} disabled={saving} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X size={20} /></button>
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <label htmlFor="site-import-url" className="mb-1.5 block text-sm font-semibold text-foreground">Endereço do site <span className="text-red-500">*</span></label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="site-import-url" className={inputClass} value={url} disabled={scanning || saving} onChange={e => setUrl(e.target.value)} placeholder="https://www.exemplo.com.br/servicos" onKeyDown={e => { if (e.key === "Enter") void scan(); }} />
            <BtnPrimary loading={scanning} loadingText="Analisando..." onClick={() => void scan()} disabled={saving || !url.trim()}><Search size={16} /> Analisar site</BtnPrimary>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-foreground">
            <label className="flex items-center gap-2"><input type="checkbox" checked={scanServices} onChange={e => setScanServices(e.target.checked)} /> Serviços</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={scanProducts} onChange={e => setScanProducts(e.target.checked)} /> Produtos</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={scanPages} onChange={e => setScanPages(e.target.checked)} /> Outras páginas</label>
            <label className="ml-auto flex items-center gap-2 text-xs">Limite
              <select value={maxPages} onChange={e => setMaxPages(Number(e.target.value))} className="rounded-lg border border-border bg-background px-2 py-1.5">
                {[8, 16, 24].map(value => <option key={value} value={value}>{value} páginas</option>)}
              </select>
            </label>
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><ShieldAlert size={15} className="mt-0.5 shrink-0" /> Apenas páginas públicas e permitidas pelo site. A leitura não acessa áreas privadas nem reproduz automaticamente imagens, marcas ou textos completos.</p>
        </section>

        {error && <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {scanInfo && <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          <strong>{scanInfo.pages} páginas verificadas</strong> · {items.length} itens encontrados · {scanInfo.blocked} páginas ignoradas
          {scanInfo.warnings.map((warning, index) => <p key={index} className="mt-1 text-xs text-muted-foreground">{warning}</p>)}
        </div>}
        {result && <p role="status" className="rounded-xl border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-sm font-medium">
          {result.created} rascunhos criados, {result.skipped} ignorados e {result.failed} com erro. Nenhum item foi publicado.
        </p>}

        {scanning && <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><Loader2 className="animate-spin text-blue-500" size={24} /> Lendo páginas e identificando conteúdos...</div>}
        {!scanning && scanInfo && !items.length && <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum conteúdo compatível encontrado nas páginas acessíveis. Experimente o link da seção de serviços ou um limite maior.</div>}
        {!scanning && items.length > 0 && <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-base font-semibold">Conteúdos encontrados</h3><p className="text-xs text-muted-foreground">Selecione e revise o que deseja aproveitar.</p></div>
            <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={selected.length > 0 && selected.length === items.filter(item => !alreadyExists(item) && (item.type !== "product" ? canCreateService : canCreateProduct)).length} onChange={e => selectAll(e.target.checked)} /> Selecionar disponíveis</label>
          </div>
          {items.map(item => <article key={item.id} className={"rounded-xl border p-4 transition-colors " + (item.selected ? "border-blue-500/50 bg-blue-500/5" : "border-border bg-card")}>
            <div className="flex items-start gap-3">
              <input type="checkbox" className="mt-1.5" aria-label={"Selecionar " + item.title} checked={item.selected} disabled={saving || alreadyExists(item) || (item.type === "product" ? !canCreateProduct : !canCreateService)} onChange={e => setItem(item.id, { selected: e.target.checked })} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {item.type === "product" ? <Package size={14} /> : item.type === "service" ? <Wrench size={14} /> : <FileSearch size={14} />}
                  {typeLabel[item.type]} {item.category && <span>· Categoria detectada: {item.category}</span>}
                  {alreadyExists(item) && <span className="font-semibold text-amber-600">· Possível duplicata</span>}
                  {item.type === "product" && !canCreateProduct && <span>· Sem permissão para produtos</span>}
                </div>
                <input className={inputClass + " mt-2 font-semibold"} aria-label="Nome do item" disabled={saving || !item.selected} value={item.title} onChange={e => setItem(item.id, { title: e.target.value })} />
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-muted-foreground">Cadastrar como
                    <select className={inputClass} value={item.type} disabled={saving || !item.selected} onChange={e => setItem(item.id, { type: e.target.value as DiscoveryType, categoryId: "" })}>
                      <option value="service">Serviço</option><option value="product">Produto</option><option value="page">Serviço a partir da página</option>
                    </select>
                  </label>
                  {item.type !== "product" && <label className="space-y-1 text-xs text-muted-foreground">Categoria na Artvideo
                    <select className={inputClass} value={item.categoryId} disabled={saving || !item.selected} onChange={e => setItem(item.id, { categoryId: e.target.value })}>
                      <option value="">Sem categoria — definir depois</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </label>}
                </div>
                {item.summary && <div className="mt-3"><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={item.includeSummary} disabled={!item.selected || saving} onChange={e => setItem(item.id, { includeSummary: e.target.checked })} /> Importar resumo como base para edição</label><p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{item.summary}</p></div>}
                {item.faqs.length > 0 && item.type !== "product" && <label className="mt-2 flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={item.includeFaq} disabled={!item.selected || saving} onChange={e => setItem(item.id, { includeFaq: e.target.checked })} /> Incluir {item.faqs.length} perguntas frequentes (revisar antes de publicar)</label>}
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex max-w-full items-center gap-1 truncate text-xs text-blue-600 hover:underline dark:text-blue-400"><ExternalLink size={13} /> Visualizar página de origem</a>
              </div>
            </div>
          </article>)}
        </section>}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-background p-4">
        <p className="text-xs text-muted-foreground">Importações ficam inativas e fora do site até revisão e publicação manual.</p>
        <div className="flex gap-2"><BtnSecondary onClick={onClose} disabled={saving}><ChevronLeft size={15} /> Voltar</BtnSecondary>
          <BtnPrimary onClick={() => void importSelected()} loading={saving} loadingText="Importando..." disabled={scanning || !selected.length || saving}><Check size={16} /> Importar selecionados ({selected.length})</BtnPrimary></div>
      </footer>
    </div>
  </div>;
}
