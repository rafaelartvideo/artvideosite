import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { BtnPrimary, Section } from "@/shared/ui/admin/AdminLayout";
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
  const [error, setError] = useState("");

  useEffect(() => {
    setDiagnosis(String(order.diagnosis || ""));
    setSolution(String(order.solution || ""));
    setDamageKind("");
    setError("");
  }, [order.id]);

  // Mesmo host sticky utilizado pelo fluxo de aprovação de orçamento.
  useEffect(() => {
    setFooterHost(document.getElementById(footerHostId));
    return () => setFooterHost(null);
  }, [footerHostId]);

  const canConfirm = canClassify && !busy && Boolean(damageKind)
    && diagnosis.trim().length >= 5 && solution.trim().length >= 5;

  const confirm = async () => {
    if (busy || !canClassify) return;
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
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      onClassified(damageKind, diagnosis.trim(), solution.trim());
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
          Relato do cliente: <span className="font-semibold text-foreground">{order.return_reason || "Não informado"}</span>
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
                  onClick={() => setDamageKind(option.value)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-md py-1 text-sm font-semibold text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span aria-hidden="true" className={"relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full transition-colors " + (checked ? "bg-primary" : "bg-[#cbd0d7] dark:bg-slate-600")}>
                    <span className={"absolute left-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform " + (checked ? "translate-x-[18px]" : "translate-x-0")} />
                  </span>
                  {option.label}
                </button>
                {checked && <span className={"min-w-0 text-xs font-medium leading-5 " +
                  (option.value === "same_part"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-orange-700 dark:text-orange-300")}>
                  {option.description}
                </span>}
              </div>;
            })}
          </div>
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Section>
    {footerHost && createPortal(
      <BtnPrimary onClick={() => void confirm()} disabled={!canConfirm} loading={busy}
        loadingText="Confirmando..." className="h-10 min-w-28 gap-2 px-4">
        <CheckCircle2 size={17} /> Confirmar
      </BtnPrimary>,
      footerHost,
    )}
  </>;
}
