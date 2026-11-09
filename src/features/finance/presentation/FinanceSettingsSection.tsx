import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import { FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { useFinanceFoundation } from "../application/useFinanceFoundation";

export function FinanceSettingsSection({ modalOpen = false, onModalClose }: { modalOpen?: boolean; onModalClose?: () => void } = {}) {
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
      notifyAdmin("Configurações financeiras salvas com sucesso.", "success");
      if (modalOpen) onModalClose?.();
    } catch (error) { notifyAdmin(systemErrorMessage(error, "Não foi possível salvar as configurações financeiras."), "error"); }
  };

  const loading = finance.settingsQuery.isLoading || finance.categoriesQuery.isLoading;
  if (loading) return modalOpen
    ? <AdminDialog open onClose={() => { if (!finance.saveSettings.isPending) onModalClose?.(); }}
        title="Configurações financeiras" className="w-[calc(100vw-1.5rem)] max-w-3xl">
        <AdminWorkspaceSkeleton variant="details" columns={4} rows={3} />
      </AdminDialog>
    : <AdminWorkspaceSkeleton variant="details" columns={4} rows={3} />;

  const error = finance.settingsQuery.error || finance.categoriesQuery.error;
  const revenueOptions = [{ value: "", label: "Nenhuma categoria padrão" }, ...categories.filter(item => item.is_active && item.nature === "revenue").map(item => ({ value: item.id, label: item.name }))];
  const expenseOptions = [{ value: "", label: "Nenhuma categoria padrão" }, ...categories.filter(item => item.is_active && item.nature === "expense").map(item => ({ value: item.id, label: item.name }))];

  const fields = <div className="space-y-4">
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4"><FToggle label="Usar abertura e fechamento de caixa" description="Quando ativo, contas Caixa que permitem sessão usarão o controle de abertura, sangria, suprimento e fechamento em uma etapa posterior." checked={cashSessionEnabled} onChange={setCashSessionEnabled} /></div>
        <div className="space-y-4"><FSelect label="Categoria padrão de Contas a Receber" value={receivableCategoryId} options={revenueOptions} onChange={(event: any) => setReceivableCategoryId(event.target.value)} /><FSelect label="Categoria padrão de Contas a Pagar" value={payableCategoryId} options={expenseOptions} onChange={(event: any) => setPayableCategoryId(event.target.value)} /></div>
      </div>
      {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{systemErrorMessage(error, "Não foi possível carregar as configurações.")}</div>}
      {success && <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}
      {!modalOpen && <div className="mt-5 flex justify-end"><AdminButton onClick={save} loading={finance.saveSettings.isPending} loadingText="Salvando...">Salvar configurações</AdminButton></div>}
    </div>
  </div>;
  if (!modalOpen) return fields;
  return <AdminDialog open onClose={() => { if (!finance.saveSettings.isPending) onModalClose?.(); }}
    title="Configurações financeiras"
    className="h-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-3xl"
    bodyClassName="flex-none overscroll-contain"
    footer={<div className="flex flex-wrap items-center justify-between gap-2">
      <AdminButton variant="secondary" onClick={() => onModalClose?.()} disabled={finance.saveSettings.isPending}>Fechar</AdminButton>
      <AdminButton onClick={() => void save()} loading={finance.saveSettings.isPending} loadingText="Salvando...">Salvar configurações</AdminButton>
    </div>}
  >{fields}</AdminDialog>;
}
