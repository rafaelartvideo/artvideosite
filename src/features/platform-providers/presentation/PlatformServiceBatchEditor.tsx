import { useRef, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { AdminButton, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import type { PlatformServiceBatchItem } from "../infrastructure/platform-providers.repository";

type Row = { id: number; name: string };
type BatchMode = "equipment" | "standalone";
const inputClass = "h-10 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary";

export function PlatformServiceBatchEditor({
  equipmentSuggestions, onCreateBatch, loading, initialEquipmentName = "", initialMode = "equipment",
}: {
  equipmentSuggestions: string[];
  onCreateBatch: (items: PlatformServiceBatchItem[]) => Promise<boolean>;
  loading: boolean;
  initialEquipmentName?: string;
  initialMode?: BatchMode;
}) {
  const idRef = useRef(2);
  const [equipmentOpen, setEquipmentOpen] = useState(initialMode === "equipment");
  const [standaloneOpen, setStandaloneOpen] = useState(initialMode === "standalone");
  const [equipmentName, setEquipmentName] = useState(initialEquipmentName);
  const [categories, setCategories] = useState<Row[]>([{ id: 0, name: "" }]);
  const [standalone, setStandalone] = useState<Row[]>([{ id: 1, name: "" }]);
  const rowsFor = (mode: BatchMode) => mode === "equipment" ? categories : standalone;
  const setterFor = (mode: BatchMode) => mode === "equipment" ? setCategories : setStandalone;
  const addRow = (mode: BatchMode) => setterFor(mode)(rows => [...rows, { id: idRef.current++, name: "" }]);
  const removeRow = (mode: BatchMode, id: number) =>
    setterFor(mode)(rows => rows.filter(row => row.id !== id));
  const updateRow = (mode: BatchMode, id: number, name: string) =>
    setterFor(mode)(rows => rows.map(row => row.id === id ? { ...row, name } : row));

  const submit = async (mode: BatchMode) => {
    const rows = rowsFor(mode).map(row => row.name.trim()).filter(Boolean);
    if (!rows.length) {
      notifyAdmin("Informe ao menos um serviço ou subcategoria.", "error");
      return;
    }
    const equipment = equipmentName.trim();
    if (mode === "equipment" && equipment.length < 2) {
      notifyAdmin("Informe o equipamento ou categoria antes de cadastrar.", "error");
      return;
    }
    const items = rows.map(name => ({
      name, equipment_name: mode === "equipment" ? equipment : null,
    }));
    const saved = await onCreateBatch(items);
    if (!saved) return; // Preserva o lote para corrigir nomes repetidos ou erros.
    setterFor(mode)([{ id: idRef.current++, name: "" }]);
    if (mode === "equipment") setEquipmentName(initialEquipmentName);
  };

  const fields = (mode: BatchMode) => {
    const rows = rowsFor(mode);
    const category = mode === "equipment";
    return <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row, index) => <div className="flex min-w-0 items-center gap-1.5" key={row.id}>
        <input
          className={inputClass}
          maxLength={120}
          aria-label={category ? "Subcategoria " + (index + 1) : "Serviço avulso " + (index + 1)}
          placeholder={category ? "Ex.: Instalação, Reparo..." : "Ex.: Pedreiro, Pintor..."}
          value={row.name}
          onChange={event => updateRow(mode, row.id, event.target.value)}
        />
        {index === rows.length - 1 ?
          <AdminIconButton variant="tertiary" className="h-10 w-10 shrink-0" disabled={loading || rows.length >= 50}
            ariaLabel={category ? "Adicionar outra subcategoria" : "Adicionar outro serviço"}
            onClick={() => addRow(mode)}><Plus size={16}/></AdminIconButton> :
          <AdminIconButton variant="danger" className="h-10 w-10 shrink-0" disabled={loading}
            ariaLabel={category ? "Remover subcategoria" : "Remover serviço"}
            onClick={() => removeRow(mode, row.id)}><X size={16}/></AdminIconButton>}
      </div>)}
    </div>;
  };

  return <div className="space-y-3">
    <section className="overflow-hidden rounded-lg border border-border">
      <button type="button" aria-expanded={equipmentOpen} onClick={() => setEquipmentOpen(value => !value)}
        className="flex w-full items-center justify-between gap-2 bg-muted/30 px-3 py-3 text-left text-xs font-bold text-foreground">
        <span>Por equipamento / categoria</span>
        <ChevronDown size={17} className={"shrink-0 transition-transform " + (equipmentOpen ? "" : "-rotate-90")}/>
      </button>
      {equipmentOpen && <div className="space-y-3 border-t border-border p-3">
        <label className="block text-xs font-semibold text-muted-foreground" htmlFor="provider-batch-equipment">
          Equipamento
        </label>
        <input id="provider-batch-equipment" className={inputClass} maxLength={120}
          list="provider-batch-equipment-options" placeholder="Ex.: Ar-condicionado"
          value={equipmentName} onChange={event => setEquipmentName(event.target.value)}/>
        <datalist id="provider-batch-equipment-options">
          {equipmentSuggestions.map(name => <option key={name} value={name}/>)}
        </datalist>
        <p className="text-xs text-muted-foreground">Adicione várias subcategorias; cada uma será criada para o equipamento informado.</p>
        {fields("equipment")}
        <div className="flex justify-end">
          <AdminButton size="sm" loading={loading} disabled={loading} onClick={() => void submit("equipment")}>
            Cadastrar subcategorias
          </AdminButton>
        </div>
      </div>}
    </section>
    <section className="overflow-hidden rounded-lg border border-border">
      <button type="button" aria-expanded={standaloneOpen} onClick={() => setStandaloneOpen(value => !value)}
        className="flex w-full items-center justify-between gap-2 bg-muted/30 px-3 py-3 text-left text-xs font-bold text-foreground">
        <span>Serviços avulsos / profissões</span>
        <ChevronDown size={17} className={"shrink-0 transition-transform " + (standaloneOpen ? "" : "-rotate-90")}/>
      </button>
      {standaloneOpen && <div className="space-y-3 border-t border-border p-3">
        <p className="text-xs text-muted-foreground">Cadastre várias profissões sem equipamento, como Pedreiro, Pintor ou Chaveiro.</p>
        {fields("standalone")}
        <div className="flex justify-end">
          <AdminButton size="sm" loading={loading} disabled={loading} onClick={() => void submit("standalone")}>
            Cadastrar serviços
          </AdminButton>
        </div>
      </div>}
    </section>
  </div>;
}
