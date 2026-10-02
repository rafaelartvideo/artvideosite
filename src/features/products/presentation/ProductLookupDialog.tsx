import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CloudDownload, PackageSearch, Search, Star } from "lucide-react";
import { cn, formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { FCurrencyInput, FInput, FIntegerInput, FTextarea, INPUT } from "@/shared/ui/admin/AdminFormControls";
import {
  importExternalProductImage,
  searchExternalProducts,
  type ExternalProductLookup,
  type ImportedProductImage,
} from "../infrastructure/product-lookup.repository";

export type ProductLookupApplyData = {
  item: ExternalProductLookup;
  name: string;
  gtin: string;
  description: string;
  brand: string;
  category: string;
  model: string;
  manufacturerCode: string;
  ncm: string;
  salePrice: string;
  initialQuantity: string;
  initialUnitCost: string;
  importedImages: ImportedProductImage[];
  coverMediaId: string | null;
};

function priceText(value: number | null, currency: string | null) {
  if (value == null) return "Não informado";
  if (currency === "BRL") return formatCurrency(value);
  return ((currency || "") + " " + value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })).trim();
}

export function ProductLookupDialog({
  open,
  organizationId,
  onClose,
  onApply,
}: {
  open: boolean;
  organizationId: string;
  onClose: () => void;
  onApply: (data: ProductLookupApplyData) => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalProductLookup[]>([]);
  const [selected, setSelected] = useState<ExternalProductLookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [gtin, setGtin] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [model, setModel] = useState("");
  const [manufacturerCode, setManufacturerCode] = useState("");
  const [ncm, setNcm] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [initialQuantity, setInitialQuantity] = useState("0");
  const [initialUnitCost, setInitialUnitCost] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected(null);
      setWarning(null);
      setError(null);
      setLoading(false);
      setApplying(false);
    }
  }, [open]);

  const selectResult = (item: ExternalProductLookup) => {
    setSelected(item);
    setName(item.name || "");
    setGtin(item.gtin || "");
    setDescription(item.description || "");
    setBrand(item.brand || "");
    setCategory(item.category_name || "");
    setModel(item.model || "");
    setManufacturerCode(item.manufacturer_code || "");
    setNcm(item.ncm || "");
    setSalePrice(item.currency === "BRL" && item.reference_price != null ? String(item.reference_price) : "");
    setInitialQuantity("0");
    setInitialUnitCost("");
    const images = (item.images || []).slice(0, 5);
    setSelectedImages(images);
    setCoverImage(images[0] || null);
    setError(null);
  };

  const search = async () => {
    const normalized = query.trim();
    if (normalized.length < 3) {
      setError("Digite pelo menos 3 caracteres ou informe um GTIN.");
      return;
    }
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const response = await searchExternalProducts(organizationId, normalized);
      setResults(response.results);
      setWarning(response.warning || null);
      if (response.results.length === 1 && /^\d{8,14}$/.test(normalized.replace(/\D/g, ""))) {
        selectResult(response.results[0]);
      }
    } catch (lookupError) {
      setResults([]);
      setError(systemErrorMessage(lookupError, "Não foi possível buscar produtos."));
    } finally {
      setLoading(false);
    }
  };

  const selectedImageSet = useMemo(() => new Set(selectedImages), [selectedImages]);

  const toggleImage = (url: string) => {
    setSelectedImages(current => {
      if (current.includes(url)) {
        const next = current.filter(item => item !== url);
        if (coverImage === url) setCoverImage(next[0] || null);
        return next;
      }
      if (current.length >= 5) {
        setError("Selecione no máximo 5 imagens.");
        return current;
      }
      const next = [...current, url];
      if (!coverImage) setCoverImage(url);
      return next;
    });
  };

  const apply = async () => {
    if (!selected) return;
    if (!name.trim()) {
      setError("Informe o nome do item.");
      return;
    }

    setApplying(true);
    setError(null);
    try {
      const importedImages: ImportedProductImage[] = [];
      for (const imageUrl of selectedImages) {
        importedImages.push(await importExternalProductImage(organizationId, imageUrl, name.trim()));
      }
      const coverIndex = coverImage ? selectedImages.indexOf(coverImage) : -1;
      const coverMediaId = coverIndex >= 0
        ? importedImages[coverIndex]?.media_id || null
        : importedImages[0]?.media_id || null;

      await onApply({
        item: selected,
        name: name.trim(),
        gtin: gtin.trim(),
        description: description.trim(),
        brand: brand.trim(),
        category: category.trim(),
        model: model.trim(),
        manufacturerCode: manufacturerCode.trim(),
        ncm: ncm.replace(/\D/g, "").slice(0, 8),
        salePrice,
        initialQuantity,
        initialUnitCost,
        importedImages,
        coverMediaId,
      });
      onClose();
    } catch (applyError) {
      setError(systemErrorMessage(applyError, "Não foi possível aplicar os dados ao cadastro."));
    } finally {
      setApplying(false);
    }
  };

  return <AdminDialog
    open={open}
    onClose={() => { if (!applying) onClose(); }}
    title="Buscar produto"
    description={selected
      ? "Confira os dados encontrados antes de aplicar ao cadastro."
      : "Pesquise por nome, GTIN, EAN, UPC ou código de barras universal."}
    className="max-w-4xl"
    footer={selected ? <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
      <AdminButton variant="secondary" disabled={applying} onClick={() => setSelected(null)}>
        <ArrowLeft size={14} /> Voltar aos resultados
      </AdminButton>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <AdminButton variant="secondary" disabled={applying} onClick={onClose}>Fechar</AdminButton>
        <AdminButton loading={applying} loadingText="Importando..." onClick={apply}>
          <CloudDownload size={14} /> Aplicar ao cadastro
        </AdminButton>
      </div>
    </div> : <div className="flex justify-end">
      <AdminButton variant="secondary" disabled={loading} onClick={onClose}>Fechar</AdminButton>
    </div>}
  >
    {!selected ? <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={event => {
          event.preventDefault();
          void search();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
          <input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Ex.: controle remoto, 789..., EAN/GTIN/UPC"
            className={cn(INPUT, "pl-9")}
          />
        </div>
        <AdminButton type="submit" loading={loading} loadingText="Buscando...">
          <Search size={14} /> Buscar
        </AdminButton>
      </form>

      {warning && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{warning}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}

      {!loading && results.length === 0 ? <div className="py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary"><PackageSearch size={22} /></div>
        <p className="mt-3 text-sm font-black text-[#0d1b2e]">{query ? "Nenhum resultado carregado" : "Busque um produto"}</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#5a6a82]">A busca consulta catálogos externos e normaliza os dados antes de preencher o Estoque.</p>
      </div> : <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {results.map((item, index) => <button
          key={item.provider + "-" + (item.external_id || index)}
          type="button"
          onClick={() => selectResult(item)}
          className="flex w-full items-center gap-3 rounded-xl border border-[#0d1b2e]/10 bg-white p-3 text-left transition hover:border-primary/30 hover:bg-primary-soft/30"
        >
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc]">
            {item.images?.[0]
              ? <img src={item.images[0]} alt="" className="h-full w-full object-contain" />
              : <PackageSearch size={20} className="text-[#9aa6b5]" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-black text-[#0d1b2e]">{item.name}</p>
            <p className="mt-1 truncate text-[10px] font-semibold text-[#64748b]">
              {[item.brand, item.model, item.gtin ? "GTIN " + item.gtin : null].filter(Boolean).join(" · ") || "Sem identificação complementar"}
            </p>
            <p className="mt-1 text-[10px] text-[#8a98aa]">{item.category_name || item.provider}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-black text-[#0d1b2e]">{priceText(item.reference_price, item.currency)}</p>
            <p className="mt-1 text-[9px] uppercase tracking-wide text-[#8a98aa]">referência</p>
          </div>
        </button>)}
      </div>}
    </div> : <div className="space-y-5">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><FInput label="Nome do item" value={name} onChange={(event: any) => setName(event.target.value)} required /></div>
        <FInput label="Código de barras / GTIN" value={gtin} onChange={(event: any) => setGtin(event.target.value)} />
        <FInput label="Modelo" value={model} onChange={(event: any) => setModel(event.target.value)} />
        <FInput label="Marca" value={brand} onChange={(event: any) => setBrand(event.target.value)} />
        <FInput label="Categoria" value={category} onChange={(event: any) => setCategory(event.target.value)} />
        <FInput label="Código do fabricante / MPN" value={manufacturerCode} onChange={(event: any) => setManufacturerCode(event.target.value)} />
        <FInput label="NCM" value={ncm} onChange={(event: any) => setNcm(event.target.value.replace(/\D/g, "").slice(0, 8))} />
        <div className="sm:col-span-2"><FTextarea label="Descrição" rows={3} value={description} onChange={(event: any) => setDescription(event.target.value)} /></div>
      </div>

      <div className="grid gap-3 rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-4 sm:grid-cols-3">
        <LookupMetric label="Fonte" value={selected.provider === "openfacts" ? "Open Facts" : selected.provider === "upcitemdb" ? "UPCitemdb" : selected.provider} />
        <LookupMetric label="Preço encontrado" value={priceText(selected.reference_price, selected.currency)} />
        <LookupMetric label="Classificação externa" value={selected.category_code || "—"} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FCurrencyInput
          label="Preço de venda"
          value={salePrice}
          onChange={(event: any) => setSalePrice(event.target.value)}
          hint={selected.currency && selected.currency !== "BRL" ? "Referência externa em " + selected.currency + "; defina o valor em reais." : "Revise antes de salvar."}
        />
        <FIntegerInput label="Saldo inicial" value={initialQuantity} onChange={(event: any) => setInitialQuantity(event.target.value)} />
        <FCurrencyInput label="Custo inicial" value={initialUnitCost} onChange={(event: any) => setInitialUnitCost(event.target.value)} />
      </div>

      {(selected.gross_weight_grams != null || selected.net_weight_grams != null || selected.width_mm != null || selected.height_mm != null || selected.length_mm != null) && <div className="grid gap-2 sm:grid-cols-5">
        <LookupMetric label="Peso bruto" value={selected.gross_weight_grams == null ? "—" : String(selected.gross_weight_grams) + " g"} />
        <LookupMetric label="Peso líquido" value={selected.net_weight_grams == null ? "—" : String(selected.net_weight_grams) + " g"} />
        <LookupMetric label="Largura" value={selected.width_mm == null ? "—" : String(selected.width_mm) + " mm"} />
        <LookupMetric label="Altura" value={selected.height_mm == null ? "—" : String(selected.height_mm) + " mm"} />
        <LookupMetric label="Comprimento" value={selected.length_mm == null ? "—" : String(selected.length_mm) + " mm"} />
      </div>}

      {selected.images.length > 0 && <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-[#0d1b2e]">Fotos encontradas</h3>
            <p className="mt-0.5 text-[10px] text-[#7a8aa0]">Selecione até 5. A estrela define a foto principal.</p>
          </div>
          <span className="text-[10px] font-bold text-[#5a6a82]">{selectedImages.length}/5 selecionadas</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {selected.images.slice(0, 8).map(url => {
            const checked = selectedImageSet.has(url);
            const cover = coverImage === url;
            return <div key={url} className={cn("relative overflow-hidden rounded-xl border bg-white p-1.5", checked ? "border-primary ring-1 ring-primary/20" : "border-[#0d1b2e]/10")}>
              <button type="button" onClick={() => toggleImage(url)} className="block aspect-square w-full overflow-hidden rounded-lg bg-[#f8fafc]">
                <img src={url} alt="" className="h-full w-full object-contain" />
              </button>
              <label className="absolute left-2 top-2 flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-white shadow">
                <input type="checkbox" checked={checked} onChange={() => toggleImage(url)} className="accent-primary" />
              </label>
              {checked && <button
                type="button"
                title="Definir como foto principal"
                onClick={() => setCoverImage(url)}
                className={cn("absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow", cover ? "text-amber-500" : "text-[#9aa6b5]")}
              >
                <Star size={13} fill={cover ? "currentColor" : "none"} />
              </button>}
            </div>;
          })}
        </div>
      </section>}
    </div>}
  </AdminDialog>;
}

function LookupMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-[#0d1b2e]/8 bg-white p-2.5">
    <p className="text-[8px] font-bold uppercase tracking-wider text-[#8a98aa]">{label}</p>
    <p className="mt-1 break-words text-xs font-black text-[#0d1b2e]">{value}</p>
  </div>;
}
