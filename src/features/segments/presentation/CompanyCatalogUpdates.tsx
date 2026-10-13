import { useEffect, useState } from "react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import {
  loadTenantCatalogNameUpdates, reviewTenantCatalogNameUpdate,
  type CatalogNameUpdate, type CatalogNameUpdates,
} from "../infrastructure/company-catalog-enhancements.repository";

export function CompanyCatalogUpdates({
  organizationId, canEdit, onUpdated,
}: {
  organizationId: string; canEdit: boolean; onUpdated: () => Promise<unknown>;
}) {
  const [updates, setUpdates] = useState<CatalogNameUpdates>({ equipment: [], brands: [] });
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = async () => {
    const result = await loadTenantCatalogNameUpdates(organizationId);
    setUpdates(result);
  };

  useEffect(() => {
    let live = true;
    setLoading(true); setError(""); setNotice("");
    void loadTenantCatalogNameUpdates(organizationId).then(result => {
      if (live) setUpdates(result);
    }).catch(cause => {
      if (live) setError(systemErrorMessage(cause, "Não foi possível consultar as atualizações oficiais."));
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [organizationId]);

  const review = async (kind: "equipment" | "brand", item: CatalogNameUpdate, action: "apply" | "keep") => {
    if (!canEdit || busyKey) return;
    if (action === "apply" && !window.confirm(
      `Aplicar o nome oficial "${item.official_name}" no cadastro local "${item.local_name}"?\n\nEste nome será usado nos cadastros atuais; registros históricos já salvos permanecerão inalterados.`
    )) return;
    setBusyKey(kind + item.id); setError(""); setNotice("");
    try {
      await reviewTenantCatalogNameUpdate(
        organizationId,kind,item.id,item.equipment_id || null,action,
      );
      await Promise.all([reload(),onUpdated()]);
      setNotice(action === "apply" ? "Nome oficial aplicado ao cadastro local." : "Personalização local mantida.");
    } catch (cause) {
      setError(systemErrorMessage(cause, "Não foi possível revisar esta atualização."));
    } finally { setBusyKey(""); }
  };

  const total = updates.equipment.length + updates.brands.length;
  const renderRow = (kind: "equipment" | "brand", item: CatalogNameUpdate) => <div
    key={kind + item.id} className="flex flex-col gap-3 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center">
    <div className="min-w-0 flex-1 space-y-1 text-sm">
      <p className="font-semibold">{item.local_name}</p>
      <p className="text-xs text-muted-foreground">Novo nome oficial: <strong>{item.official_name}</strong></p>
      <p className="text-xs text-muted-foreground">Versão anteriormente aceita: {item.previous_name || "não registrada"}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <BtnSecondary size="sm" disabled={!canEdit || Boolean(busyKey)}
        onClick={() => void review(kind,item,"keep")}>Manter meu nome</BtnSecondary>
      <BtnPrimary size="sm" disabled={!canEdit || Boolean(busyKey)}
        loading={busyKey === kind + item.id}
        onClick={() => void review(kind,item,"apply")}>Aplicar oficial</BtnPrimary>
    </div>
  </div>;

  return <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
    <div>
      <h2 className="text-base font-extrabold">Atualizações do Catálogo Union</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        A Union poderá atualizar os nomes oficiais, mas sua empresa decide quando aplicá-los.
        Mudanças não alteram checklists, campos técnicos nem modelos.
      </p>
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    {loading ? <p className="text-sm text-muted-foreground">Verificando atualizações...</p>
      : total === 0 ? <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        Nenhuma atualização de nome pendente.
      </p> : <>
        <p className="text-xs font-semibold text-muted-foreground">{total} atualização(ões) aguardando revisão</p>
        {updates.equipment.length > 0 && <div>
          <h3 className="text-sm font-bold">Equipamentos</h3>
          {updates.equipment.map(item => renderRow("equipment",item))}
        </div>}
        {updates.brands.length > 0 && <div>
          <h3 className="text-sm font-bold">Marcas</h3>
          {updates.brands.map(item => renderRow("brand",item))}
        </div>}
      </>}
  </section>;
}
