import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import { FToggle } from "@/shared/ui/admin/AdminFormControls";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { useFinanceFoundation } from "../application/useFinanceFoundation";

export function FinanceSettingsSection({ modalOpen = false, onModalClose }: { modalOpen?: boolean; onModalClose?: () => void } = {}) {
  const finance = useFinanceFoundation();
  const [cashSessionEnabled, setCashSessionEnabled] = useState(false);
  const [success, setSuccess] = useState("");
  const settings = finance.settingsQuery.data;

  useEffect(() => {
    if (!settings) return;
    setCashSessionEnabled(Boolean(settings.cash_session_enabled));
  }, [settings]);

  const save = async () => {
    try {
      setSuccess("");
      await finance.saveSettings.mutateAsync({ second_approval_threshold: null, cash_session_enabled: cashSessionEnabled, default_receivable_category_id: settings?.default_receivable_category_id || null, default_payable_category_id: settings?.default_payable_category_id || null, default_cost_center_id: settings?.default_cost_center_id || null });
      setSuccess("Configurações financeiras salvas.");
      notifyAdmin("Configurações financeiras salvas com sucesso.", "success");
      if (modalOpen) onModalClose?.();
    } catch (error) { notifyAdmin(systemErrorMessage(error, "Não foi possível salvar as configurações financeiras."), "error"); }
  };

  const loading = finance.settingsQuery.isLoading;
  if (loading) return modalOpen
    ? <AdminDialog open onClose={() => { if (!finance.saveSettings.isPending) onModalClose?.(); }}
        title="Configurações financeiras" className="w-[calc(100vw-1.5rem)] max-w-3xl">
        <AdminWorkspaceSkeleton variant="details" columns={4} rows={3} />
      </AdminDialog>
    : <AdminWorkspaceSkeleton variant="details" columns={4} rows={3} />;

  const error = finance.settingsQuery.error;

  const fields = <div className="space-y-5">
    <p className="text-sm leading-relaxed text-muted-foreground">
      O Financeiro já inclui categorias e formas de pagamento prontas para uso. A categoria correta
      é sugerida automaticamente nos lançamentos, mas pode ser alterada em cada conta.
    </p>
    <FToggle
      label="Controle de caixa físico"
      description="Ative apenas se precisar registrar abertura, suprimentos, sangrias e fechamento do caixa."
      checked={cashSessionEnabled}
      onChange={setCashSessionEnabled}
    />
    {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {systemErrorMessage(error, "Não foi possível carregar as configurações.")}
    </div>}
    {success && <p role="status" className="text-sm font-semibold text-emerald-700">{success}</p>}
    {!modalOpen && <div className="flex justify-end">
      <AdminButton onClick={() => void save()} loading={finance.saveSettings.isPending} loadingText="Salvando...">
        Salvar configuração
      </AdminButton>
    </div>}
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
