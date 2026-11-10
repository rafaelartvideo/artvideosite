import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowUpRight, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { cn } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";

const CLASSIFICATIONS = [
  { value: "analysis", label: "Garantia em análise" },
  { value: "covered", label: "Garantia procedente — sem cobrança" },
  { value: "not_covered", label: "Garantia improcedente — orçamento" },
  { value: "courtesy", label: "Cortesia — sem cobrança" },
  { value: "unrelated", label: "Outro defeito — serviço independente" },
] as const;

function classificationLabel(value: string | null | undefined) {
  return CLASSIFICATIONS.find(item => item.value === value)?.label || "Garantia em análise";
}

type OrderCycle = {
  id: string;
  os_number: string;
  return_root_id: string | null;
  return_sequence: number;
  return_reason: string | null;
  return_classification: string;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export function OrderReturnsPanel({ order, canCreate, canEdit, onClassificationChange }: {
  order: any;
  canCreate: boolean;
  canEdit: boolean;
  onClassificationChange?: (value: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [classification, setClassification] = useState("analysis");
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const organizationId = String(order?.organization_id || "");
  const rootId = String(order?.return_root_id || order?.id || "");
  const isReturn = Boolean(order?.return_root_id);
  const visible = Boolean(order?.id && (isReturn || order?.completed_at));

  const history = useQuery({
    queryKey: ["order-return-chain", organizationId, rootId],
    enabled: visible && Boolean(organizationId && rootId),
    staleTime: 30_000,
    queryFn: async (): Promise<OrderCycle[]> => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id,os_number,return_root_id,return_sequence,return_reason,return_classification,completed_at,cancelled_at,created_at")
        .eq("organization_id", organizationId)
        .or("id.eq." + rootId + ",return_root_id.eq." + rootId)
        .order("return_sequence", { ascending: true });
      if (error) throw error;
      return (data || []) as OrderCycle[];
    },
  });

  const chain = history.data || [];
  const activeReturn = chain.find(item => item.return_sequence > 0 && !item.completed_at && !item.cancelled_at);
  const canStart = visible && canCreate && Boolean(order?.completed_at) && !order?.cancelled_at
    && !activeReturn && !history.isLoading && !history.isError;
  const priorOrders = useMemo(() => chain.filter(item =>
    item.return_sequence < Number(order?.return_sequence || 0) && item.completed_at,
  ), [chain, order?.return_sequence]);

  const previousItems = useQuery({
    queryKey: ["order-return-previous-items", organizationId, rootId, order?.id, priorOrders.map(item => item.id).join(",")],
    enabled: visible && isReturn && priorOrders.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const ids = priorOrders.map(item => item.id);
      const [services, parts] = await Promise.all([
        supabase.from("service_order_items")
          .select("id,service_order_id,title_snapshot,item_type,quantity,unit_price,additional_cost")
          .in("service_order_id", ids).order("created_at"),
        supabase.from("service_order_used_items")
          .select("id,service_order_id,quantity,inventory_item:inventory_items(name,sku)")
          .in("service_order_id", ids).order("created_at"),
      ]);
      if (services.error) throw services.error;
      if (parts.error) throw parts.error;
      return { services: services.data || [], parts: parts.data || [] };
    },
  });

  if (!visible) return null;

  const createReturn = async () => {
    if (creating || reason.trim().length < 5) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc("create_service_order_return_v1", {
        p_order_id: order.id,
        p_reason: reason.trim(),
        p_classification: classification,
      });
      if (error) throw error;
      const createdId = String(data || "");
      if (!createdId) throw new Error("O retorno não informou o ID da OS.");
      const { data: createdOrder } = await supabase.from("service_orders")
        .select("os_number").eq("id", createdId).eq("organization_id", organizationId).maybeSingle();
      notifyAdmin("Retorno " + (createdOrder?.os_number || "") + " criado. O atendimento anterior permanece fechado.", "success");
      setCreateOpen(false);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["order-return-chain", organizationId, rootId] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      navigate(adminPath("orders", createdId));
    } catch (error) {
      notifyAdmin("Não foi possível iniciar o retorno: " + systemErrorMessage(error), "error");
    } finally {
      setCreating(false);
    }
  };

  const changeClassification = async (next: string) => {
    if (!isReturn || !canEdit || order?.completed_at || updating || next === order.return_classification) return;
    setUpdating(true);
    try {
      const { data, error } = await supabase.from("service_orders")
        .update({ return_classification: next })
        .eq("id", order.id)
        .eq("organization_id", organizationId)
        .is("completed_at", null)
        .select("id").single();
      if (error || !data) throw error || new Error("Retorno não atualizado.");
      onClassificationChange?.(next);
      void queryClient.invalidateQueries({ queryKey: ["order-return-chain", organizationId, rootId] });
      notifyAdmin("Classificação do retorno atualizada.", "success");
    } catch (error) {
      notifyAdmin("Não foi possível classificar o retorno: " + systemErrorMessage(error), "error");
    } finally {
      setUpdating(false);
    }
  };

  return <>
    <section className="rounded-xl border border-[#0131CD]/15 bg-[#0131CD]/[0.035] p-3 sm:p-4" aria-label="Atendimentos e retornos da OS">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <RotateCcw size={17} className="shrink-0 text-[#0131CD]" />
          <div>
            <h3 className="text-sm font-bold text-foreground">Atendimentos e retornos</h3>
            <p className="text-[11px] text-muted-foreground">
              {isReturn ? "Este atendimento tem serviços e valores próprios. Os anteriores ficam preservados." : "O fechamento, os produtos e o financeiro da OS original não serão alterados."}
            </p>
          </div>
        </div>
        {canStart && <AdminButton variant="secondary" onClick={() => {
          setReason(""); setClassification("analysis"); setCreateOpen(true);
        }}><RotateCcw size={15} /> Iniciar retorno</AdminButton>}
        {activeReturn && activeReturn.id !== order.id && <AdminButton variant="secondary"
          onClick={() => navigate(adminPath("orders", activeReturn.id))}>
          Abrir {activeReturn.os_number} <ArrowUpRight size={14} />
        </AdminButton>}
      </div>
      {history.isError && <p className="mt-2 text-xs text-red-600">Não foi possível consultar os retornos. Atualize a OS antes de iniciar outro.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {chain.map(cycle => <button key={cycle.id} type="button"
          onClick={() => { if (cycle.id !== order.id) navigate(adminPath("orders", cycle.id)); }}
          aria-current={cycle.id === order.id ? "page" : undefined}
          className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors",
            cycle.id === order.id ? "border-[#0131CD] bg-[#0131CD]/10 text-[#0131CD]" : "border-border bg-background text-foreground hover:bg-muted")}>
          {cycle.completed_at ? <LockKeyhole size={13} /> : <RotateCcw size={13} />}
          {cycle.os_number}
          {cycle.id !== order.id && <ArrowUpRight size={12} />}
        </button>)}
      </div>
      {isReturn && <>
        <div className="mt-3 grid gap-3 border-t border-border/70 pt-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Relato na nova entrada</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-foreground">{order.return_reason || "Não informado"}</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Análise da garantia</p>
            {canEdit && !order.completed_at && !order.cancelled_at
              ? <AdminSelect value={String(order.return_classification || "analysis")}
                  onValueChange={value => { void changeClassification(value); }}
                  options={CLASSIFICATIONS.map(item => ({ value: item.value, label: item.label }))}
                  disabled={updating} ariaLabel="Classificação do retorno" className="w-full min-w-0 text-xs" />
              : <p className="text-xs font-semibold text-foreground">{classificationLabel(order.return_classification)}</p>}
            {["covered", "courtesy"].includes(String(order.return_classification || "")) &&
              <p className="mt-1 text-[11px] text-amber-700">Atendimento sem cobrança: mantenha os valores do ciclo em R$ 0,00; custos e peças continuam registrados.</p>}
          </div>
        </div>
        {priorOrders.length > 0 && <details className="mt-3 rounded-lg border border-border bg-background p-3">
          <summary className="cursor-pointer text-xs font-bold text-foreground">
            <LockKeyhole size={13} className="mr-1.5 inline-block" /> Serviços e peças anteriores (somente leitura)
          </summary>
          {previousItems.isLoading ? <p className="mt-2 text-xs text-muted-foreground">Carregando registros anteriores...</p> :
            previousItems.isError ? <p className="mt-2 text-xs text-red-600">Não foi possível consultar os itens anteriores.</p> :
            <div className="mt-3 space-y-3">
              {priorOrders.map(prior => {
                const services = (previousItems.data?.services || []).filter(item => item.service_order_id === prior.id);
                const parts = (previousItems.data?.parts || []).filter(item => item.service_order_id === prior.id);
                return <div key={prior.id} className="border-t border-border pt-2">
                  <button type="button" className="text-xs font-bold text-[#0131CD] hover:underline"
                    onClick={() => navigate(adminPath("orders", prior.id))}>{prior.os_number} — ver atendimento <ArrowUpRight size={12} className="inline-block" /></button>
                  {services.map(item => <p key={item.id} className="mt-1 text-xs text-muted-foreground">
                    {item.title_snapshot} · {item.quantity} un. (registrado, bloqueado)
                  </p>)}
                  {parts.map(item => <p key={item.id} className="mt-1 text-xs text-muted-foreground">
                    {item.inventory_item?.name || "Peça utilizada"} · {item.quantity} un. (registrado, bloqueado)
                  </p>)}
                  {!services.length && !parts.length && <p className="mt-1 text-xs text-muted-foreground">Sem itens registrados nesta etapa.</p>}
                </div>;
              })}
            </div>}
        </details>}
      </>}
    </section>
    <AdminDialog open={createOpen} onClose={() => { if (!creating) setCreateOpen(false); }}
      title={"Iniciar retorno da OS " + String(order.os_number || "")}
      description="Uma nova etapa será criada com o código R1, R2... e todos os documentos, peças e pagamentos antigos permanecerão na OS de origem."
      className="max-w-lg"
      footer={<div className="flex w-full flex-col-reverse justify-end gap-2 sm:flex-row">
        <BtnSecondary disabled={creating} onClick={() => setCreateOpen(false)}>Voltar</BtnSecondary>
        <BtnPrimary disabled={creating || reason.trim().length < 5} onClick={() => { void createReturn(); }}>
          <RotateCcw size={15} /> {creating ? "Criando retorno..." : "Confirmar retorno"}
        </BtnPrimary>
      </div>}>
      <div className="space-y-4">
        <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          <ShieldCheck size={17} className="shrink-0" />
          <p>Os serviços antigos não serão copiados, cobrados novamente ou removidos. O novo atendimento começará com seu próprio diagnóstico, orçamento, checklist e financeiro.</p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase text-muted-foreground">Motivo do retorno *</span>
          <textarea value={reason} onChange={event => setReason(event.target.value)}
            rows={4} maxLength={2000} disabled={creating}
            placeholder="Descreva o defeito relatado pelo cliente na nova entrada..."
            className={cn(INPUT, "min-h-28 h-auto resize-y text-sm")} />
        </label>
        <div>
          <span className="mb-1.5 block text-[11px] font-bold uppercase text-muted-foreground">Classificação inicial</span>
          <AdminSelect value={classification} onValueChange={setClassification}
            disabled={creating} ariaLabel="Classificação inicial do retorno"
            options={CLASSIFICATIONS.map(item => ({ value: item.value, label: item.label }))} className="w-full text-sm" />
          <p className="mt-1 text-[11px] text-muted-foreground">A garantia pode ser reclassificada após o diagnóstico, antes de concluir o retorno.</p>
        </div>
      </div>
    </AdminDialog>
  </>;
}
