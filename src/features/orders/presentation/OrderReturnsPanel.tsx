import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeftRight, ArrowUpRight, MoreHorizontal, RotateCcw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { cn } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";

const CLASSIFICATIONS = [
  { value: "analysis", label: "Garantia em análise" },
  { value: "covered", label: "Garantia procedente — sem cobrança" },
  { value: "not_covered", label: "Garantia improcedente — orçamento" },
  { value: "courtesy", label: "Cortesia — sem cobrança" },
  { value: "unrelated", label: "Outro defeito — serviço independente" },
] as const;

type OrderCycle = {
  id: string;
  os_number: string;
  return_root_id: string | null;
  return_sequence: number;
  completed_at: string | null;
  cancelled_at: string | null;
};

function useOrderReturnChain(order: any) {
  const organizationId = String(order?.organization_id || "");
  const rootId = String(order?.return_root_id || order?.id || "");
  const enabled = Boolean(order?.id && (order?.return_root_id || order?.completed_at));
  const query = useQuery({
    queryKey: ["order-return-chain", organizationId, rootId],
    enabled: enabled && Boolean(organizationId && rootId),
    staleTime: 30_000,
    queryFn: async (): Promise<OrderCycle[]> => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id,os_number,return_root_id,return_sequence,completed_at,cancelled_at")
        .eq("organization_id", organizationId)
        .or("id.eq." + rootId + ",return_root_id.eq." + rootId)
        .order("return_sequence", { ascending: true });
      if (error) throw error;
      return (data || []) as OrderCycle[];
    },
  });
  return { query, chain: query.data || [], organizationId, rootId };
}

/** Apenas os códigos lado a lado na mesma linha do número da OS. */
export function OrderReturnSwitcher({ order }: { order: any }) {
  const navigate = useNavigate();
  const { chain } = useOrderReturnChain(order);
  const title = "OS " + String(order?.os_number || "—");

  if (chain.length < 2) {
    return <span className="mr-1 inline-flex shrink-0 items-center text-lg font-black leading-none text-foreground sm:text-xl">{title}</span>;
  }

  return <nav className="mr-1 inline-flex flex-wrap items-center gap-1.5" aria-label="Alternar entre OS original e retornos">
    {chain.map((cycle, index) => <Fragment key={cycle.id}>
      {index > 0 && <ArrowLeftRight size={13} aria-hidden="true" className="shrink-0 text-muted-foreground/60" />}
      {cycle.id === order?.id
        ? <span aria-current="page" className="inline-flex min-h-8 items-center rounded-md bg-[#0131CD]/10 px-2.5 py-1 text-base font-black text-[#0131CD] sm:text-lg">
            {index === 0 ? "OS " + cycle.os_number : cycle.os_number}
          </span>
        : <button type="button" onClick={() => navigate(adminPath("orders", cycle.id))}
            className="inline-flex min-h-8 items-center rounded-md px-2.5 py-1 text-base font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:text-lg"
            title={"Abrir OS " + cycle.os_number}>
            {index === 0 ? "OS " + cycle.os_number : cycle.os_number}
          </button>}
    </Fragment>)}
  </nav>;
}

/** Somente menu de três pontos e modais sob demanda, sem seção adicional no detalhe. */
export function OrderReturnActions({ order, canCreate, canEdit, onClassificationChange }: {
  order: any;
  canCreate: boolean;
  canEdit: boolean;
  onClassificationChange?: (value: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { query, chain, organizationId, rootId } = useOrderReturnChain(order);
  const [createOpen, setCreateOpen] = useState(false);
  const [classificationOpen, setClassificationOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [classification, setClassification] = useState("analysis");
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const isReturn = Boolean(order?.return_root_id);
  const activeReturn = chain.find(item => item.return_sequence > 0 && !item.completed_at && !item.cancelled_at);
  const canOfferReturn = canCreate && Boolean(order?.completed_at) && !order?.cancelled_at;
  const canStartReturn = canOfferReturn && !activeReturn && !query.isLoading && !query.isError;
  const canClassify = isReturn && canEdit && !order?.completed_at && !order?.cancelled_at;
  const showMenu = canOfferReturn || canClassify;

  if (!showMenu) return null;

  const createReturn = async () => {
    if (creating || reason.trim().length < 5) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc("create_service_order_return_v1", {
        p_order_id: order.id,
        p_reason: reason.trim(),
        p_classification: "analysis",
      });
      if (error) throw error;
      const newOrderId = String(data || "");
      if (!newOrderId) throw new Error("Não foi possível identificar o retorno criado.");
      setCreateOpen(false);
      setReason("");
      notifyAdmin("Retorno criado com prioridade Urgente.", "success");
      void queryClient.invalidateQueries({ queryKey: ["order-return-chain", organizationId, rootId] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      navigate(adminPath("orders", newOrderId));
    } catch (error) {
      notifyAdmin("Não foi possível iniciar o retorno: " + systemErrorMessage(error), "error");
    } finally {
      setCreating(false);
    }
  };

  const saveClassification = async () => {
    if (!canClassify || updating) return;
    if (classification === order.return_classification) {
      setClassificationOpen(false);
      return;
    }
    setUpdating(true);
    try {
      const { data, error } = await supabase.from("service_orders")
        .update({ return_classification: classification })
        .eq("id", order.id).eq("organization_id", organizationId)
        .is("completed_at", null).is("cancelled_at", null)
        .select("id").single();
      if (error || !data) throw error || new Error("Não foi possível atualizar o retorno.");
      onClassificationChange?.(classification);
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      setClassificationOpen(false);
      notifyAdmin("Garantia classificada.", "success");
    } catch (error) {
      notifyAdmin("Não foi possível classificar a garantia: " + systemErrorMessage(error), "error");
    } finally {
      setUpdating(false);
    }
  };

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" title="Ações da OS" aria-label="Ações da OS"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0131CD]">
          <MoreHorizontal size={19} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {canStartReturn && <DropdownMenuItem onSelect={() => {
          setReason(""); setCreateOpen(true);
        }} className="flex cursor-pointer items-center gap-2 text-sm">
          <RotateCcw size={15} /> Iniciar retorno
        </DropdownMenuItem>}
        {activeReturn && activeReturn.id !== order.id && <DropdownMenuItem
          onSelect={() => navigate(adminPath("orders", activeReturn.id))}
          className="flex cursor-pointer items-center gap-2 text-sm">
          <ArrowUpRight size={15} /> Abrir {activeReturn.os_number}
        </DropdownMenuItem>}
        {canClassify && <DropdownMenuItem onSelect={() => {
          setClassification(String(order.return_classification || "analysis"));
          setClassificationOpen(true);
        }} className="flex cursor-pointer items-center gap-2 text-sm">
          <ShieldCheck size={15} /> Classificar garantia
        </DropdownMenuItem>}
        {canOfferReturn && query.isError && <DropdownMenuItem disabled>Não foi possível carregar os retornos</DropdownMenuItem>}
        {canOfferReturn && query.isLoading && <DropdownMenuItem disabled>Carregando...</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>

    <AdminDialog open={createOpen} onClose={() => { if (!creating) setCreateOpen(false); }}
      title={"Iniciar retorno da OS " + String(order.os_number || "")}
      className="max-w-lg"
      footer={<div className="flex w-full flex-col-reverse justify-end gap-2 sm:flex-row">
        <BtnSecondary disabled={creating} onClick={() => setCreateOpen(false)}>Voltar</BtnSecondary>
        <BtnPrimary disabled={creating || reason.trim().length < 5} onClick={() => { void createReturn(); }}>
          <RotateCcw size={15} /> {creating ? "Criando retorno..." : "Confirmar retorno"}
        </BtnPrimary>
      </div>}>
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Motivo do retorno <span className="text-red-600" aria-hidden="true">*</span>
        </span>
        <textarea value={reason} onChange={event => setReason(event.target.value)}
          rows={4} maxLength={2000} minLength={5} required disabled={creating}
          placeholder="Descreva o motivo do retorno..."
          className={cn(INPUT, "min-h-28 h-auto resize-y text-sm")} />
      </label>
    </AdminDialog>

    <AdminDialog open={classificationOpen} onClose={() => { if (!updating) setClassificationOpen(false); }}
      title="Classificar garantia"
      className="max-w-md"
      footer={<div className="flex w-full flex-col-reverse justify-end gap-2 sm:flex-row">
        <BtnSecondary disabled={updating} onClick={() => setClassificationOpen(false)}>Voltar</BtnSecondary>
        <BtnPrimary disabled={updating} onClick={() => { void saveClassification(); }}>
          {updating ? "Salvando..." : "Salvar"}
        </BtnPrimary>
      </div>}>
      <AdminSelect value={classification} disabled={updating}
        ariaLabel="Classificação da garantia" onValueChange={setClassification}
        options={CLASSIFICATIONS.map(item => ({ value: item.value, label: item.label }))}
        className="w-full text-sm" />
    </AdminDialog>
  </>;
}
