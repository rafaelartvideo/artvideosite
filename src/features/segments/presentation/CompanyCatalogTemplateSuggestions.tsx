import { useEffect, useState } from "react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { BtnPrimary } from "@/shared/ui/admin/AdminLayout";
import {
  addTenantCatalogChecklistItem, loadTenantCatalogTemplates,
  type TenantCatalogTemplates,
} from "../infrastructure/company-catalog-enhancements.repository";

export function CompanyCatalogTemplateSuggestions({
  organizationId,equipmentCatalogId,canManageChecklists,onAdded,
}: {
  organizationId: string;
  equipmentCatalogId: string;
  canManageChecklists: boolean;
  onAdded: () => Promise<unknown>;
}) {
  const [templates,setTemplates] = useState<TenantCatalogTemplates>({ technical: [],checklists: [] });
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState("");
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");

  useEffect(() => {
    let live=true;
    setLoading(true);setError("");setNotice("");
    void loadTenantCatalogTemplates(organizationId,equipmentCatalogId)
      .then(data => { if(live)setTemplates(data); })
      .catch(cause => { if(live)setError(systemErrorMessage(cause,"Não foi possível carregar os templates oficiais.")); })
      .finally(() => { if(live)setLoading(false); });
    return () => {live=false;};
  },[organizationId,equipmentCatalogId]);

  const addChecklist = async (id: string) => {
    if (!canManageChecklists || busy) return;
    setBusy(id); setError(""); setNotice("");
    try {
      await addTenantCatalogChecklistItem(organizationId,equipmentCatalogId,id);
      const [next] = await Promise.all([
        loadTenantCatalogTemplates(organizationId,equipmentCatalogId),
        onAdded(),
      ]);
      setTemplates(next);
      setNotice("Item de checklist adicionado sem substituir as configurações existentes.");
    } catch(cause) {
      setError(systemErrorMessage(cause,"Não foi possível adicionar o item de checklist."));
    } finally { setBusy(""); }
  };

  return <section className="space-y-3 rounded-lg border border-border bg-background p-4 text-card-foreground">
    <h3 className="text-sm font-extrabold">Templates oficiais deste equipamento</h3>
    <p className="text-xs leading-5 text-muted-foreground">
      Campos técnicos oficiais são vinculados automaticamente ao equipamento. Checklists podem ser configurados separadamente, sem substituir os perfis e etapas existentes.
    </p>
    {loading && <p className="text-sm text-muted-foreground">Carregando templates...</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    {!loading && <>
      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Campos técnicos ({templates.technical.length})
        </h4>
        {templates.technical.length === 0 && <p className="text-xs text-muted-foreground">Nenhum campo técnico oficial publicado.</p>}
        {templates.technical.map(field => <div key={field.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-b-0">
          <div>
            <p className="text-sm font-semibold">{field.label}</p>
            <p className="text-xs text-muted-foreground">{field.field_key} · {field.field_type === "number" ? "Número" : "Texto"}{field.required ? " · Obrigatório" : ""}</p>
          </div>
          <span className={field.applied ? "text-xs font-semibold text-green-700" : "text-xs font-semibold text-amber-700"}>
            {field.applied ? "Sincronizado" : "Pendente — verificar conflito"}
          </span>
        </div>)}
      </div>
      <div className="space-y-2 border-t border-border pt-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Checklists sugeridos ({templates.checklists.length})
        </h4>
        {templates.checklists.length === 0 && <p className="text-xs text-muted-foreground">Nenhum item de checklist oficial publicado.</p>}
        {templates.checklists.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm last:border-b-0">
          <div>
            <p className="font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">Etapa: {item.stage_code} · {item.is_required ? "Obrigatório" : "Opcional"}</p>
            {!item.can_apply && !item.applied && <p className="text-xs text-amber-700">Configure no equipamento um perfil de checklist com essa etapa.</p>}
          </div>
          {item.applied
            ? <span className="text-xs font-semibold text-green-700">Adicionado</span>
            : <BtnPrimary size="sm" disabled={!canManageChecklists || !item.can_apply || Boolean(busy)}
              loading={busy===item.id} onClick={() => void addChecklist(item.id)}>Adicionar item</BtnPrimary>}
        </div>)}
      </div>
    </>}
  </section>;
}
