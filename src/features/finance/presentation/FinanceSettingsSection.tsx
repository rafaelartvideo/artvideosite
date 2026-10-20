import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import { FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard } from "@/shared/ui/admin/AdminLayout";
import { useFinanceFoundation } from "../application/useFinanceFoundation";

export function FinanceSettingsSection() {
  const finance = useFinanceFoundation();
  const [cashSessionEnabled, setCashSessionEnabled] = useState(false);
  const [receivableCategoryId, setReceivableCategoryId] = useState("");
  const [payableCategoryId, setPayableCategoryId] = useState("");
  const [success, setSuccess] = useState("");
  const settings = finance.settingsQuery.data;
  const categories = finance.categoriesQuery.data || [];

  useEffect(() => {
    if (!settings) return;
    setCashSessionEnabled(Boolean(settings.cash_session_enabled));
    setReceivableCategoryId(settings.default_receivable_category_id || "");
    setPayableCategoryId(settings.default_payable_category_id || "");
  }, [settings]);

  const save = async () => {
    try {
      setSuccess("");
      await finance.saveSettings.mutateAsync({ second_approval_threshold: null, cash_session_enabled: cashSessionEnabled, default_receivable_category_id: receivableCategoryId || null, default_payable_category_id: payableCategoryId || null, default_cost_center_id: settings?.default_cost_center_id || null });
      setSuccess("Configurações financeiras salvas.");
    } catch (error) { notifyAdmin(systemErrorMessage(error, "Não foi possível salvar as configurações financeiras."), "error"); }
  };

  const loading = finance.settingsQuery.isLoading || finance.categoriesQuery.isLoading;
  if (loading) return <AdminCard className="p-8"><LoadingState /></AdminCard>;

  const error = finance.settingsQuery.error || finance.categoriesQuery.error;
  const revenueOptions = [{ value: "", label: "Nenhuma categoria padrão" }, ...categories.filter(item => item.is_active && item.nature === "revenue").map(item => ({ value: item.id, label: item.name }))];
  const expenseOptions = [{ value: "", label: "Nenhuma categoria padrão" }, ...categories.filter(item => item.is_active && item.nature === "expense").map(item => ({ value: item.id, label: item.name }))];

  return <div className="space-y-4">
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4"><FToggle label="Usar abertura e fechamento de caixa" description="Quando ativo, contas Caixa que permitem sessão usarão o controle de abertura, sangria, suprimento e fechamento em uma etapa posterior." checked={cashSessionEnabled} onChange={setCashSessionEnabled} /></div>
        <div className="space-y-4"><FSelect label="Categoria padrão de Contas a Receber" value={receivableCategoryId} options={revenueOptions} onChange={(event: any) => setReceivableCategoryId(event.target.value)} /><FSelect label="Categoria padrão de Contas a Pagar" value={payableCategoryId} options={expenseOptions} onChange={(event: any) => setPayableCategoryId(event.target.value)} /></div>
      </div>
      {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{systemErrorMessage(error, "Não foi possível carregar as configurações.")}</div>}
      {success && <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}
      <div className="mt-5 flex justify-end"><AdminButton onClick={save} loading={finance.saveSettings.isPending} loadingText="Salvando...">Salvar configurações</AdminButton></div>
    </div>
  </div>;
}
