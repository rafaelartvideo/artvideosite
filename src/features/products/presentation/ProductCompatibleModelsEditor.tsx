import { useEffect, useState } from "react";
import { Plus, Trash2, Tv2 } from "lucide-react";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { AdminFieldLabel, AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import type { InventoryCatalogOption } from "../infrastructure/inventory-catalog-settings.repository";
import type { CompatibleDeviceModel } from "../infrastructure/product-compatible-models.repository";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function ProductCompatibleModelsEditor({
  models, onChange, inherited, onInheritedChange, parentProductId, disabled = false, loaded = true,
  deviceTypes = [], deviceBrands = [],
}: {
  models: CompatibleDeviceModel[];
  onChange: (models: CompatibleDeviceModel[]) => void;
  inherited: boolean;
  onInheritedChange: (inherited: boolean) => void;
  parentProductId?: string | null;
  disabled?: boolean;
  loaded?: boolean;
  deviceTypes?: InventoryCatalogOption[];
  deviceBrands?: InventoryCatalogOption[];
}) {
  const [deviceType, setDeviceType] = useState("");
  const [brand, setBrand] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [error, setError] = useState("");
  const inheritedFromParent = Boolean(parentProductId && inherited);
  const activeTypes = deviceTypes.filter(item => item.is_active);
  const activeBrands = deviceBrands.filter(item => item.is_active);

  useEffect(() => {
    setDeviceType(current => activeTypes.some(item => item.name === current) ? current : activeTypes[0]?.name || "");
  }, [deviceTypes]);
  useEffect(() => {
    setBrand(current => activeBrands.some(item => item.name === current) ? current : "");
  }, [deviceBrands]);

  const addModels = () => {
    const t = deviceType.trim().replace(/\s+/g, " ");
    const b = brand.trim().replace(/\s+/g, " ");
    const batch = modelInput.split(/[;\n,]+/).map(s => s.trim().replace(/\s+/g, " ")).filter(Boolean);
    if (!t || !b || !batch.length) {
      setError("Informe o tipo de equipamento, a marca e pelo menos um modelo.");
      return;
    }
    if (t.length > 60 || b.length > 80 || batch.some(m => m.length > 120)) {
      setError("Limite de 60 caracteres para tipo, 80 para marca e 120 para modelo.");
      return;
    }
    const exists = new Set(models.map(m => [m.device_type,m.brand,m.model].map(normalize).join("|")));
    const added: CompatibleDeviceModel[] = [];
    for (const model of batch) {
      const key = [t,b,model].map(normalize).join("|");
      if (!normalize(model) || !normalize(t) || !normalize(b) || exists.has(key)) continue;
      exists.add(key);
      added.push({ device_type: t, brand: b, model });
    }
    if (models.length + added.length > 200) {
      setError("Limite de 200 modelos por produto.");
      return;
    }
    if (!added.length) {
      setError("Todos os modelos informados já estão cadastrados ou são inválidos.");
      return;
    }
    onChange([...models, ...added]);
    setModelInput("");
    setError("");
  };

  return <div className="min-w-0 space-y-3">
    {Boolean(parentProductId) && <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm">
      <input type="checkbox" checked={inherited} disabled={disabled || !loaded}
        onChange={event => { setError(""); onInheritedChange(event.target.checked); }}
        className="h-4 w-4 accent-primary" />
      <span className="min-w-0">
        <span className="block font-semibold text-foreground">Herdar modelos compatíveis do produto principal</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">Desmarque para personalizar a compatibilidade desta variação.</span>
      </span>
    </label>}

    {!loaded ? <p className="py-4 text-center text-xs text-muted-foreground">Carregando modelos compatíveis...</p>
    : <div className="space-y-3">
      {!inheritedFromParent && <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(135px,0.8fr)_minmax(140px,1fr)]">
        <div className="min-w-0">
          <AdminFieldLabel label="Tipo de aparelho" />
          <AdminSelect value={deviceType} ariaLabel="Tipo de aparelho compatível" disabled={disabled || activeTypes.length === 0}
            dropdownClassName="!max-h-[176px]"
            onValueChange={setDeviceType}
            options={activeTypes.length
              ? activeTypes.map(type => ({ value: type.name, label: type.name }))
              : [{ value: "", label: "Cadastre em Configurações do Estoque" }]} />
        </div>
        <div className="min-w-0">
          <AdminFieldLabel label="Marca do aparelho" />
          <AdminSelect value={brand} ariaLabel="Marca do aparelho compatível" disabled={disabled || activeBrands.length === 0}
            dropdownClassName="!max-h-[176px]"
            onValueChange={setBrand}
            options={[{ value: "", label: activeBrands.length ? "Selecione uma marca" : "Cadastre em Configurações do Estoque" },
              ...activeBrands.map(item => ({ value: item.name, label: item.name }))]} />
        </div>
        <div className="min-w-0 sm:col-span-2">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Modelos compatíveis</label>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
            <textarea rows={2} value={modelInput} disabled={disabled} maxLength={10000}
              placeholder={"Ex.: UN50AU7700, UN55AU7700\nTambém é possível colar um modelo por linha."}
              onChange={event => setModelInput(event.target.value)}
              className="min-h-[76px] min-w-0 flex-1 resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"/>
            <AdminButton type="button" variant="secondary" disabled={disabled} onClick={addModels}
              className="min-h-[42px] shrink-0 justify-center sm:self-start">
              <Plus size={15}/> Adicionar modelos
            </AdminButton>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Separe os modelos por vírgula, ponto e vírgula ou quebra de linha. Cadastre outras marcas alterando o campo acima.</p>
        </div>
      </div>}
      {inheritedFromParent && <p className="text-xs font-medium text-primary">Os modelos abaixo são herdados do produto principal e atualizados com ele.</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="min-w-0 border-t border-border pt-2">
        <div className="mb-2 flex justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">Modelos vinculados</span>
          <span className="text-xs tabular-nums text-muted-foreground">{models.length}/200</span>
        </div>
        {!models.length ? <div className="flex min-h-16 items-center justify-center gap-2 rounded-lg bg-muted/20 px-3 text-xs text-muted-foreground">
          <Tv2 size={15}/> Nenhum modelo compatível informado.
        </div> : <div className="max-h-60 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {models.map((item, index) => <div key={index} className="flex min-w-0 items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 text-xs">
              <span className="font-semibold text-foreground">{item.brand} {item.model}</span>
              <span className="ml-2 text-muted-foreground">· {item.device_type}</span>
            </span>
            {!inheritedFromParent && <button type="button" disabled={disabled} title="Remover modelo"
              aria-label={"Remover " + item.brand + " " + item.model}
              onClick={() => onChange(models.filter((_, i) => i !== index))}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-50">
              <Trash2 size={15}/>
            </button>}
          </div>)}
        </div>}
      </div>
    </div>}
  </div>;
}
