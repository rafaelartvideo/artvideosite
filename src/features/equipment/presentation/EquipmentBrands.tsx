import { useState } from "react";
import { Edit2, Plus, Search, Trash2 } from "lucide-react";
import type { EquipmentBrandRow, EquipmentDraft, EquipmentDraftModel, EquipmentTypeRow } from "../domain/equipment";
import type { EquipmentBrandDirectoryEntry } from "../infrastructure/equipment.repository";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { AdminCard, AdminIconButton, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FInput, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { StatusBadge } from "@/shared/ui/admin/AdminFeedback";

export function brandKey(value: string) {
  return value.trim().replace(/\s+/g, " ").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

/** Marcas únicas por nome, sem distinguir origens na interface. */
export function buildEquipmentBrandChoices(localBrands: EquipmentBrandRow[], names: string[]): EquipmentBrandDirectoryEntry[] {
  const choices = new Map<string, string>();
  for (const name of names) {
    const key = brandKey(name);
    if (key && !choices.has(key)) choices.set(key, name.trim());
  }
  for (const brand of localBrands) {
    const key = brandKey(brand.name);
    if (key) choices.set(key, brand.name.trim());
  }
  return [...choices.values()].sort((a,b) => a.localeCompare(b,"pt-BR")).map(name => ({ name }));
}

type BrandSelectorProps = {
  draft: EquipmentDraft;
  choices: EquipmentBrandDirectoryEntry[];
  canEdit: boolean;
  canCreate: boolean;
  onToggleBrand: (name: string, selected: boolean) => void;
};

/** Cadastro rápido no cabeçalho da seção, sem rótulos duplicados. */
export function EquipmentBrandCreate({ onCreate, disabled }: {
  onCreate: (name: string) => void;
  disabled: boolean;
}) {
  const [name, setName] = useState("");
  const add = () => {
    const normalized = name.trim().replace(/\s+/g, " ");
    if (!normalized || disabled) return;
    onCreate(normalized);
    setName("");
  };
  return <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
    <input className={INPUT + " min-w-[135px] max-w-[220px]"} aria-label="Nova marca"
      placeholder="Nova marca" value={name} disabled={disabled}
      onChange={event => setName(event.target.value)}
      onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
    <BtnSecondary onClick={add} disabled={disabled || !name.trim()}><Plus size={14} /> Adicionar</BtnSecondary>
  </div>;
}

export function EquipmentBrandSelector({ draft, choices, canEdit, canCreate, onToggleBrand }: BrandSelectorProps) {
  const [search, setSearch] = useState("");
  const allChoices = new Map(choices.map(option => [brandKey(option.name), option]));
  for (const brand of draft.brands) allChoices.set(brandKey(brand.name), { name: brand.name });
  const visibleChoices = [...allChoices.values()]
    .filter(option => brandKey(option.name).includes(brandKey(search)))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

  return <div className="space-y-4">
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input className={INPUT + " pl-9"} value={search} onChange={event => setSearch(event.target.value)}
        placeholder="Buscar marca..." aria-label="Buscar marca" />
    </div>
    <div className="grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
      {visibleChoices.map(option => {
        const linked = draft.brands.find(item => brandKey(item.name) === brandKey(option.name));
        const checked = Boolean(linked?.is_active);
        const allowed = linked?.id ? canEdit : canCreate;
        return <label key={brandKey(option.name)}
          className="flex min-w-0 cursor-pointer items-center gap-3 py-2.5 text-xs text-foreground">
          <Checkbox checked={checked} disabled={!allowed}
            onCheckedChange={value => onToggleBrand(option.name, value === true)} />
          <span className="min-w-0 flex-1 break-words font-semibold">{option.name}</span>
        </label>;
      })}
    </div>
    {visibleChoices.length === 0 && <p className="py-3 text-xs text-muted-foreground">Nenhuma marca encontrada. Adicione uma no cabeçalho desta seção.</p>}
  </div>;
}

/** Um modelo sempre pertence a uma marca selecionada. */
export function EquipmentModelCreate({ brands, onCreate, disabled }: {
  brands: EquipmentDraft["brands"];
  onCreate: (brandIndex: number, name: string) => void;
  disabled: boolean;
}) {
  const [brandName, setBrandName] = useState("");
  const [modelName, setModelName] = useState("");
  const [error, setError] = useState("");
  const selectedBrands = brands.map((brand, index) => ({ brand, index }))
    .filter(({ brand }) => brand.is_active)
    .sort((a, b) => a.brand.name.localeCompare(b.brand.name, "pt-BR", { sensitivity: "base" }));
  const selection = selectedBrands.find(({ brand }) => brandKey(brand.name) === brandKey(brandName)) ?? selectedBrands[0];
  const add = () => {
    const normalized = modelName.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
    if (!normalized || !selection || disabled) return;
    if (selection.brand.models.some(model => brandKey(model.name) === brandKey(normalized))) {
      setError("Este modelo já está vinculado à marca selecionada.");
      return;
    }
    onCreate(selection.index, normalized);
    setModelName("");
    setError("");
  };
  return <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
    <select className={INPUT + " min-w-[130px] max-w-[190px]"} aria-label="Marca do novo modelo"
      value={selection ? selection.brand.name : ""} disabled={disabled || !selection}
      onChange={event => { setBrandName(event.target.value); setError(""); }}>
      {!selection && <option value="">Selecione uma marca</option>}
      {selectedBrands.map(({ brand, index }) => <option key={brand.id || index} value={brand.name}>{brand.name}</option>)}
    </select>
    <input className={INPUT + " min-w-[135px] max-w-[220px]"} aria-label="Novo modelo"
      placeholder="Novo modelo" value={modelName} disabled={disabled || !selection}
      onChange={event => { setModelName(event.target.value.toLocaleUpperCase("pt-BR")); setError(""); }}
      onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
    <BtnSecondary onClick={add} disabled={disabled || !selection || !modelName.trim()}><Plus size={14} /> Adicionar</BtnSecondary>
    {error && <span role="alert" className="w-full text-right text-xs text-red-600">{error}</span>}
  </div>;
}

export function EquipmentModelsSelector({ draft, canEdit, canCreate, canDelete, onUpdateModel, onRemoveModel, errorFor, clearError }: {
  draft: EquipmentDraft;
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
  onUpdateModel: (brandIndex: number, modelIndex: number, patch: Partial<EquipmentDraftModel>) => void;
  onRemoveModel: (brandIndex: number, modelIndex: number) => void;
  errorFor: (brandIndex: number, modelIndex?: number) => string | undefined;
  clearError: (brandIndex: number, modelIndex?: number) => void;
}) {
  const selected = draft.brands.map((brand, index) => ({ brand, index }))
    .filter(({ brand }) => brand.is_active)
    .sort((a, b) => a.brand.name.localeCompare(b.brand.name, "pt-BR", { sensitivity: "base" }));
  if (!selected.length) return <p className="rounded-lg bg-muted/50 p-4 text-xs text-muted-foreground">Selecione uma marca na seção Marcas para adicionar modelos.</p>;
  return <div className="grid gap-4 lg:grid-cols-2">
    {selected.map(({ brand, index: bi }) => <div key={brand.id || brandKey(brand.name)} className="rounded-lg bg-muted/30 p-3 sm:p-4">
      <div className="mb-3 text-sm font-bold text-foreground">{brand.name}</div>
      {errorFor(bi) && <p className="mb-2 text-xs text-red-600">{errorFor(bi)}</p>}
      {brand.models.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum modelo vinculado a esta marca.</p>
        : <div className="grid gap-3">{brand.models.map((model, index) => ({ model, index }))
          .sort((a, b) => a.model.name.localeCompare(b.model.name, "pt-BR", { sensitivity: "base" }))
          .map(({ model, index: mi }, order) => <div key={model.id || "new-" + mi} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <FInput label={"Modelo " + (order + 1)} required value={model.name}
                disabled={model.id ? !canEdit : !canCreate} error={errorFor(bi, mi)}
                onChange={(event: any) => {
                  clearError(bi, mi);
                  onUpdateModel(bi, mi, { name: event.target.value.toLocaleUpperCase("pt-BR") });
                }} placeholder="Nome do modelo" />
            </div>
            {(model.id ? canDelete : canCreate) && <AdminIconButton ariaLabel="Remover modelo"
              title="Remover modelo" variant="danger" className="mb-0.5 h-10 w-10 shrink-0"
              onClick={() => onRemoveModel(bi, mi)}><Trash2 size={15} /></AdminIconButton>}
          </div>)}</div>}
    </div>)}
  </div>;
}

export function EquipmentBrandsDirectory({ choices, brands, types, onEditBrand, onToggleBrand, busyBrand = null }: {
  choices: EquipmentBrandDirectoryEntry[];
  brands: EquipmentBrandRow[];
  types: EquipmentTypeRow[];
  onEditBrand?: (name: string) => void;
  onToggleBrand?: (name: string, nextActive: boolean) => void;
  busyBrand?: string | null;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const equipmentById = new Map(types.map(type => [type.id,type.name]));
  const equipmentNames = (brandName: string) => [...new Set(
    brands.filter(brand => brandKey(brand.name) === brandKey(brandName))
      .map(brand => equipmentById.get(brand.equipment_type_id))
      .filter((value): value is string => Boolean(value))
  )].sort((a,b) => a.localeCompare(b,"pt-BR"));
  const text = brandKey(search);
  const filtered = choices.filter(item =>
    brandKey(item.name).includes(text) || equipmentNames(item.name).some(name => brandKey(name).includes(text))
  );
  const safePage = Math.min(page,Math.max(1,Math.ceil(filtered.length/pageSize)));
  const visible = filtered.slice((safePage-1)*pageSize,safePage*pageSize);
  return <div className="min-w-0 space-y-4">
    <div className="relative w-full min-w-0 sm:max-w-md">
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input className={INPUT + " h-10 pl-9"} value={search}
        onChange={event => { setSearch(event.target.value); setPage(1); }}
        placeholder="Buscar marca ou equipamento..." aria-label="Buscar marcas ou equipamentos" />
    </div>
    <AdminCard>
      {visible.length ? <div className="overflow-x-auto">
        <table className="min-w-[780px]">
          <thead><tr>
            <th className="w-[28%] text-left">Marca</th>
            <th className="text-left">Equipamentos</th>
            <th className="w-[120px] text-left">Status</th>
            <th className="w-[110px] text-right">Ações</th>
          </tr></thead>
          <tbody>{visible.map(item => {
            const linkedBrands = brands.filter(brand => brandKey(brand.name) === brandKey(item.name));
            const hasLocalLinks = linkedBrands.length > 0;
            const isActive = linkedBrands.some(brand => brand.is_active);
            const status = !hasLocalLinks ? "Disponível" : !isActive ? "Inativo" :
              linkedBrands.every(brand => brand.is_active) ? "Ativo" : "Parcial";
            return <tr key={brandKey(item.name)}>
              <td className="font-bold text-foreground">{item.name}</td>
              <td className="text-muted-foreground">{equipmentNames(item.name).join(", ") || "—"}</td>
              <td><StatusBadge status={status} /></td>
              <td>
                <div className="flex justify-end gap-1">
                  {hasLocalLinks && onEditBrand && <AdminIconButton ariaLabel={`Editar marca ${item.name}`}
                    title="Editar marca" disabled={busyBrand !== null} onClick={() => onEditBrand(item.name)}>
                    <Edit2 size={14} />
                  </AdminIconButton>}
                  {hasLocalLinks && onToggleBrand && <AdminActiveStateButton
                    active={isActive} entityLabel={`marca ${item.name}`} iconSize={14}
                    disabled={busyBrand !== null} loading={busyBrand === brandKey(item.name)}
                    onClick={() => onToggleBrand(item.name, !isActive)} />}
                  {(!hasLocalLinks || (!onEditBrand && !onToggleBrand)) && <span className="text-xs text-muted-foreground">—</span>}
                </div>
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma marca encontrada.</p>}
      <PaginationBar page={safePage} pageSize={pageSize} totalItems={filtered.length}
        onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
    </AdminCard>
  </div>;
}
