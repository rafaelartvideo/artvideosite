import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Plus, Search, Trash2, WandSparkles } from "lucide-react";
import { PRODUCT_CONDITION_OPTIONS, productConditionLabel, type ProductCondition } from "../domain/product-condition";
import type { InventorySupplier } from "@/features/inventory/infrastructure/inventory.repository";
import { VariantSupplierPicker } from "./VariantSupplierPicker";
import { listProductVariations } from "../infrastructure/product-variations.repository";
import { AdminButton, AdminIconButton } from "@/shared/ui/admin/AdminLayout";

export const MAX_VARIATION_ATTRIBUTES = 5;
export const MAX_VARIATION_CANDIDATES = 200;
export const MAX_VARIATIONS_PER_PRODUCT = 30; // Inclui o produto principal.
export const MAX_ADDITIONAL_VARIATIONS = MAX_VARIATIONS_PER_PRODUCT - 1;

export type VariantOption = { name: string; values: string };
export type VariantMatrixRow = {
  label: string;
  attributes: Record<string, string>;
  sku: string;
  barcode: string;
  product_condition: ProductCondition;
  supplier_mode?: "inherit" | "custom";
  supplier_entities?: InventorySupplier[];
  price: string;
  quantity: string;
};

function parseValues(raw: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[;,\n]/g)) {
    const value = part.trim();
    const key = value.toLocaleLowerCase("pt-BR");
    if (value && !seen.has(key)) { result.push(value); seen.add(key); }
  }
  return result;
}

export function countVariantCombinations(options: VariantOption[]): number {
  if (!options.length) return 0;
  return options.reduce((count, option) => count * parseValues(option.values).length, 1);
}

export function validVariantOptions(options: VariantOption[]): boolean {
  if (!options.length) return true;
  if (options.length > MAX_VARIATION_ATTRIBUTES) return false;
  const names = options.map(option => option.name.trim().toLocaleLowerCase("pt-BR"));
  const primaryLabel = options.map(option =>
    option.name.trim() + ": " + (parseValues(option.values)[0] || "")
  ).join(" · ");
  return names.every(Boolean)
    && new Set(names).size === names.length
    && options.every(option => option.values.length <= 4096
      && parseValues(option.values).length > 0
      && parseValues(option.values).every(value => value.length <= 100))
    && primaryLabel.length <= 100
    && countVariantCombinations(options) <= MAX_VARIATION_CANDIDATES;
}

export function buildVariantMatrix(
  options: VariantOption[], baseSku: string, defaultPrice: string,
  previous: VariantMatrixRow[] = [], defaultCondition: ProductCondition = "new",
): VariantMatrixRow[] {
  if (!options.length || options.length > MAX_VARIATION_ATTRIBUTES) return [];
  if (options.some(option => !option.name.trim() || !parseValues(option.values).length)) return [];
  const names = options.map(option => option.name.trim());
  if (new Set(names.map(name => name.toLocaleLowerCase("pt-BR"))).size !== names.length) return [];
  if (countVariantCombinations(options) > MAX_VARIATION_CANDIDATES) return [];
  let combinations: Record<string, string>[] = [{}];
  for (const attribute of options) {
    const next: Record<string, string>[] = [];
    for (const old of combinations) for (const value of parseValues(attribute.values)) {
      next.push({ ...old, [attribute.name.trim()]: value });
    }
    combinations = next;
  }
  const previousByLabel = new Map(previous.map(row => [row.label, row]));
  // A primeira combinação usa o cadastro principal. Não criar estoque duplicado.
  return combinations.slice(1).map((attributes, index) => {
    const label = Object.entries(attributes).map(([key, value]) => key + ": " + value).join(" · ");
    const prior = previousByLabel.get(label);
    return prior || {
      label, attributes,
      sku: baseSku.trim() ? baseSku.trim() + "-" + String(index + 2).padStart(2, "0") : "",
      barcode: "", product_condition: defaultCondition, supplier_mode: "inherit", supplier_entities: [], price: defaultPrice, quantity: "0",
    };
  });
}

export function ProductVariationMatrix({
  options, setOptions, rows, setRows, candidates, setCandidates, baseSku, defaultPrice, defaultCondition, organizationId, parentProductId, canManageSuppliers, disabled,
}: {
  options: VariantOption[];
  setOptions: (value: VariantOption[]) => void;
  rows: VariantMatrixRow[];
  setRows: (value: VariantMatrixRow[]) => void;
  candidates: VariantMatrixRow[];
  setCandidates: (value: VariantMatrixRow[]) => void;
  baseSku: string;
  defaultPrice: string;
  defaultCondition: ProductCondition;
  organizationId: string;
  parentProductId?: string | null;
  canManageSuppliers: boolean;
  disabled: boolean;
}) {
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkStock, setBulkStock] = useState("");
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [singleReady, setSingleReady] = useState(false);
  const [allAlreadyRegistered, setAllAlreadyRegistered] = useState(false);
  const linkedQuery = useQuery({
    queryKey: ["products", "variation-family", organizationId, parentProductId],
    queryFn: () => listProductVariations(organizationId, parentProductId!),
    enabled: Boolean(organizationId && parentProductId),
    staleTime: 20_000,
  });
  const linkedLabels = new Set((linkedQuery.data || []).filter(item => !item.is_parent)
    .map(item => item.variation_label.toLocaleLowerCase("pt-BR")));
  const availableSlots = Math.max(0, MAX_ADDITIONAL_VARIATIONS - linkedLabels.size);
  const linkedLoading = Boolean(parentProductId) && linkedQuery.isPending;

  const count = useMemo(() => countVariantCombinations(options), [options]);
  const validNames = options.every(option => option.name.trim() && parseValues(option.values).length);
  const uniqueNames = new Set(options.map(option => option.name.trim().toLocaleLowerCase("pt-BR"))).size === options.length;
  const firstLabel = validNames && uniqueNames
    ? options.map(option => option.name.trim() + ": " + parseValues(option.values)[0]).join(" · ")
    : "";
  const selectedLabels = new Set(rows.map(row => row.label));
  const visible = candidates.filter(row =>
    (!selectedOnly || selectedLabels.has(row.label))
    && (!search.trim() || row.label.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")))
  );
  const invalidCandidateLabels = candidates.some(row => row.label.length > 100);

  const resetGenerated = () => {
    setRows([]);
    setCandidates([]);
    setExpandedLabel(null);
    setSearch("");
    setSelectedOnly(false);
    setSingleReady(false);
    setAllAlreadyRegistered(false);
  };
  const updateOption = (index: number, key: keyof VariantOption, value: string) => {
    setOptions(options.map((option, i) => i === index ? { ...option, [key]: value } : option));
    resetGenerated();
  };
  const generate = () => {
    // A primeira combinação já é o produto principal; ignorar versões existentes.
    const prepared = buildVariantMatrix(options, baseSku, defaultPrice, candidates, defaultCondition)
      .filter(row => !linkedLabels.has(row.label.toLocaleLowerCase("pt-BR")));
    setCandidates(prepared);
    setSingleReady(count === 1);
    setAllAlreadyRegistered(count > 1 && prepared.length === 0);
    setRows(prepared.length <= availableSlots ? prepared : []);
    setExpandedLabel(prepared.length <= availableSlots ? prepared[0]?.label || null : null);
    setSearch("");
    setSelectedOnly(false);
  };
  const selectRow = (label: string, selected: boolean) => {
    const next = selected ? new Set([...selectedLabels, label]) : new Set([...selectedLabels].filter(item => item !== label));
    if (next.size > availableSlots) return;
    setRows(candidates.filter(row => next.has(row.label)));
  };
  const updateRow = (label: string, key: "sku" | "barcode" | "product_condition" | "price" | "quantity", value: string) => {
    const apply = (row: VariantMatrixRow) => row.label === label ? { ...row, [key]: value } : row;
    setCandidates(candidates.map(apply));
    setRows(rows.map(apply));
  };
  const updateSupplierPreference = (label: string, mode: "inherit" | "custom", suppliers?: InventorySupplier[]) => {
    const apply = (row: VariantMatrixRow) => row.label === label
      ? { ...row, supplier_mode: mode, supplier_entities: suppliers ?? row.supplier_entities ?? [] }
      : row;
    setCandidates(candidates.map(apply));
    setRows(rows.map(apply));
  };
  const applyBulk = () => {
    if (!bulkPrice.trim() && !bulkStock.trim()) return;
    const apply = (row: VariantMatrixRow) => selectedLabels.has(row.label)
      ? { ...row, price: bulkPrice !== "" ? bulkPrice : row.price, quantity: bulkStock !== "" ? bulkStock : row.quantity }
      : row;
    setCandidates(candidates.map(apply));
    setRows(rows.map(apply));
  };
  const canGenerate = !disabled && !linkedLoading && !linkedQuery.isError
    && options.length > 0 && validNames && uniqueNames
    && count >= 1 && count <= MAX_VARIATION_CANDIDATES && firstLabel.length <= 100
    && (count === 1 || availableSlots > 0);
  const generateDisabledReason = disabled ? "Aguarde o fim do salvamento."
    : linkedLoading ? "Carregando variações já cadastradas..."
    : linkedQuery.isError ? "Não foi possível consultar as variações atuais. Tente novamente."
    : !options.length ? "Adicione um atributo com valores para gerar combinações."
    : !validNames ? "Preencha o nome e pelo menos um valor de cada atributo."
    : !uniqueNames ? "Os nomes dos atributos não podem se repetir."
    : count > MAX_VARIATION_CANDIDATES ? "Limite de 200 possibilidades. Reduza os valores."
    : firstLabel.length > 100 ? "A identificação da combinação principal passou de 100 caracteres."
    : availableSlots === 0 && count > 1 ? "Limite de 30 versões por produto atingido."
    : "";
  const inputClass = "mt-1 h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground";

  return <section aria-label="Criar variações por atributos" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Ex.: cor, voltagem, tamanho, acabamento ou modelo. Você pode informar apenas uma cor;
          ela identifica o produto principal. Outras versões são adicionadas quando existirem.
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{options.length}/{MAX_VARIATION_ATTRIBUTES} atributos</span>
    </div>

    <div className="space-y-3">
      {options.map((option, index) => <div key={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)_42px] items-end gap-2 border-b border-border/70 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,170px)_minmax(0,1fr)_42px]">
        <label className="min-w-0 text-xs font-medium text-muted-foreground">
          Atributo {index + 1}
          <input aria-label={"Nome do atributo " + (index + 1)} value={option.name}
            onChange={event => updateOption(index, "name", event.target.value)}
            placeholder="Cor, tamanho, modelo..." disabled={disabled} maxLength={40} className={inputClass}/>
        </label>
        <label className="col-start-1 row-start-2 min-w-0 text-xs font-medium text-muted-foreground sm:col-start-2 sm:row-start-1">
          Valores (separados por vírgula)
          <input aria-label={"Valores do atributo " + (index + 1)} value={option.values}
            onChange={event => updateOption(index, "values", event.target.value)}
            placeholder="Preto, Branco, Azul" disabled={disabled} className={inputClass}/>
        </label>
        <AdminIconButton className="col-start-2 row-start-2 !h-10 !w-[42px] sm:col-start-3 sm:row-start-1"
          ariaLabel={"Remover atributo " + (index + 1)} title="Remover atributo" disabled={disabled} variant="danger"
          onClick={() => { setOptions(options.filter((_, i) => i !== index)); resetGenerated(); }}>
          <Trash2 size={16}/>
        </AdminIconButton>
      </div>)}
      <div className="grid min-w-0 grid-cols-2 gap-2">
        {options.length < MAX_VARIATION_ATTRIBUTES && <AdminButton variant="secondary" size="sm" className="w-full" disabled={disabled}
          onClick={() => { setOptions([...options, { name: "", values: "" }]); resetGenerated(); }}>
          <Plus size={15}/>Adicionar atributo
        </AdminButton>}
        <AdminButton size="sm" className={options.length < MAX_VARIATION_ATTRIBUTES ? "w-full" : "col-span-2 w-full"}
          disabled={!canGenerate} onClick={generate}>
          <WandSparkles size={15}/>{count === 1 ? "Confirmar versão principal" : "Gerar combinações"}
        </AdminButton>
      </div>
      {!canGenerate && <p className="text-xs text-muted-foreground" role="status">{generateDisabledReason}</p>}
      {options.length > 0 && <p className="text-xs text-muted-foreground" role="status">
        {count.toLocaleString("pt-BR")} {count === 1 ? "combinação possível" : "combinações possíveis"}
        {" · "}até {availableSlots} adicionais, mais o produto principal.
      </p>}
      {singleReady && count === 1 && <p role="status" className="text-xs text-foreground">
        A única combinação pertence ao produto principal. Clique em Salvar para guardar o atributo, sem gerar estoque duplicado.
      </p>}
      {allAlreadyRegistered && <p role="status" className="text-xs text-muted-foreground">
        Todas as combinações já estão cadastradas. Acrescente um novo valor ao atributo para criar outra versão.
      </p>}
      {options.length > 0 && (!validNames || !uniqueNames) &&
        <p className="text-xs text-destructive">Preencha todos os nomes e valores e não repita nomes de atributos.</p>}
      {count > MAX_VARIATION_CANDIDATES &&
        <p className="text-xs text-destructive">São mais de {MAX_VARIATION_CANDIDATES} possibilidades. Reduza os valores para gerar a lista sem sobrecarregar o cadastro.</p>}
      {firstLabel.length > 100 &&
        <p className="text-xs text-destructive">A descrição da combinação principal ultrapassa 100 caracteres. Encurte os nomes e valores.</p>}
    </div>

    {firstLabel && <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
      <strong className="text-foreground">Produto principal:</strong> {firstLabel}. Seu preço, SKU e estoque são os dados de Geral e Comercial.
    </p>}

    {candidates.length > 0 && <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{rows.length} de {candidates.length} versões adicionais selecionadas</p>
          <p className="text-xs leading-5 text-muted-foreground">Marque somente versões disponíveis. As já cadastradas são ignoradas, e as desmarcadas não serão criadas.</p>
        </div>
        <AdminButton variant="tertiary" size="sm" disabled={disabled}
          onClick={() => { resetGenerated(); }}>Limpar combinações</AdminButton>
      </div>
      {candidates.length > availableSlots && <p role="status" className="text-xs text-muted-foreground">
        Existem mais combinações do que o limite de cadastro simultâneo. Selecione até {availableSlots} adicionais; nenhuma foi marcada automaticamente.
      </p>}
      {invalidCandidateLabels && <p role="alert" className="text-xs text-destructive">
        Uma ou mais combinações ultrapassam 100 caracteres. Encurte os atributos antes de cadastrar.
      </p>}
      <div className="flex flex-wrap items-center gap-2">
        <AdminButton variant="secondary" size="sm" disabled={disabled}
          onClick={() => setRows(candidates.slice(0, availableSlots))}>
          Selecionar até {availableSlots}
        </AdminButton>
        <AdminButton variant="tertiary" size="sm" disabled={disabled || rows.length === 0}
          onClick={() => setRows([])}>Desmarcar todas</AdminButton>
      </div>
      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="text-xs font-medium text-muted-foreground">Preço para selecionadas (R$)
          <input aria-label="Preço para todas as variações" type="number" min="0" step="0.01" value={bulkPrice}
            disabled={disabled} onChange={event => setBulkPrice(event.target.value)} className={inputClass}/>
        </label>
        <label className="text-xs font-medium text-muted-foreground">Saldo inicial para selecionadas
          <input aria-label="Saldo para todas as variações" type="number" min="0" step="1" value={bulkStock}
            disabled={disabled} onChange={event => setBulkStock(event.target.value)} className={inputClass}/>
        </label>
        <AdminButton variant="secondary" size="sm" disabled={disabled || rows.length === 0 || (!bulkPrice && !bulkStock)} onClick={applyBulk}>
          Aplicar a todas
        </AdminButton>
      </div>
      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <label className="relative min-w-0">
          <Search size={16} className="pointer-events-none absolute left-3 top-3 text-muted-foreground"/>
          <input type="search" aria-label="Buscar combinação" placeholder="Buscar combinação..."
            className="h-10 w-full min-w-0 rounded-lg border border-border bg-background pl-9 pr-3 text-sm"
            value={search} onChange={event => setSearch(event.target.value)}/>
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={selectedOnly}
            onChange={event => setSelectedOnly(event.target.checked)}/>
          Mostrar só selecionadas
        </label>
      </div>
      <div className="min-w-0 overflow-hidden rounded-lg border border-border divide-y divide-border">
        {visible.map(row => {
          const selected = selectedLabels.has(row.label);
          const expanded = expandedLabel === row.label;
          return <div key={row.label} className="min-w-0">
            <div className="flex min-w-0 items-center gap-2 px-3 py-3">
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" aria-label={"Selecionar " + row.label}
                checked={selected} disabled={disabled || (!selected && rows.length >= availableSlots)}
                onChange={event => selectRow(row.label, event.target.checked)}/>
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left"
                disabled={disabled} aria-expanded={expanded} aria-label={"Editar " + row.label}
                onClick={() => setExpandedLabel(expanded ? null : row.label)}>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold text-foreground">{row.label}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {row.sku || "Sem SKU"} · {productConditionLabel(row.product_condition)} · R$ {row.price || "—"} · Saldo {row.quantity || "0"}
                  </span>
                </span>
                {expanded ? <ChevronUp size={17} className="shrink-0 text-muted-foreground"/> : <ChevronDown size={17} className="shrink-0 text-muted-foreground"/>}
              </button>
            </div>
            {expanded && <div className="grid min-w-0 gap-3 border-t border-border bg-muted/20 px-3 py-3 sm:grid-cols-2">
              <label className="min-w-0 text-xs font-medium text-muted-foreground">SKU da variação
                <input aria-label={"SKU de " + row.label} value={row.sku} maxLength={100} disabled={disabled}
                  onChange={event => updateRow(row.label, "sku", event.target.value)} className={inputClass}/>
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">GTIN (opcional)
                <input aria-label={"GTIN de " + row.label} value={row.barcode} disabled={disabled}
                  onChange={event => updateRow(row.label, "barcode", event.target.value)} className={inputClass}/>
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">Condição da variação
                <select aria-label={"Condição de " + row.label} value={row.product_condition}
                  disabled={disabled} onChange={event => updateRow(row.label, "product_condition", event.target.value as ProductCondition)}
                  className={inputClass}>
                  {PRODUCT_CONDITION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">Preço (R$)
                <input aria-label={"Preço de " + row.label} type="number" min="0" step="0.01" value={row.price} disabled={disabled}
                  onChange={event => updateRow(row.label, "price", event.target.value)} className={inputClass}/>
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">Saldo inicial
                <input aria-label={"Saldo de " + row.label} type="number" min="0" step="1" value={row.quantity} disabled={disabled}
                  onChange={event => updateRow(row.label, "quantity", event.target.value)} className={inputClass}/>
              </label>
              {canManageSuppliers && <div className="min-w-0 space-y-2 sm:col-span-2">
                <span className="block text-xs font-medium text-muted-foreground">Fornecedores da variação</span>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={disabled}
                    onClick={() => updateSupplierPreference(row.label, "inherit")}
                    aria-pressed={row.supplier_mode !== "custom"}
                    className={`min-h-9 rounded-lg border px-2 text-xs font-semibold disabled:opacity-40 ${row.supplier_mode !== "custom" ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-foreground"}`}>
                    Mesmos do principal
                  </button>
                  <button type="button" disabled={disabled}
                    onClick={() => updateSupplierPreference(row.label, "custom")}
                    aria-pressed={row.supplier_mode === "custom"}
                    className={`min-h-9 rounded-lg border px-2 text-xs font-semibold disabled:opacity-40 ${row.supplier_mode === "custom" ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-foreground"}`}>
                    Fornecedores próprios
                  </button>
                </div>
                {row.supplier_mode === "custom" ?
                  <VariantSupplierPicker organizationId={organizationId} value={row.supplier_entities || []}
                    disabled={disabled} onChange={suppliers => updateSupplierPreference(row.label, "custom", suppliers)}/> :
                  <p className="text-[11px] text-muted-foreground">Serão usados os fornecedores do produto principal ao salvar.</p>}
              </div>}
            </div>}
          </div>;
        })}
        {visible.length === 0 && <p className="px-3 py-5 text-center text-xs text-muted-foreground">Nenhuma combinação corresponde ao filtro.</p>}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Ao salvar, apenas as versões marcadas serão cadastradas, cada uma com movimentações e saldo próprios.
        A primeira combinação continua pertencendo ao item principal.
      </p>
    </>}
  </section>;
}
