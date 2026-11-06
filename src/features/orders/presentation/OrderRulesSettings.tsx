import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { useOrganizationOrderRules } from "../application/useOrganizationOrderRules";
import {
  findRuleRow, resolveRules, fieldLabels, photoLabels,
  type RuleItem, type RuleSet, type Scope, type CustomField,
} from "../domain/order-rules";
import { OrderCustomFieldsEditor } from "./OrderCustomFieldsEditor";
import { saveOrderRules, removeOrderRules } from "../infrastructure/order-rules.repository";

const modes = [{ value: "required", label: "Obrigatório" }, { value: "optional", label: "Opcional" }, { value: "hidden", label: "Oculto" }];
const stages = [{ value: "create", label: "Criar OS" }, { value: "start", label: "Iniciar serviço" }, { value: "finish", label: "Concluir OS" }];
const scopes = [
  { value: "company", label: "Geral da empresa" },
  { value: "service_type", label: "Tipo de atendimento" },
  { value: "equipment_type", label: "Equipamento" },
  { value: "combination", label: "Atendimento + equipamento" },
];

const fieldDescriptions: Record<string, string> = {
  customer_notes: "Relato do problema informado pelo cliente.",
  equipment_type_id: "Tipo do equipamento recebido para atendimento.",
  equipment_brand_id: "Marca do equipamento cadastrado na OS.",
  equipment_model_id: "Modelo correspondente ao equipamento.",
  serial_number: "Identificação ou número de série do equipamento.",
  accessories: "Itens e acessórios entregues junto com o equipamento.",
  internal_notes: "Observações registradas para uso interno.",
  external_os_number: "Referência da ordem de serviço externa.",
  diagnosis: "Resultado da análise técnica do equipamento.",
  solution: "Solução proposta ou executada no atendimento.",
};
const photoDescriptions: Record<string, string> = {
  label: "Registro da etiqueta do equipamento.",
  equipment: "Fotos que documentam o equipamento atendido.",
};

type DraftEntry = {
  scope: Scope;
  serviceId: string | null;
  equipmentId: string | null;
  rules: Partial<RuleSet>;
};
const draftKey = (scope: Scope, serviceId: string | null, equipmentId: string | null) =>
  JSON.stringify([scope, serviceId, equipmentId]);

export type OrderRulesSettingsHandle = {
  saveChanges: () => Promise<void>;
};

export const OrderRulesSettings = forwardRef<OrderRulesSettingsHandle, {
  organizationId: string;
  canEdit: boolean;
  disabled?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onLoadingChange?: (loading: boolean) => void;
}>(function OrderRulesSettings({ organizationId, canEdit, disabled = false, onDirtyChange, onLoadingChange }, ref) {
  const client = useQueryClient();
  const rulesQuery = useOrganizationOrderRules(organizationId);
  const catalog = useQuery({
    queryKey: ["order-rules-catalog", organizationId],
    queryFn: async () => {
      const [types, equipment] = await Promise.all([
        supabase.from("service_types").select("id,title").eq("organization_id", organizationId).order("title"),
        supabase.from("equipment_types").select("id,name").eq("organization_id", organizationId).order("name"),
      ]);
      if (types.error) throw types.error;
      if (equipment.error) throw equipment.error;
      return { types: types.data || [], equipment: equipment.data || [] };
    },
    staleTime: 120_000,
  });

  const [scope, setScope] = useState<Scope>("company");
  const [serviceId, setServiceId] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  // As edições ficam em memória por escopo até o usuário clicar no Salvar do modal.
  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>({});
  const [message, setMessage] = useState("");
  const serviceKey = scope === "service_type" || scope === "combination" ? serviceId || null : null;
  const equipmentKey = scope === "equipment_type" || scope === "combination" ? equipmentId || null : null;
  const configured = scope === "company" ||
    (scope === "service_type" && Boolean(serviceKey)) ||
    (scope === "equipment_type" && Boolean(equipmentKey)) ||
    (scope === "combination" && Boolean(serviceKey && equipmentKey));
  const rows = rulesQuery.data || [];
  const selectedKey = draftKey(scope, serviceKey, equipmentKey);
  const currentRow = findRuleRow(rows, scope, serviceKey, equipmentKey);
  const currentDraft = drafts[selectedKey]?.rules ?? currentRow?.rules ?? {};

  const preview = resolveRules([
    ...rows.filter(item => item.id !== currentRow?.id),
    {
      organization_id: organizationId,
      scope,
      service_type_id: serviceKey,
      equipment_type_id: equipmentKey,
      rules: currentDraft,
    },
  ], serviceKey, equipmentKey);

  const changedEntries = useMemo(() =>
    Object.entries(drafts).filter(([, entry]) => {
      const saved = findRuleRow(rows, entry.scope, entry.serviceId, entry.equipmentId)?.rules || {};
      return JSON.stringify(entry.rules) !== JSON.stringify(saved);
    }), [drafts, rows]);

  const loading = rulesQuery.isLoading || catalog.isLoading;
  const canModify = canEdit && !disabled && !loading && !rulesQuery.error && !catalog.error;
  useEffect(() => { onDirtyChange?.(changedEntries.length > 0); }, [changedEntries.length, onDirtyChange]);
  useEffect(() => { onLoadingChange?.(loading); }, [loading, onLoadingChange]);
  useEffect(() => { setDrafts({}); setScope("company"); setServiceId(""); setEquipmentId(""); }, [organizationId]);

  const editCurrent = (next: Partial<RuleSet>) => {
    if (!canModify || !configured) return;
    setMessage("");
    setDrafts(current => ({
      ...current,
      [selectedKey]: { scope, serviceId: serviceKey, equipmentId: equipmentKey, rules: next },
    }));
  };
  const editRule = (group: "fields" | "photos", key: string, patch: Partial<RuleItem>) => {
    const original = preview[group][key] || { mode: "optional", stage: "create" };
    editCurrent({
      ...currentDraft,
      [group]: {
        ...currentDraft[group],
        [key]: { ...original, ...currentDraft[group]?.[key], ...patch },
      },
    });
  };
  const setCustom = (custom_fields: CustomField[]) => editCurrent({ ...currentDraft, custom_fields });

  useImperativeHandle(ref, () => ({
    saveChanges: async () => {
      if (!changedEntries.length) return;
      if (!canEdit || loading || rulesQuery.error || catalog.error) throw new Error("As regras da OS ainda não estão disponíveis para salvar.");
      // Envia exclusivamente os escopos modificados; os outros permanecem intocados.
      let savedAny = false;
      try {
        for (const [key, entry] of changedEntries) {
          const savedRow = findRuleRow(rows, entry.scope, entry.serviceId, entry.equipmentId);
          if (!Object.keys(entry.rules).length) {
            if (savedRow?.id) await removeOrderRules(organizationId, savedRow.id);
          } else {
            await saveOrderRules(organizationId, entry.scope, entry.serviceId, entry.equipmentId, entry.rules);
          }
          savedAny = true;
          setDrafts(previous => {
            const next = { ...previous };
            // Não descarta alterações feitas durante a gravação.
            if (next[key] === entry) delete next[key];
            return next;
          });
        }
      } finally {
        // Se algum escopo foi gravado antes de uma falha, refaz a leitura para
        // mostrar os dados atualizados sem perder os rascunhos restantes.
        if (savedAny) await client.invalidateQueries({ queryKey: ["organization-order-rules", organizationId] });
      }
    },
  }), [changedEntries, canEdit, loading, rulesQuery.error, catalog.error, rows, organizationId, client]);

  return <div className="space-y-6">
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-bold text-foreground">Regras e campos da OS</h3>
        <p className="max-w-md text-xs text-muted-foreground">Defina os campos exigidos em cada etapa do atendimento.</p>
      </div>
      <label className="w-full min-w-0 space-y-1 sm:w-[250px]">
        <span className="block text-xs font-semibold text-foreground">Aplicar a</span>
        <AdminSelect ariaLabel="Aplicar a" value={scope} options={scopes} disabled={disabled}
          onValueChange={value => { setScope(value as Scope); setMessage(""); }} />
      </label>
    </div>

    {(scope !== "company") && <div className="grid gap-3 sm:grid-cols-2">
      {(scope === "service_type" || scope === "combination") && <label className="min-w-0 space-y-1">
        <span className="block text-xs font-semibold text-foreground">Tipo de atendimento</span>
        <AdminSelect ariaLabel="Tipo de atendimento" value={serviceId} disabled={disabled}
          options={[{ value: "", label: "Selecionar..." }, ...(catalog.data?.types || []).map(item => ({ value: item.id, label: item.title }))]}
          onValueChange={setServiceId} />
      </label>}
      {(scope === "equipment_type" || scope === "combination") && <label className="min-w-0 space-y-1">
        <span className="block text-xs font-semibold text-foreground">Equipamento</span>
        <AdminSelect ariaLabel="Equipamento" value={equipmentId} disabled={disabled}
          options={[{ value: "", label: "Selecionar..." }, ...(catalog.data?.equipment || []).map(item => ({ value: item.id, label: item.name }))]}
          onValueChange={setEquipmentId} />
      </label>}
    </div>}

    {loading && <p className="text-sm text-muted-foreground">Carregando configurações...</p>}
    {(rulesQuery.error || catalog.error) && <p role="alert" className="text-sm text-destructive">Não foi possível carregar as configurações: {systemErrorMessage(rulesQuery.error || catalog.error)}</p>}
    {!configured && !loading && <p className="text-sm text-muted-foreground">Selecione os campos de aplicação para configurar as regras.</p>}

    {configured && !loading && !rulesQuery.error && !catalog.error && <>
      <section className="space-y-3">
        <h4 className="border-b border-border pb-2 text-sm font-semibold text-foreground">Campos da OS</h4>
        <div className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          {Object.entries(fieldLabels).map(([key, title]) => <div key={key} className="min-w-0 space-y-3 border-b border-border pb-4">
            <div className="min-h-[48px]">
              <h5 className="text-sm font-semibold text-foreground">{title}</h5>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{fieldDescriptions[key]}</p>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <label className="min-w-0 space-y-1">
                <span className="block text-[11px] font-semibold text-muted-foreground">Exigência</span>
                <AdminSelect ariaLabel={"Exigência: " + title} value={preview.fields[key]?.mode || "optional"}
                  disabled={!canModify} options={modes}
                  onValueChange={value => editRule("fields", key, { mode: value as RuleItem["mode"] })} />
              </label>
              <label className="min-w-0 space-y-1">
                <span className="block text-[11px] font-semibold text-muted-foreground">Etapa</span>
                <AdminSelect ariaLabel={"Etapa: " + title}
                  value={key === "diagnosis" || key === "solution" ? "finish" : preview.fields[key]?.stage || "create"}
                  disabled={!canModify || key === "diagnosis" || key === "solution"}
                  options={key === "diagnosis" || key === "solution" ? [stages[2]] : stages}
                  onValueChange={value => editRule("fields", key, { stage: value as RuleItem["stage"] })} />
              </label>
            </div>
          </div>)}
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="border-b border-border pb-2 text-sm font-semibold text-foreground">Fotos e evidências</h4>
        <div className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          {Object.entries(photoLabels).map(([key, title]) => <div key={key} className="min-w-0 space-y-3 border-b border-border pb-4">
            <div>
              <h5 className="text-sm font-semibold text-foreground">{title}</h5>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{photoDescriptions[key]}</p>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <label className="min-w-0 space-y-1">
                <span className="block text-[11px] font-semibold text-muted-foreground">Exigência</span>
                <AdminSelect ariaLabel={"Exigência: " + title} value={preview.photos[key]?.mode || "optional"}
                  disabled={!canModify} options={modes}
                  onValueChange={value => editRule("photos", key, { mode: value as RuleItem["mode"] })} />
              </label>
              <label className="min-w-0 space-y-1">
                <span className="block text-[11px] font-semibold text-muted-foreground">Etapa</span>
                <AdminSelect ariaLabel={"Etapa: " + title} value={preview.photos[key]?.stage || "create"}
                  disabled={!canModify} options={stages}
                  onValueChange={value => editRule("photos", key, { stage: value as RuleItem["stage"] })} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              Quantidade mínima
              <input type="number" min={1} max={20} aria-label={"Quantidade mínima: " + title}
                disabled={!canModify} value={preview.photos[key]?.minCount || 1}
                onChange={event => editRule("photos", key, { minCount: Math.max(1, Math.min(20, Number(event.target.value) || 1)) })}
                className="h-10 w-20 rounded-lg border border-border bg-card px-2 text-center text-sm text-foreground" />
            </label>
          </div>)}
        </div>
      </section>

      <OrderCustomFieldsEditor fields={preview.custom_fields} onChange={setCustom} disabled={!canModify} />
      <div className="flex justify-start">
        <BtnSecondary disabled={!canModify} onClick={() => {
          editCurrent({});
          setMessage("Padrão selecionado. Clique em Salvar para aplicar.");
        }}>Restaurar padrão</BtnSecondary>
      </div>
    </>}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </div>;
});
