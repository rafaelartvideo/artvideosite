import { useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import type { EquipmentBrandRow, EquipmentDraft, EquipmentDraftModel, EquipmentModelRow, EquipmentTypeRow } from "../domain/equipment";
import type { EquipmentBrandDirectoryEntry } from "../infrastructure/equipment.repository";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { AdminButton, AdminCard, AdminIconButton, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FInput, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";

export function brandKey(value: string) {
  return value.trim().replace(/\s+/g, " ").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

/** A brand name is shared as a choice, never a cross-tenant equipment_brand_id. */
export function buildEquipmentBrandChoices(
  localBrands: EquipmentBrandRow[], unionNames: string[],
): EquipmentBrandDirectoryEntry[] {
  const result = new Map<string, EquipmentBrandDirectoryEntry>();
  for (const name of unionNames) {
    const key = brandKey(name);
    if (key && !result.has(key)) result.set(key, { name: name.trim(), source: "union" });
  }
  for (const brand of localBrands) {
    const key = brandKey(brand.name);
    if (!key) continue;
    const previous = result.get(key);
    // Prefer the company's spelling when the same name exists in both catalogs.
    result.set(key, { name: brand.name, source: previous ? "both" : "company" });
  }
  return [...result.values()].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
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
  const mergedChoices = buildEquipmentBrandChoices(
    props.draft.brands.map((brand, index) => ({
      id: brand.id || "draft-" + index,
      name: brand.name,
      equipment_type_id: props.draft.id || "",
      is_active: brand.is_active,
    })),
    props.choices.filter(option => option.source !== "company").map(option => option.name),
  );
  const allChoices = buildEquipmentBrandChoices(
    [
      ...props.choices.filter(option => option.source !== "union").map((option, index) => ({
        id: "option-" + index,
        name: option.name,
        equipment_type_id: "",
        is_active: true,
      })),
      ...props.draft.brands.map((brand, index) => ({
        id: brand.id || "selected-" + index,
        name: brand.name,
        equipment_type_id: props.draft.id || "",
        is_active: brand.is_active,
      })),
    ],
    [...props.choices.filter(option => option.source !== "company").map(option => option.name),
      ...mergedChoices.filter(option => option.source === "union").map(option => option.name)],
  );
  const visibleChoices = allChoices.filter(item => brandKey(item.name).includes(brandKey(search)));
  const selected = props.draft.brands.flatMap((brand, index) => brand.is_active ? [{ brand, index }] : []);
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
      <p className="mt-1 text-xs text-muted-foreground">Marque as marcas que trabalham com este equipamento. As marcas existentes são reutilizadas pelo nome, sem criar duplicatas.</p>
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
          {(option.source === "union" || option.source === "both") && <span className="shrink-0 text-[10px] text-muted-foreground">Union</span>}
        </label>;
      })}
    </div>
    {visibleChoices.length === 0 && <p className="py-3 text-xs text-muted-foreground">Nenhuma marca encontrada. Você pode cadastrar uma nova abaixo.</p>}
    {props.canCreate && <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <div className="min-w-[190px] flex-1"><FInput label="Nova marca" value={customName} onChange={(event: any) => setCustomName(event.target.value)} onKeyDown={(event: any) => { if (event.key === "Enter") { event.preventDefault(); registerBrand(); } }} placeholder="Nome da nova marca" /></div>
      <AdminButton variant="secondary" disabled={!customName.trim()} onClick={registerBrand}><Plus size={14} /> Adicionar marca</AdminButton>
    </div>}
    <div className="border-t border-border pt-4">
      <h3 className="text-sm font-bold text-foreground">Modelos das marcas selecionadas</h3>
      <p className="mt-1 text-xs text-muted-foreground">Depois de marcar uma marca, adicione os modelos usados por este equipamento. É possível marcar várias marcas.</p>
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
            : <div className="grid gap-2 md:grid-cols-2">{brand.models.map((model, mi) => <div key={model.id || "new-" + mi} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <FInput label={"Modelo " + (mi + 1)} required value={model.name}
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

export function EquipmentBrandsDirectory({ choices, brands, models, types }: {
  choices: EquipmentBrandDirectoryEntry[];
  brands: EquipmentBrandRow[];
  models: EquipmentModelRow[];
  types: EquipmentTypeRow[];
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const filtered = choices.filter(item => brandKey(item.name).includes(brandKey(search)));
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  return <AdminCard>
    <div className="mb-4">
      <p className="text-sm font-bold text-foreground">Marcas disponíveis ({choices.length})</p>
      <p className="mt-1 text-xs text-muted-foreground">Marcas da empresa e marcas oficiais da Union disponíveis para seleção. Para incluir uma marca nova, use o cadastro de equipamento.</p>
    </div>
    <div className="relative mb-3">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input className={INPUT + " pl-9"} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar marca..." aria-label="Buscar marca cadastrada" />
    </div>
    {visible.length ? <div className="overflow-x-auto"><table className="min-w-[520px] w-full text-xs">
      <thead><tr><th className="text-left">Marca</th><th className="text-left">Origem</th><th className="text-left">Equipamentos vinculados</th><th className="text-left">Modelos</th></tr></thead>
      <tbody>{visible.map(option => {
        const linked = brands.filter(brand => brandKey(brand.name) === brandKey(option.name));
        const equipmentNames = [...new Set(linked.map(brand => types.find(type => type.id === brand.equipment_type_id)?.name).filter(Boolean))];
        const ids = new Set(linked.map(brand => brand.id));
        return <tr key={brandKey(option.name)} className="border-b border-border">
          <td className="font-semibold text-foreground">{option.name}</td>
          <td>{option.source === "both" ? "Empresa e Union" : option.source === "union" ? "Union" : "Empresa"}</td>
          <td>{equipmentNames.join(", ") || "—"}</td>
          <td>{models.filter(model => ids.has(model.equipment_brand_id)).length}</td>
        </tr>;
      })}</tbody>
    </table></div> : <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma marca encontrada.</p>}
    <PaginationBar page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={setPage}
      onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
  </AdminCard>;
}
