import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CircleAlert, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { cn } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";

type Eligibility = {
  eligible: boolean;
  reason: "valid" | "expired" | "no_certificate" | "not_started" | "not_closed" | "active_return";
  active_order_id?: string;
  warranty_starts_at?: string;
  warranty_expires_at?: string;
  warranty_label?: string;
};

function formatWarrantyDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
  return value.slice(8, 10) + "/" + value.slice(5, 7) + "/" + value.slice(0, 4);
}

export function OrderReturnStartDialog({
  order, open, onClose,
}: {
  order: any | null;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const orderId = String(order?.id || "");

  useEffect(() => {
    if (!open || !orderId) return;
    let active = true;
    setEligibility(null);
    setError("");
    setReason("");
    setLoading(true);
    void supabase.rpc("check_service_order_return_eligibility_v1", { p_order_id: orderId })
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) throw queryError;
        setEligibility(data as Eligibility);
      })
      .catch(cause => { if (active) setError(systemErrorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, orderId]);

  if (!open || !order) return null;

  const process = async (kind: "return" | "new") => {
    if (loading || processing || !eligibility) return;
    if (kind === "return" && (!eligibility.eligible || reason.trim().length < 5)) return;
    if (kind === "new" && eligibility.eligible) return;
    setProcessing(true);
    setError("");
    try {
      const { data, error: actionError } = kind === "return"
        ? await supabase.rpc("create_service_order_return_v1", {
            p_order_id: orderId, p_reason: reason.trim(), p_classification: "analysis",
          })
        : await supabase.rpc("create_service_order_from_expired_warranty_v1", { p_order_id: orderId });
      if (actionError) throw actionError;
      const newId = String(data || "");
      if (!newId) throw new Error("A nova OS não retornou identificador.");
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["order-return-chain"] });
      notifyAdmin(kind === "return"
        ? "Retorno iniciado. Registre o diagnóstico antes de continuar."
        : "Nova OS criada com numeração independente.", "success");
      onClose();
      navigate(adminPath("orders", newId));
    } catch (cause) {
      setError(systemErrorMessage(cause));
    } finally {
      setProcessing(false);
    }
  };

  const expired = eligibility && !eligibility.eligible
    && ["expired", "no_certificate", "not_started"].includes(eligibility.reason);

  return <AdminDialog
    open={open}
    onClose={() => { if (!processing) onClose(); }}
    title={expired ? "Garantia fora do prazo" : "Iniciar retorno da OS " + String(order.os_number || "")}
    className="max-w-lg"
    footer={<div className="flex w-full flex-wrap justify-end gap-2">
      <BtnSecondary onClick={onClose} disabled={processing}>Voltar</BtnSecondary>
      {eligibility?.eligible && <BtnPrimary disabled={processing || loading || reason.trim().length < 5}
        onClick={() => void process("return")}>
        <RotateCcw size={15} /> {processing ? "Criando retorno..." : "Confirmar retorno"}
      </BtnPrimary>}
      {expired && <BtnPrimary disabled={processing || loading} onClick={() => void process("new")}>
        {processing ? "Criando nova OS..." : "Criar nova OS"}
      </BtnPrimary>}
      {eligibility?.reason === "active_return" && eligibility.active_order_id &&
        <BtnPrimary onClick={() => { onClose(); navigate(adminPath("orders", eligibility.active_order_id!)); }}>
          Abrir retorno existente <ArrowUpRight size={15} />
        </BtnPrimary>}
    </div>}
  >
    {loading && <p role="status" className="py-4 text-sm text-muted-foreground">Verificando o certificado de garantia...</p>}
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
      {error}
    </p>}
    {!loading && eligibility?.eligible && <div className="space-y-4">
      <p className="text-xs font-semibold text-emerald-700">
        Garantia válida até {formatWarrantyDate(eligibility.warranty_expires_at)}.
      </p>
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Motivo do retorno <span className="text-red-600" aria-hidden="true">*</span>
        </span>
        <textarea
          value={reason} onChange={event => setReason(event.target.value)}
          minLength={5} maxLength={2000} rows={4} disabled={processing} required
          placeholder="Relato do problema informado pelo cliente..."
          className={cn(INPUT, "min-h-28 h-auto resize-y text-sm")}
        />
      </label>
    </div>}
    {!loading && expired && <div className="space-y-3">
      <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-400/70 bg-amber-50 px-4 py-3.5 text-amber-950 shadow-sm dark:border-amber-500/60 dark:bg-amber-500/15 dark:text-amber-100">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-950 dark:bg-amber-400/20 dark:text-amber-200" aria-hidden="true">
          <CircleAlert size={19} strokeWidth={2.5} />
        </span>
        <p className="min-w-0 flex-1 pt-1 text-sm font-bold leading-6">
          {eligibility.reason === "expired"
            ? "A garantia da OS " + String(order.os_number || "") + " venceu em " + formatWarrantyDate(eligibility.warranty_expires_at) + "."
            : eligibility.reason === "no_certificate"
              ? "Esta OS não possui certificado de garantia registrado."
              : "A vigência do certificado ainda não começou."}
        </p>
      </div>
      <p className="text-sm leading-6 text-foreground/90 dark:text-slate-200">
        É possível criar uma nova OS com outro número, aproveitando os dados do cliente, equipamento, informações e fotos da anterior. Pagamentos e aprovações não serão replicados.
      </p>
    </div>}
    {!loading && eligibility?.reason === "active_return" && <p className="text-sm text-foreground">
      Esta OS já possui um retorno em andamento.
    </p>}
    {!loading && eligibility?.reason === "not_closed" && <p className="text-sm text-foreground">
      A OS precisa estar concluída para iniciar um retorno.
    </p>}
  </AdminDialog>;
}
