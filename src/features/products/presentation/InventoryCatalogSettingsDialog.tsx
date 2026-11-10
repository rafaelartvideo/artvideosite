import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Settings2, X } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect, FInput } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import {
  createInventoryCatalogOption,
  listInventoryCatalogSettings,
  updateInventoryCatalogOption,
  type InventoryCatalogKind,
} from "../infrastructure/inventory-catalog-settings.repository";

const sections: Array<{ key: InventoryCatalogKind; title: string; placeholder: string }> = [
  { key: "category", title: "Categorias", placeholder: "Ex.: Controles remotos" },
  { key: "subcategory", title: "Subcategorias", placeholder: "Ex.: Controles para TV" },
  { key: "device_type", title: "Tipos de aparelho", placeholder: "Ex.: TV" },
  { key: "device_brand", title: "Marcas de aparelho", placeholder: "Ex.: Samsung" },
  { key: "brand", title: "Marcas do item", placeholder: "Ex.: Elgin" },
];

export function InventoryCatalogSettingsDialog({
  organizationId, onClose, onChanged, canManageCategories, canManageBrands, canEditItems,
}: {
  organizationId: string;
  onClose: () => void;
  onChanged: () => void;
  canManageCategories: boolean;
  canManageBrands: boolean;
  canEditItems: boolean;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["inventory", "catalog-settings", organizationId],
    queryFn: () => listInventoryCatalogSettings(organizationId),
    enabled: Boolean(organizationId),
    staleTime: 20_000,
  });
  const [selected, setSelected] = useState<InventoryCatalogKind>("category");
  const [name, setName] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const settings = query.data;
  const entries = selected === "category" ? settings?.categories || []
    : selected === "subcategory" ? settings?.subcategories || []
      : selected === "brand" ? settings?.brands || []
        : selected === "device_type" ? settings?.deviceTypes || []
          : settings?.deviceBrands || [];
  const section = sections.find(item => item.key === selected)!;
  const allowed = selected === "category" ? canManageCategories
    : selected === "brand" ? canManageBrands
      : selected === "subcategory" || selected === "device_type"
        ? canManageCategories || canEditItems
        : canManageBrands || canEditItems;
  const visible = selected === "subcategory"
    ? entries.filter(entry => !parentCategoryId || entry.category_id === parentCategoryId)
    : entries;
  const categories = (settings?.categories || []).filter(item => item.is_active || item.id === parentCategoryId);
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["inventory", "catalog-settings", organizationId] });
    onChanged();
  };

  const add = async () => {
    if (!allowed || saving || !name.trim()) return;
    setSaving(true); setError("");
    try {
      await createInventoryCatalogOption(organizationId, selected, name, parentCategoryId || undefined);
      setName("");
      await refresh();
    } catch (cause) {
      setError(systemErrorMessage(cause, "Não foi possível salvar o cadastro."));
    } finally { setSaving(false); }
  };

  const update = async (id: string, patch: { name?: string; is_active?: boolean }) => {
    if (!allowed || saving) return;
    setSaving(true); setError("");
    try {
      await updateInventoryCatalogOption(organizationId, selected, id, patch);
      setEditingId(null);
      await refresh();
    } catch (cause) {
      setError(systemErrorMessage(cause, "Não foi possível atualizar o cadastro."));
    } finally { setSaving(false); }
  };

  return <AdminDialog
    open
    preparing={query.isPending}
    preparingText="Preparando configurações do estoque..."
    preparingError={query.isError ? systemErrorMessage(query.error, "Não foi possível carregar as configurações do estoque.") : null}
    onRetryPreparing={() => { void query.refetch(); }}
    onClose={() => { if (!saving) onClose(); }}
    title="Configurações do Estoque"
    description="Organize os cadastros da empresa usados na identificação e compatibilidade dos produtos."
    className="w-[min(96vw,840px)] max-w-4xl"
    bodyClassName="space-y-4 !p-3 sm:!p-4"
    footer={<div className="flex justify-end"><AdminButton variant="secondary" onClick={onClose} disabled={saving}>Fechar</AdminButton></div>}
  >
    <nav className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Tipos de configuração do estoque">
      {sections.map(item => <button key={item.key} type="button" aria-pressed={selected === item.key}
        onClick={() => { setSelected(item.key); setName(""); setEditingId(null); setError(""); }}
        className={"min-h-10 rounded-lg border px-2 py-2 text-xs font-bold transition-colors "
          + (selected === item.key ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
        {item.title}
      </button>)}
    </nav>
    {query.isPending ? <LoadingState text="Carregando configurações..." /> : query.isError
      ? <p role="alert" className="text-sm text-destructive">{systemErrorMessage(query.error, "Erro ao carregar os cadastros.")}</p>
      : <Section title={section.title} contentClassName="space-y-4 !p-3 sm:!p-4">
        {selected === "subcategory" && <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Categoria principal</p>
          <AdminSelect ariaLabel="Categoria principal da subcategoria" value={parentCategoryId}
            onValueChange={value => { setParentCategoryId(value); setEditingId(null); }}
            options={[{ value: "", label: "Selecione uma categoria" }, ...categories.map(c => ({ value: c.id, label: c.name }))]} />
        </div>}
        {allowed && <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1"><FInput label={"Novo cadastro"} placeholder={section.placeholder}
            value={name} disabled={saving || (selected === "subcategory" && !parentCategoryId)}
            onChange={(event: any) => setName(event.target.value)}
            onKeyDown={(event: any) => { if (event.key === "Enter") { event.preventDefault(); void add(); } }} /></div>
          <AdminButton ariaLabel={"Adicionar " + section.title.toLowerCase()} disabled={saving || !name.trim() || (selected === "subcategory" && !parentCategoryId)}
            className="h-[42px] shrink-0" onClick={() => void add()}><Plus size={16}/> Adicionar</AdminButton>
        </div>}
        <div className="divide-y divide-border rounded-lg border border-border">
          {visible.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {selected === "subcategory" && !parentCategoryId ? "Escolha uma categoria para consultar suas subcategorias." : "Nenhum cadastro encontrado."}
          </p>}
          {visible.map(item => <div key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            {editingId === item.id ? <div className="flex min-w-0 flex-1 items-center gap-2">
              <input aria-label="Editar nome" className="admin-input h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm"
                value={editingName} onChange={event => setEditingName(event.target.value)} />
              <AdminButton size="sm" ariaLabel="Salvar nome" disabled={saving || !editingName.trim()}
                onClick={() => void update(item.id, { name: editingName })}><Check size={15}/></AdminButton>
              <AdminButton size="sm" variant="secondary" ariaLabel="Cancelar edição" onClick={() => setEditingId(null)}><X size={15}/></AdminButton>
            </div> : <>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold text-foreground">{item.name}</p>
                <p className={"text-[11px] " + (item.is_active ? "text-emerald-600" : "text-muted-foreground")}>{item.is_active ? "Ativo" : "Inativo"}</p>
              </div>
              {allowed && <>
                <button type="button" aria-label={"Editar " + item.name} disabled={saving}
                  onClick={() => { setEditingId(item.id); setEditingName(item.name); }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/25 text-primary hover:bg-primary/5"><Pencil size={15}/></button>
                <AdminButton size="sm" variant={item.is_active ? "quaternary" : "tertiary"} disabled={saving}
                  onClick={() => void update(item.id, { is_active: !item.is_active })}>
                  {item.is_active ? "Inativar" : "Ativar"}
                </AdminButton>
              </>}
            </>}
          </div>)}
        </div>
        {error && <p role="alert" className="text-xs font-semibold text-destructive">{error}</p>}
        {!allowed && <p className="text-xs text-muted-foreground">Você pode visualizar os cadastros, mas não tem permissão para alterá-los.</p>}
      </Section>}
  </AdminDialog>;
}
