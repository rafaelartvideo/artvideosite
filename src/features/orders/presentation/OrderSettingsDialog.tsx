import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useCompanySettingsQuery, useSaveCompanySettingsMutation } from "@/features/settings/presentation/useCompanySettingsQuery";
import { OrderRulesSettings, type OrderRulesSettingsHandle } from "./OrderRulesSettings";

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
  const rulesRef = useRef<OrderRulesSettingsHandle>(null);
  const [requireProof, setRequireProof] = useState(false);
  const [rulesDirty, setRulesDirty] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!open || !companySettings.data) return;
    setRequireProof(companySettings.data.require_payment_proof_on_completion === true);
  }, [open, companySettings.data]);

  const proofDirty = Boolean(companySettings.data &&
    requireProof !== (companySettings.data.require_payment_proof_on_completion === true));
  const anyChanges = rulesDirty || proofDirty;
  const busy = saving || saveSettings.isPending;

  const saveAll = async () => {
    if (!open || !canEdit || !anyChanges || busy || rulesLoading || companySettings.isPending || companySettings.error || !companySettings.data) return;
    setSaving(true);
    setFeedback(null);
    try {
      // Somente os escopos de regras modificados serão gravados.
      if (rulesDirty) await rulesRef.current?.saveChanges();
      // Não altera os dados cadastrais, nem regrava a exigência de comprovante sem mudanças.
      if (proofDirty) {
        await saveSettings.mutateAsync({
          organizationId,
          updatedBy: user?.id || null,
          scope: "orders",
          settings: {
            ...companySettings.data,
            require_payment_proof_on_completion: requireProof,
          },
        });
      }
      setFeedback({ type: "success", message: "Alterações das Ordens de Serviço salvas com sucesso." });
    } catch (error) {
      setFeedback({ type: "error", message: systemErrorMessage(error, "Não foi possível salvar todas as alterações. Confira as configurações antes de tentar novamente.") });
    } finally {
      setSaving(false);
    }
  };

  const close = () => { if (!busy) onClose(); };

  return <AdminDialog
    open={open}
    onClose={close}
    title="Configurações das Ordens de Serviço"
    description="Defina as exigências de conclusão, os campos e as evidências desta empresa."
    className="w-[calc(100vw-1.5rem)] max-w-5xl"
    bodyClassName="space-y-6 px-4 py-5 sm:px-6"
    footer={<div className="flex w-full justify-end gap-2">
      <BtnSecondary onClick={close} disabled={busy}>Fechar</BtnSecondary>
      {canEdit && <BtnPrimary
        disabled={!anyChanges || busy || rulesLoading || companySettings.isPending || Boolean(companySettings.error)}
        loading={busy}
        onClick={() => void saveAll()}
      >Salvar</BtnPrimary>}
    </div>}
  >
    <section className="space-y-3 border-b border-border pb-5">
      <h3 className="text-sm font-bold text-foreground">Conclusão da OS</h3>
      {companySettings.isPending ? <LoadingState text="Carregando configuração de conclusão..." /> :
        companySettings.error ? <p role="alert" className="text-sm text-destructive">{systemErrorMessage(companySettings.error, "Não foi possível carregar a configuração de comprovante.")}</p> :
        <label className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={requireProof}
            onChange={event => { setRequireProof(event.target.checked); setFeedback(null); }}
            disabled={!canEdit || busy}
            className="mt-1 h-4 w-4 shrink-0 accent-primary disabled:opacity-50"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">Exigir comprovante de pagamento para concluir a OS</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              Quando ativado, é obrigatório anexar uma foto ou PDF classificado como comprovante de pagamento antes da conclusão.
            </span>
          </span>
        </label>}
    </section>
    <OrderRulesSettings
      ref={rulesRef}
      organizationId={organizationId}
      canEdit={canEdit && !busy}
      onDirtyChange={setRulesDirty}
      onLoadingChange={setRulesLoading}
    />
    {feedback && <p role="status" className={feedback.type === "error" ? "text-sm text-destructive" : "text-sm text-emerald-600 dark:text-emerald-400"}>
      {feedback.message}
    </p>}
  </AdminDialog>;
}
