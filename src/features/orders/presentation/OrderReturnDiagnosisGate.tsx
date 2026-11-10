import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, ShieldCheck, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminSegmentedControl, Section } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { capitalizeSentenceStarts } from "../domain/capitalize-sentence-starts";

type DamageKind = "same_part" | "different_part";

export function OrderReturnDiagnosisGate({
  order, canClassify, onClassified,
}: {
  order: any;
  canClassify: boolean;
  onClassified: (kind: DamageKind, diagnosis: string, solution: string) => void;
}) {
  const queryClient = useQueryClient();
  const [diagnosis, setDiagnosis] = useState(String(order.diagnosis || ""));
  const [solution, setSolution] = useState(String(order.solution || ""));
  const [damageKind, setDamageKind] = useState<DamageKind | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setDiagnosis(String(order.diagnosis || ""));
    setSolution(String(order.solution || ""));
    setDamageKind("");
    setError("");
  }, [order.id]);

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

  return <div className="space-y-4">
    <Section title="Diagnóstico do retorno">
      <div className="space-y-4">
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
        <div className="border-t border-border pt-4">
          <p className="mb-2 text-sm font-bold text-foreground">Qual peça apresentou o defeito?</p>
          <AdminSegmentedControl
            value={damageKind}
            onChange={value => setDamageKind(value as DamageKind)}
            disabled={busy || !canClassify}
            options={[
              { value: "same_part", label: "Mesma peça (garantia)" },
              { value: "different_part", label: "Outra peça (novo orçamento)" },
            ]}
            className="w-full sm:w-fit"
          />
          {damageKind === "same_part" && <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
            <ShieldCheck size={16} /> Coberto pela garantia. O fluxo de aprovação do orçamento será dispensado.
          </p>}
          {damageKind === "different_part" && <p className="mt-3 flex items-center gap-2 text-sm text-orange-700">
            <Wrench size={16} /> Novo defeito. Será necessário enviar um orçamento e aguardar aprovação antes de executar.
          </p>}
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
        <div className="flex justify-end border-t border-border pt-4">
          <AdminButton disabled={!canClassify || busy || !damageKind || diagnosis.trim().length < 5 || solution.trim().length < 5}
            onClick={() => void confirm()} className="gap-2" variant="primary">
            <ClipboardCheck size={16} /> {busy ? "Registrando..." : "Confirmar diagnóstico"}
          </AdminButton>
        </div>
      </div>
    </Section>
  </div>;
}
