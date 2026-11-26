import { useEffect, useState } from "react";
import { Plus, Trash2, Tv2 } from "lucide-react";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { CatalogSearchSelect } from "@/shared/ui/admin/CatalogCombobox";
import type { InventoryCatalogOption } from "../infrastructure/inventory-catalog-settings.repository";
import type { CompatibleDeviceModel } from "../infrastructure/product-compatible-models.repository";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function ProductCompatibleModelsEditor({
  models, onChange, inherited, onInheritedChange, parentProductId, disabled = false, loaded = true, loadError = false,
  deviceTypes = [], deviceBrands = [], canCreateDeviceType = false, canCreateDeviceBrand = false, onCreateCatalogOption,
}: {
  models: CompatibleDeviceModel[];
  onChange: (models: CompatibleDeviceModel[]) => void;
  inherited: boolean;
  onInheritedChange: (inherited: boolean) => void;
  parentProductId?: string | null;
  disabled?: boolean;
  loaded?: boolean;
  loadError?: boolean;
  deviceTypes?: InventoryCatalogOption[];
  deviceBrands?: InventoryCatalogOption[];
  canCreateDeviceType?: boolean;
  canCreateDeviceBrand?: boolean;
  onCreateCatalogOption?: (kind: "device_type" | "device_brand", name: string) => Promise<InventoryCatalogOption>;
}) {
  const [deviceType, setDeviceType] = useState("");
  const [brand, setBrand] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [error, setError] = useState("");
  const [quickKind, setQuickKind] = useState<"device_type" | "device_brand" | null>(null);
  const [quickName, setQuickName] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState("");
  const openQuick = (kind: "device_type" | "device_brand") => { setQuickName(""); setQuickError(""); setQuickKind(kind); };
  const saveQuick = async () => {
    if (!quickKind || !quickName.trim() || quickSaving || disabled || !onCreateCatalogOption) return;
    if (quickKind === "device_type" ? !canCreateDeviceType : !canCreateDeviceBrand) return;
    setQuickSaving(true); setQuickError("");
    try {
      const item = await onCreateCatalogOption(quickKind, quickName);
      if (quickKind === "device_type") setDeviceType(item.name); else setBrand(item.name);
      setQuickKind(null); setQuickName(""); setError("");
    } catch (cause) { setQuickError(systemErrorMessage(cause, "Não foi possível criar o cadastro.")); }
    finally { setQuickSaving(false); }
  };
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

    {!loaded ? <p className="py-4 text-center text-xs text-muted-foreground">{loadError ? "Modelos compatíveis indisponíveis no momento. Você pode salvar o produto sem alterar essa lista." : "Carregando modelos compatíveis..."}</p>
    : <div className="space-y-3">
      {!inheritedFromParent && <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(135px,0.8fr)_minmax(140px,1fr)]">
        <div className="min-w-0">
          <div className="flex min-w-0 items-end gap-2">
            <div className="min-w-0 flex-1"><CatalogSearchSelect label="Tipo de aparelho" value={deviceType} disabled={disabled || activeTypes.length === 0}
              placeholder="Digite ou selecione o tipo..."
              onValueChange={setDeviceType}
              options={activeTypes.length
                ? activeTypes.map(type => ({ value: type.name, label: type.name }))
                : [{ value: "", label: "Selecione um tipo" }]} /></div>
            {canCreateDeviceType && onCreateCatalogOption && <AdminButton type="button" disabled={disabled}
              aria-label="Novo tipo de aparelho" title="Novo tipo de aparelho" onClick={() => openQuick("device_type")}
              className="h-[42px] w-[42px] shrink-0 !p-0"><Plus size={17}/></AdminButton>}
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-end gap-2">
            <div className="min-w-0 flex-1"><CatalogSearchSelect label="Marca do aparelho" value={brand} disabled={disabled || activeBrands.length === 0}
              placeholder="Digite ou selecione a marca..."
              onValueChange={setBrand}
              options={[{ value: "", label: "Selecione uma marca" },
                ...activeBrands.map(item => ({ value: item.name, label: item.name }))]} /></div>
            {canCreateDeviceBrand && onCreateCatalogOption && <AdminButton type="button" disabled={disabled}
              aria-label="Nova marca de aparelho" title="Nova marca de aparelho" onClick={() => openQuick("device_brand")}
              className="h-[42px] w-[42px] shrink-0 !p-0"><Plus size={17}/></AdminButton>}
          </div>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <div className="flex min-w-0 items-end gap-2">
            <div className="min-w-0 flex-1">
              <FInput label="Modelos compatíveis" value={modelInput} disabled={disabled} maxLength={10000}
                placeholder="Ex.: UN50AU7700, UN55AU7700"
                onChange={(event: any) => setModelInput(event.target.value)}
                onKeyDown={(event: any) => { if (event.key === "Enter") { event.preventDefault(); addModels(); } }}
                onPaste={(event: any) => {
                  const pasted = event.clipboardData.getData("text");
                  if (!/[\r\n]/.test(pasted)) return;
                  event.preventDefault();
                  const input = event.currentTarget;
                  const start = input.selectionStart ?? modelInput.length;
                  const end = input.selectionEnd ?? start;
                  setModelInput((modelInput.slice(0, start) + pasted.replace(/[\r\n]+/g, ", ") + modelInput.slice(end)).slice(0, 10000));
                }}
              />
            </div>
            <AdminButton type="button" variant="tertiary" disabled={disabled} onClick={addModels}
              className="h-[42px] shrink-0 justify-center">
              <Plus size={15}/> <span className="hidden sm:inline">Adicionar modelos</span><span className="sm:hidden">Adicionar</span>
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
    {quickKind && <AdminDialog open onClose={() => { if (!quickSaving) setQuickKind(null); }}
      title={quickKind === "device_type" ? "Novo tipo de aparelho" : "Nova marca de aparelho"} className="max-w-md"
      footer={<div className="flex justify-end gap-2">
        <AdminButton type="button" variant="secondary" disabled={quickSaving} onClick={() => setQuickKind(null)}>Cancelar</AdminButton>
        <AdminButton type="button" loading={quickSaving} loadingText="Criando..." disabled={!quickName.trim()} onClick={() => void saveQuick()}>Criar</AdminButton>
      </div>}>
      <FInput label={quickKind === "device_type" ? "Nome do tipo de aparelho" : "Nome da marca do aparelho"}
        value={quickName} disabled={quickSaving} error={quickError} maxLength={quickKind === "device_type" ? 60 : 80}
        placeholder={quickKind === "device_type" ? "Ex.: Televisão" : "Ex.: Samsung"}
        onChange={(event: any) => { setQuickName(event.target.value); setQuickError(""); }}
        onKeyDown={(event: any) => { if (event.key === "Enter") { event.preventDefault(); void saveQuick(); } }}/>
    </AdminDialog>}
  </div>;
}
