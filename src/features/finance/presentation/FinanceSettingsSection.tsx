import { useEffect, useState } from "react";
import { FCurrencyInput, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard } from "@/shared/ui/admin/AdminLayout";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import { validateSecondApprovalThreshold } from "../domain/finance-foundation.mjs";

export function FinanceSettingsSection() {
  const finance = useFinanceFoundation();
  const [threshold, setThreshold] = useState("");
  const [cashSessionEnabled, setCashSessionEnabled] = useState(false);
  const [receivableCategoryId, setReceivableCategoryId] = useState("");
  const [payableCategoryId, setPayableCategoryId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const settings = finance.settingsQuery.data;
  const categories = finance.categoriesQuery.data || [];
  const costCenters = finance.costCentersQuery.data || [];

  useEffect(() => {
    if (!settings) return;
    setThreshold(settings.second_approval_threshold == null ? "" : Number(settings.second_approval_threshold).toFixed(2));
    setCashSessionEnabled(Boolean(settings.cash_session_enabled));
    setReceivableCategoryId(settings.default_receivable_category_id || "");
    setPayableCategoryId(settings.default_payable_category_id || "");
    setCostCenterId(settings.default_cost_center_id || "");
  }, [settings]);

  const save = async () => {
    const parsed = validateSecondApprovalThreshold(threshold) as { ok: boolean; value: number | null };
    if (!parsed.ok) { setMessage("Informe um limite de aprovação válido ou deixe o campo vazio."); setSuccess(""); return; }
    try {
      setMessage(""); setSuccess("");
      await finance.saveSettings.mutateAsync({ second_approval_threshold: parsed.value, cash_session_enabled: cashSessionEnabled, default_receivable_category_id: receivableCategoryId || null, default_payable_category_id: payableCategoryId || null, default_cost_center_id: costCenterId || null });
      setSuccess("Configurações financeiras salvas.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar as configurações financeiras."); }
  };

  const loading = finance.settingsQuery.isLoading || finance.categoriesQuery.isLoading || finance.costCentersQuery.isLoading;
  if (loading) return <AdminCard className="p-8"><LoadingState /></AdminCard>;

  const error = finance.settingsQuery.error || finance.categoriesQuery.error || finance.costCentersQuery.error;
  const revenueOptions = [{ value: "", label: "Nenhuma categoria padrão" }, ...categories.filter(item => item.is_active && item.nature === "revenue").map(item => ({ value: item.id, label: item.name }))];
  const expenseOptions = [{ value: "", label: "Nenhuma categoria padrão" }, ...categories.filter(item => item.is_active && item.nature === "expense").map(item => ({ value: item.id, label: item.name }))];
  const costCenterOptions = [{ value: "", label: "Nenhum centro de custo padrão" }, ...costCenters.filter(item => item.is_active).map(item => ({ value: item.id, label: item.name }))];

  return <div className="space-y-4">
    <div><h2 className="text-lg font-black text-[#0d1b2e]">Configurações financeiras</h2><p className="mt-1 text-xs text-[#5a6a82]">Defina os padrões usados pelos fluxos financeiros das próximas etapas.</p></div>
    <AdminCard className="p-5 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4"><FCurrencyInput label="Limite para exigir 2 aprovações" hint="Vazio mantém o limite ainda não configurado." value={threshold} onChange={(event: any) => setThreshold(event.target.value)} /><FToggle label="Usar abertura e fechamento de caixa" description="Quando ativo, contas Caixa que permitem sessão usarão o controle de abertura, sangria, suprimento e fechamento em uma etapa posterior." checked={cashSessionEnabled} onChange={setCashSessionEnabled} /></div>
        <div className="space-y-4"><FSelect label="Categoria padrão de Contas a Receber" value={receivableCategoryId} options={revenueOptions} onChange={(event: any) => setReceivableCategoryId(event.target.value)} /><FSelect label="Categoria padrão de Contas a Pagar" value={payableCategoryId} options={expenseOptions} onChange={(event: any) => setPayableCategoryId(event.target.value)} /><FSelect label="Centro de custo padrão" value={costCenterId} options={costCenterOptions} onChange={(event: any) => setCostCenterId(event.target.value)} /></div>
      </div>
      {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error instanceof Error ? error.message : "Não foi possível carregar as configurações."}</div>}
      {message && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>}
      {success && <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}
      <div className="mt-5 flex justify-end"><AdminButton onClick={save} loading={finance.saveSettings.isPending} loadingText="Salvando...">Salvar configurações</AdminButton></div>
    </AdminCard>
  </div>;
}
