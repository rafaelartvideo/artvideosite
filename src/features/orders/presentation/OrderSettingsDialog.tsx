import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useCompanySettingsQuery, useSaveCompanySettingsMutation } from "@/features/settings/presentation/useCompanySettingsQuery";
import { OrderRulesSettings } from "./OrderRulesSettings";

export function OrderSettingsDialog({
  open,
  onClose,
  organizationId,
  canEdit,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  canEdit: boolean;
}) {
  const { user } = useAuth();
  const companySettings = useCompanySettingsQuery(open ? organizationId : null);
  const saveSettings = useSaveCompanySettingsMutation();
  const [requireProof, setRequireProof] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!open || !companySettings.data) return;
    setRequireProof(companySettings.data.require_payment_proof_on_completion === true);
  }, [open, companySettings.data]);

  useEffect(() => {
    if (open) setFeedback(null);
  }, [open]);

  const saveProof = async () => {
    if (!canEdit || !companySettings.data || saveSettings.isPending) return;
    setFeedback(null);
    try {
      await saveSettings.mutateAsync({
        organizationId,
        updatedBy: user?.id || null,
        scope: "orders",
        settings: {
          ...companySettings.data,
          require_payment_proof_on_completion: requireProof,
        },
      });
      setFeedback({ type: "success", message: "Exigência de comprovante atualizada." });
    } catch (error) {
      setFeedback({ type: "error", message: systemErrorMessage(error, "Não foi possível salvar a configuração.") });
    }
  };

  return <AdminDialog
    open={open}
    onClose={onClose}
    title="Configurações das Ordens de Serviço"
    description="Regras específicas desta empresa. Configure a conclusão, os campos e as evidências exigidas."
    className="w-[calc(100vw-1.5rem)] max-w-5xl"
    bodyClassName="space-y-6 px-4 py-5 sm:px-6"
    footer={<div className="flex justify-end"><BtnSecondary onClick={onClose}>Fechar</BtnSecondary></div>}
  >
    <section className="space-y-3 border-b border-border pb-5">
      <h3 className="text-sm font-bold text-foreground">Conclusão da OS</h3>
      {companySettings.isPending ? <LoadingState text="Carregando configuração de conclusão..." /> :
        companySettings.error ? <p role="alert" className="text-sm text-destructive">{systemErrorMessage(companySettings.error, "Não foi possível carregar a configuração de comprovante.")}</p> :
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex min-w-0 flex-1 items-start gap-3">
            <input
              type="checkbox"
              checked={requireProof}
              onChange={event => { setRequireProof(event.target.checked); setFeedback(null); }}
              disabled={!canEdit || saveSettings.isPending}
              className="mt-1 h-4 w-4 shrink-0 accent-primary disabled:opacity-50"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">Exigir comprovante de pagamento para concluir a OS</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                Quando ativado, é obrigatório anexar uma foto ou PDF classificado como comprovante de pagamento antes da conclusão.
              </span>
            </span>
          </label>
          {canEdit && <BtnPrimary
            loading={saveSettings.isPending}
            disabled={companySettings.isPending || !companySettings.data || requireProof === (companySettings.data.require_payment_proof_on_completion === true)}
            onClick={() => void saveProof()}
            className="self-end sm:shrink-0"
          >Salvar</BtnPrimary>}
        </div>}
      {feedback && <p role="status" className={feedback.type === "error" ? "text-sm text-destructive" : "text-sm text-emerald-600 dark:text-emerald-400"}>{feedback.message}</p>}
    </section>
    <OrderRulesSettings organizationId={organizationId} canEdit={canEdit} />
  </AdminDialog>;
}
