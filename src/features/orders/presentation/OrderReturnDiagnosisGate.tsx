import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/primitives/popover";
import { supabase } from "@/lib/supabase";
import { FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminDialog, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { capitalizeSentenceStarts } from "../domain/capitalize-sentence-starts";

type DamageKind = "same_part" | "different_part";

const DAMAGE_OPTIONS: { value: DamageKind; label: string; description: string }[] = [
  {
    value: "same_part",
    label: "Mesma peça",
    description: "Coberto pela garantia. O fluxo de aprovação do orçamento será dispensado.",
  },
  {
    value: "different_part",
    label: "Outra peça",
    description: "Novo defeito. Será necessário enviar um orçamento e aguardar aprovação antes de executar.",
  },
];

export function OrderReturnDiagnosisGate({
  order, canClassify, onClassified, footerHostId,
}: {
  order: any;
  canClassify: boolean;
  onClassified: (kind: DamageKind, diagnosis: string, solution: string) => void;
  footerHostId: string;
}) {
  const queryClient = useQueryClient();
  const [diagnosis, setDiagnosis] = useState(String(order.diagnosis || ""));
  const [solution, setSolution] = useState(String(order.solution || ""));
  const [damageKind, setDamageKind] = useState<DamageKind | "">("");
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDiagnosis(String(order.diagnosis || ""));
    setSolution(String(order.solution || ""));
    setDamageKind("");
    setError("");
    setConfirmationOpen(false);
  }, [order.id]);

  // Mesmo host sticky utilizado pelo fluxo de aprovação de orçamento.
  useEffect(() => {
    setFooterHost(document.getElementById(footerHostId));
    return () => setFooterHost(null);
  }, [footerHostId]);

  const canConfirm = canClassify && !busy && Boolean(damageKind)
    && diagnosis.trim().length >= 5 && solution.trim().length >= 5;

  const confirm = async () => {
    if (busy || !confirmationOpen || !canClassify) return;
    if (!damageKind || diagnosis.trim().length < 5 || solution.trim().length < 5) {
      setError("Informe diagnóstico, solução proposta e se o defeito é na mesma peça ou em outra.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error: updateError } = await supabase.rpc("classify_service_order_return_v2", {
        p_organization_id: order.organization_id,
        p_order_id: order.id,
        p_damage_kind: damageKind,
        p_diagnosis: diagnosis.trim(),
        p_solution: solution.trim(),
      });
      if (updateError) throw updateError;
      if (data !== (damageKind === "same_part" ? "covered" : "unrelated")) {
        throw new Error("Classificação inesperada no registro do diagnóstico.");
      }
      setConfirmationOpen(false);
      onClassified(damageKind, diagnosis.trim(), solution.trim());
      // A tela ativa busca imediatamente a OS persistida; outras consultas da
      // listagem ficam obsoletas, sem gerar um segundo refetch simultâneo.
      void queryClient.invalidateQueries({ queryKey: ["orders"], refetchType: "none" });
      notifyAdmin(damageKind === "same_part"
        ? "Garantia procedente. Atendimento liberado sem orçamento e sem cobrança."
        : "Defeito em outra peça. Prepare o orçamento para aprovação.", "success");
    } catch (cause) {
      setError(systemErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return <>
    <Section title="Diagnóstico do retorno">
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Motivo do retorno: <span className="font-semibold text-foreground">{order.return_reason || "Não informado"}</span>
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <FTextarea label="Diagnóstico" required value={diagnosis} rows={4} maxLength={400}
            disabled={busy || !canClassify}
            onChange={(event: any) => setDiagnosis(capitalizeSentenceStarts(event.target.value).slice(0, 400))} />
          <FTextarea label="Solução proposta" required value={solution} rows={4} maxLength={400}
            disabled={busy || !canClassify}
            onChange={(event: any) => setSolution(capitalizeSentenceStarts(event.target.value).slice(0, 400))} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border pt-4">
          <span id="return-damage-question" className="shrink-0 text-sm font-bold text-foreground">
            Qual peça apresentou o defeito?
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-3"
            role="radiogroup" aria-labelledby="return-damage-question">
            {DAMAGE_OPTIONS.map(option => {
              const checked = damageKind === option.value;
              return <div key={option.value} className="inline-flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <button
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={busy || !canClassify}
                  onClick={() => { setDamageKind(option.value); setError(""); }}
                  className="inline-flex shrink-0 items-center gap-2 rounded-md py-1 text-sm font-semibold text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span aria-hidden="true" className={"relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full transition-colors " + (checked ? "bg-primary" : "bg-[#cbd0d7] dark:bg-slate-600")}>
                    <span className={"absolute left-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform " + (checked ? "translate-x-[18px]" : "translate-x-0")} />
                  </span>
                  {option.label}
                </button>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" aria-label={`Ajuda sobre ${option.label}`}
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                      <CircleHelp size={15} aria-hidden="true" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="top" sideOffset={6}
                    className="z-[350] w-72 max-w-[calc(100vw-2rem)] text-xs leading-relaxed text-popover-foreground">
                    {option.description}
                  </PopoverContent>
                </Popover>
              </div>;
            })}
          </div>
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Section>
    {footerHost && createPortal(
      <BtnPrimary onClick={() => { setError(""); setConfirmationOpen(true); }} disabled={!canConfirm}
        className="h-10 min-w-28 gap-2 px-4">
        <CheckCircle2 size={17} /> Confirmar
      </BtnPrimary>,
      footerHost,
    )}
    <AdminDialog
      open={confirmationOpen}
      onClose={() => { if (!busy) { setConfirmationOpen(false); setError(""); } }}
      title={damageKind === "same_part" ? "Confirmar garantia procedente" : "Confirmar outro defeito"}
      description="Confira a classificação antes de liberar a próxima etapa do atendimento."
      className="max-w-md"
      footer={<div className="flex w-full flex-wrap justify-end gap-2">
        <BtnSecondary disabled={busy} onClick={() => { setConfirmationOpen(false); setError(""); }}>
          Cancelar
        </BtnSecondary>
        <BtnPrimary disabled={!canConfirm} loading={busy} loadingText="Confirmando..."
          onClick={() => void confirm()}>
          <CheckCircle2 size={16} /> Confirmar
        </BtnPrimary>
      </div>}
    >
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">
          {damageKind === "same_part"
            ? "Deseja confirmar que o defeito é na mesma peça?"
            : "Deseja confirmar que o defeito é em outra peça?"}
        </p>
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-6 text-foreground">
          {damageKind === "same_part"
            ? "Garantia procedente: o atendimento será liberado sem cobrança e sem aprovação de um novo orçamento."
            : "Novo defeito: será necessário encaminhar um orçamento e aguardar aprovação antes da execução."}
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </AdminDialog>
  </>;
}
