import { useState } from "react";
import { Edit2, Plus, Search, Trash2 } from "lucide-react";
import type { EquipmentBrandRow, EquipmentDraft, EquipmentDraftModel, EquipmentTypeRow } from "../domain/equipment";
import type { EquipmentBrandDirectoryEntry } from "../infrastructure/equipment.repository";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { AdminButton, AdminCard, AdminIconButton, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
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

type SelectorProps = {
  draft: EquipmentDraft;
  choices: EquipmentBrandDirectoryEntry[];
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
  onToggleBrand: (name: string, selected: boolean) => void;
  onAddModel: (brandIndex: number) => void;
  onUpdateModel: (brandIndex: number, modelIndex: number, patch: Partial<EquipmentDraftModel>) => void;
  onRemoveModel: (brandIndex: number, modelIndex: number) => void;
  errorFor: (brandIndex: number, modelIndex?: number) => string | undefined;
  clearError: (brandIndex: number, modelIndex?: number) => void;
};

export function EquipmentBrandSelector(props: SelectorProps) {
  const [search, setSearch] = useState("");
  const [customName, setCustomName] = useState("");
  const choices = new Map(props.choices.map(option => [brandKey(option.name), option]));
  for (const brand of props.draft.brands) choices.set(brandKey(brand.name), { name: brand.name });
  const visibleChoices = [...choices.values()]
    .filter(option => brandKey(option.name).includes(brandKey(search)))
    .sort((a,b) => a.name.localeCompare(b.name, "pt-BR"));
  const selected = props.draft.brands.flatMap((brand, index) => brand.is_active ? [{ brand, index }] : []).sort((a, b) => a.brand.name.localeCompare(b.brand.name, "pt-BR", { sensitivity: "base" }));
  const registerBrand = () => {
    const name = customName.trim().replace(/\s+/g, " ");
    if (!name) return;
    props.onToggleBrand(name, true);
    setCustomName("");
    setSearch("");
  };

  return <div className="space-y-4">
    <div>
      <h3 className="text-sm font-bold text-foreground">Marcas</h3>
    </div>
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input className={INPUT + " pl-9"} value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar marca..." aria-label="Buscar marca" />
    </div>
    <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
      {visibleChoices.map(option => {
        const linked = props.draft.brands.find(item => brandKey(item.name) === brandKey(option.name));
        const checked = Boolean(linked?.is_active);
        const allowed = linked?.id ? props.canEdit : checked ? props.canCreate : props.canCreate;
        return <label key={brandKey(option.name)}
          className="flex min-w-0 cursor-pointer items-center gap-3 border-b border-border py-3 text-xs text-foreground">
          <Checkbox checked={checked} disabled={!allowed} onCheckedChange={value => props.onToggleBrand(option.name, value === true)} />
          <span className="min-w-0 flex-1 break-words font-semibold">{option.name}</span>
        </label>;
      })}
    </div>
    {visibleChoices.length === 0 && <p className="py-3 text-xs text-muted-foreground">Nenhuma marca encontrada. Você pode cadastrar uma nova abaixo.</p>}
    {props.canCreate && <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <div className="min-w-[190px] flex-1"><FInput label="Nova marca" value={customName} onChange={(event: any) => setCustomName(event.target.value)} onKeyDown={(event: any) => { if (event.key === "Enter") { event.preventDefault(); registerBrand(); } }} placeholder="Nome da nova marca" /></div>
      <AdminButton variant="secondary" disabled={!customName.trim()} onClick={registerBrand}><Plus size={14} /> Adicionar marca</AdminButton>
    </div>}
    <div className="border-t border-border pt-4">
      <h3 className="text-sm font-bold text-foreground">Modelos</h3>
      {selected.length === 0 && <p className="mt-4 rounded-lg bg-muted/50 p-4 text-xs text-muted-foreground">Selecione pelo menos uma marca acima para adicionar modelos.</p>}
      <div className="mt-3 space-y-4">
        {selected.map(({ brand, index: bi }) => <div key={brand.id || brandKey(brand.name)} className="rounded-lg border border-border p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-foreground">{brand.name}</span>
            {props.canCreate && <BtnSecondary onClick={() => props.onAddModel(bi)}><Plus size={14} /> Adicionar modelo</BtnSecondary>}
          </div>
          {props.errorFor(bi) && <p className="mb-2 text-xs text-red-600">{props.errorFor(bi)}</p>}
          {brand.models.length === 0
            ? <p className="text-xs text-muted-foreground">Nenhum modelo cadastrado para esta marca neste equipamento.</p>
            : <div className="grid gap-2 md:grid-cols-2">{brand.models.map((model, index) => ({ model, index })).sort((a, b) => a.model.name.localeCompare(b.model.name, "pt-BR", { sensitivity: "base" })).map(({ model, index: mi }, order) => <div key={model.id || "new-" + mi} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <FInput label={"Modelo " + (order + 1)} required value={model.name}
                  disabled={model.id ? !props.canEdit : !props.canCreate}
                  error={props.errorFor(bi, mi)}
                  onChange={(event: any) => {
                    props.clearError(bi, mi);
                    props.onUpdateModel(bi, mi, { name: event.target.value.toLocaleUpperCase("pt-BR") });
                  }} placeholder="Nome do modelo" />
              </div>
              {(model.id ? props.canDelete : props.canCreate) && <AdminIconButton ariaLabel="Remover modelo" title="Remover modelo"
                variant="danger" className="mb-0.5 h-10 w-10 shrink-0"
                onClick={() => props.onRemoveModel(bi, mi)}><Trash2 size={15} /></AdminIconButton>}
            </div>)}</div>}
        </div>)}
      </div>
    </div>
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
