import { useMemo, useState } from "react";
import { Plus, Trash2, Layers3, WandSparkles } from "lucide-react";
import { AdminButton, AdminIconButton } from "@/shared/ui/admin/AdminLayout";

export type VariantOption = { name: string; values: string };
export type VariantMatrixRow = {
  label: string;
  attributes: Record<string, string>;
  sku: string;
  barcode: string;
  price: string;
  quantity: string;
};

function parseValues(raw: string): string[] {
  return Array.from(new Set(raw.split(/[;,\n]/g).map(v => v.trim()).filter(Boolean)));
}
export function buildVariantMatrix(
  options: VariantOption[], baseSku: string, defaultPrice: string,
  previous: VariantMatrixRow[] = [],
): VariantMatrixRow[] {
  const valid = options.filter(x => x.name.trim() && parseValues(x.values).length);
  if (!valid.length || valid.length > 3) return [];
  const names = valid.map(x => x.name.trim());
  if (new Set(names.map(x => x.toLowerCase())).size !== names.length) return [];
  let combinations: Record<string,string>[] = [{}];
  for (const attribute of valid) {
    const next: Record<string,string>[] = [];
    for (const old of combinations) for (const option of parseValues(attribute.values)) {
      next.push({ ...old, [attribute.name.trim()]: option });
      if (next.length > 30) return [];
    }
    combinations = next;
  }
  const existing = new Map(previous.map(row => [row.label, row]));
  return combinations.map((attributes, index) => {
    const label = Object.entries(attributes).map(([key,value]) => key + ": " + value).join(" · ");
    const prior = existing.get(label);
    return prior || {
      label, attributes, sku: baseSku.trim() ? baseSku.trim() + "-" + String(index+1).padStart(2,"0") : "",
      barcode: "", price: defaultPrice, quantity: "0",
    };
  });
}

export function ProductVariationMatrix({
  options, setOptions, rows, setRows, baseSku, defaultPrice, disabled,
}: {
  options: VariantOption[];
  setOptions: (value: VariantOption[]) => void;
  rows: VariantMatrixRow[];
  setRows: (value: VariantMatrixRow[]) => void;
  baseSku: string;
  defaultPrice: string;
  disabled: boolean;
}) {
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkStock, setBulkStock] = useState("");
  const total = useMemo(() => options.reduce((acc,option) => acc * Math.max(1,parseValues(option.values).length),1), [options]);
  const updateOption = (index:number, key: keyof VariantOption, value:string) =>
    setOptions(options.map((option,i) => i === index ? {...option,[key]:value}:option));
  const updateRow = (index:number, key: "sku"|"barcode"|"price"|"quantity", value:string) =>
    setRows(rows.map((row,i) => i === index ? {...row,[key]:value}:row));
  return <section aria-label="Criar variações por atributos" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Layers3 size={16} className="text-primary"/>Criar variações</h3>
        <p className="mt-1 text-xs text-muted-foreground">Defina características como cor, tamanho ou voltagem. Cada combinação recebe SKU, preço e estoque próprios, como na Shopify e Shopee.</p>
      </div>
      <span className="text-xs text-muted-foreground">{options.length}/3 atributos</span>
    </div>
    <div className="space-y-2">
      {options.map((option,index) => <div key={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)_42px] items-end gap-2 sm:grid-cols-[minmax(0,170px)_minmax(0,1fr)_42px]">
        <label className="min-w-0 text-xs font-medium text-muted-foreground">
          Atributo {index+1}
          <input aria-label={"Nome do atributo "+(index+1)} value={option.name} onChange={e=>updateOption(index,"name",e.target.value)}
            placeholder="Cor, tamanho, modelo..." disabled={disabled} maxLength={40}
            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"/>
        </label>
        <label className="col-start-1 row-start-2 min-w-0 text-xs font-medium text-muted-foreground sm:col-start-2 sm:row-start-1">
          Valores (separados por vírgula)
          <input aria-label={"Valores do atributo "+(index+1)} value={option.values} onChange={e=>updateOption(index,"values",e.target.value)}
            placeholder="Preto, Branco, Azul" disabled={disabled}
            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"/>
        </label>
        <AdminIconButton className="col-start-2 row-start-2 !h-10 !w-[42px] sm:col-start-3 sm:row-start-1"
          ariaLabel="Remover atributo" title="Remover atributo" disabled={disabled} variant="danger"
          onClick={()=>{setOptions(options.filter((_,i)=>i!==index));setRows([]);}}><Trash2 size={16}/></AdminIconButton>
      </div>)}
      <div className="flex flex-wrap gap-2">
        {options.length<3 && <AdminButton variant="secondary" size="sm" disabled={disabled} onClick={()=>setOptions([...options,{name:"",values:""}])}><Plus size={15}/>Atributo</AdminButton>}
        <AdminButton size="sm" disabled={disabled || !options.length || total>30}
          onClick={()=>setRows(buildVariantMatrix(options,baseSku,defaultPrice,rows))}>
          <WandSparkles size={15}/>Gerar combinações
        </AdminButton>
      </div>
      {total>30 && <p className="text-xs text-destructive">O limite atual é de 30 variações por produto. Reduza as opções.</p>}
    </div>
    {rows.length>0 && <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{rows.length} combinações preparadas</p>
          <p className="text-xs text-muted-foreground">O saldo inicial é registrado na criação. A imagem poderá ser personalizada abrindo cada variante.</p>
        </div>
        <AdminButton variant="tertiary" size="sm" disabled={disabled} onClick={()=>setRows([])}>Limpar combinações</AdminButton>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="text-xs font-medium text-muted-foreground">Preço para todas
          <input aria-label="Preço para todas as variações" type="number" min="0" step="0.01" value={bulkPrice} onChange={e=>setBulkPrice(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"/>
        </label>
        <label className="text-xs font-medium text-muted-foreground">Saldo inicial para todas
          <input aria-label="Saldo para todas as variações" type="number" min="0" step="1" value={bulkStock} onChange={e=>setBulkStock(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"/>
        </label>
        <AdminButton variant="secondary" size="sm" disabled={disabled || (!bulkPrice && !bulkStock)}
          onClick={()=>setRows(rows.map(row=>({...row,price:bulkPrice || row.price,quantity:bulkStock || row.quantity})))}>Aplicar a todas</AdminButton>
      </div>
      <div className="min-w-0 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
            <th className="px-3 py-2 text-left">Variação</th><th className="px-3 py-2 text-left">SKU</th>
            <th className="px-3 py-2 text-left">GTIN (opcional)</th><th className="px-3 py-2 text-left">Preço (R$)</th><th className="px-3 py-2 text-left">Saldo</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map((row,i)=><tr key={row.label}>
              <td className="max-w-[200px] px-3 py-2 font-medium text-foreground">{row.label}</td>
              <td className="px-2 py-2"><input aria-label={"SKU de "+row.label} value={row.sku} maxLength={100} disabled={disabled}
                onChange={e=>updateRow(i,"sku",e.target.value)} className="h-9 w-full min-w-[130px] rounded-md border border-border bg-background px-2 text-xs"/></td>
              <td className="px-2 py-2"><input aria-label={"GTIN de "+row.label} value={row.barcode} maxLength={32} disabled={disabled}
                onChange={e=>updateRow(i,"barcode",e.target.value)} className="h-9 w-full min-w-[115px] rounded-md border border-border bg-background px-2 text-xs"/></td>
              <td className="px-2 py-2"><input aria-label={"Preço de "+row.label} value={row.price} type="number" min="0" step="0.01" disabled={disabled}
                onChange={e=>updateRow(i,"price",e.target.value)} className="h-9 w-full min-w-[95px] rounded-md border border-border bg-background px-2 text-xs"/></td>
              <td className="px-2 py-2"><input aria-label={"Saldo de "+row.label} value={row.quantity} type="number" min="0" step="1" disabled={disabled}
                onChange={e=>updateRow(i,"quantity",e.target.value)} className="h-9 w-full min-w-[72px] rounded-md border border-border bg-background px-2 text-xs"/></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Ao salvar o item, as versões serão cadastradas em uma operação única. Nenhuma variante compartilha saldo com outra.</p>
    </>}
  </section>;
}
