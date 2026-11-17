import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw, TrendingDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/shared/domain/formatters";
import { AdminButton, AdminCard, AdminDialog, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";
import { TopTableScrollbar } from "@/shared/ui/admin/TopTableScrollbar";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { EmptyState } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { FinanceServiceOrderLink } from "./FinanceServiceOrderLink";

type LossStatus = "pending_return" | "confirmed" | "renegotiated" | "superseded" | "recovered";
type Loss = {
  id: string; organization_id: string; service_order_id: string; quote_version: number;
  os_number: string; customer_name: string; amount: number; reason: string;
  items_snapshot: Array<Record<string, unknown>>; status: LossStatus; occurred_at: string;
  confirmed_at: string | null;
};
type LossSummary = {
  events: number; potential: number; confirmed: number; recovered: number;
  pending_count: number; confirmed_count: number;
};
const STATUS: Record<LossStatus, { label: string; className: string }> = {
  pending_return: { label: "Aguardando devolução", className: "text-amber-700 dark:text-amber-400" },
  confirmed: { label: "Perda confirmada", className: "text-red-700 dark:text-red-400" },
  renegotiated: { label: "Em renegociação", className: "text-blue-700 dark:text-blue-400" },
  superseded: { label: "Substituída por nova reprovação", className: "text-muted-foreground" },
  recovered: { label: "Recuperada", className: "text-emerald-700 dark:text-emerald-400" },
};
const STATUS_OPTIONS = [
  { value: "all", label: "Todas as situações" },
  { value: "pending_return", label: "Aguardando devolução" },
  { value: "confirmed", label: "Perda confirmada" },
  { value: "renegotiated", label: "Em renegociação" },
  { value: "superseded", label: "Substituída" },
  { value: "recovered", label: "Recuperada" },
];
function dateBoundary(value: string, nextDay = false) {
  if (!value) return "";
  const [y,m,d] = value.split("-").map(Number);
  return new Date(y,m-1,d+(nextDay ? 1 : 0)).toISOString();
}
function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function FinanceLossesSection({ onInitialReady }: { onInitialReady?: () => void } = {}) {
  const { activeOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrganizationId || "";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Loss | null>(null);
  const start = dateBoundary(from);
  const end = dateBoundary(to,true);
  const cleanedSearch = search.trim().replace(/[^\\p{L}\\p{N}\\s-]/gu,"").slice(0,70);
  const key = ["finance","losses",organizationId] as const;
  const summaryQuery = useQuery({
    queryKey: [...key,"summary",start,end],
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    queryFn: async (): Promise<LossSummary> => {
      const { data, error } = await (supabase as any).rpc("get_financial_losses_summary_v1", {
        p_organization_id: organizationId, p_from: start || null, p_until: end || null,
      });
      if (error) throw error;
      return data as LossSummary;
    },
  });
  const listQuery = useQuery({
    queryKey: [...key,"page",start,end,status,cleanedSearch,page,pageSize],
    enabled: Boolean(organizationId),
    staleTime: 30_000,
    queryFn: async () => {
      let request = (supabase as any).from("financial_losses")
        .select("id,organization_id,service_order_id,quote_version,os_number,customer_name,amount,reason,items_snapshot,status,occurred_at,confirmed_at",{ count:"exact" })
        .eq("organization_id",organizationId);
      if (start) request=request.gte("occurred_at",start);
      if (end) request=request.lt("occurred_at",end);
      if (status!=="all") request=request.eq("status",status);
      if (cleanedSearch) request=request.or(
        `os_number.ilike.%${cleanedSearch}%,customer_name.ilike.%${cleanedSearch}%,reason.ilike.%${cleanedSearch}%`);
      const { data, count, error } = await request.order("occurred_at",{ascending:false})
        .range((page-1)*pageSize,page*pageSize-1);
      if (error) throw error;
      return { items:(data || []) as Loss[], total:count || 0 };
    },
  });
  useEffect(() => {
    if (!summaryQuery.isPending && !listQuery.isPending) onInitialReady?.();
  }, [summaryQuery.isPending, listQuery.isPending, onInitialReady]);
  useEffect(() => { setPage(1); }, [from,to,status,search,pageSize]);
  const summary = summaryQuery.data;
  const items = listQuery.data?.items || [];
  const total = listQuery.data?.total || 0;
  const busy = summaryQuery.isPending || listQuery.isPending;
  const error = listQuery.error || summaryQuery.error;

  return <div className="min-w-0 space-y-4">
    <div>
      <h2 className="text-lg font-black text-foreground">Perdas</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Receita potencial não realizada. Os orçamentos reprovados entram automaticamente neste histórico.
        Os valores não representam despesas, contas a receber nem movimentação de caixa.
      </p>
    </div>
    {summary && <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[
        { label:"Perda confirmada", value:formatCurrency(Number(summary.confirmed || 0)), detail:`${summary.confirmed_count || 0} equipamentos devolvidos` },
        { label:"Aguardando devolução", value:formatCurrency(Number(summary.potential || 0)), detail:`${summary.pending_count || 0} orçamentos reprovados` },
        { label:"Valores recuperados", value:formatCurrency(Number(summary.recovered || 0)), detail:"Orçamentos posteriormente aprovados" },
        { label:"Eventos de reprovação", value:String(summary.events || 0), detail:"Inclui versões e renegociações" },
      ].map(metric => <AdminCard key={metric.label} className="p-3 sm:p-4">
        <p className="text-xs font-bold text-muted-foreground">{metric.label}</p>
        <p className="mt-1 text-lg font-black tabular-nums text-foreground sm:text-xl">{metric.value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{metric.detail}</p>
      </AdminCard>)}
    </div>}
    <AdminCard className="p-3 sm:p-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_1.1fr_1.8fr_auto] lg:items-end">
        <FInput label="De" type="date" value={from} onChange={(e: any)=>setFrom(e.target.value)} />
        <FInput label="Até" type="date" value={to} onChange={(e: any)=>setTo(e.target.value)} />
        <div className="col-span-2 lg:col-span-1">
          <FSelect label="Situação" value={status} onChange={(e: any)=>setStatus(e.target.value)}
            options={STATUS_OPTIONS} />
        </div>
        <div className="col-span-2 lg:col-span-1">
          <FInput label="Buscar" placeholder="OS, cliente ou motivo" value={search}
            onChange={(e:any)=>setSearch(e.target.value)} />
        </div>
        <div className="col-span-2 lg:col-span-1">
          <AdminButton variant="secondary" onClick={()=>{ void queryClient.invalidateQueries({queryKey:key}); }}
            className="w-full justify-center lg:w-auto"><RefreshCcw size={15}/> Atualizar</AdminButton>
        </div>
      </div>
    </AdminCard>
    <AdminCard className="overflow-hidden">
      {busy ? <AdminWorkspaceSkeleton columns={5} rows={pageSize} />
      : error ? <div role="alert" className="p-5 text-sm text-destructive">
        {systemErrorMessage(error,"Não foi possível consultar as perdas.")}
      </div>
      : items.length===0 ? <div className="p-5">
        <EmptyState icon={TrendingDown} title="Nenhuma perda encontrada" description="As reprovações de orçamento serão registradas automaticamente aqui." />
      </div> : <>
        <div className="overflow-x-auto">
          <TopTableScrollbar />
          <table className="min-w-[790px] w-full">
            <thead><tr>
              <th className="text-left">OS / Cliente</th><th className="text-left">Motivo</th>
              <th className="text-left">Data</th><th className="text-right">Valor</th><th className="text-left">Situação</th>
              <th className="text-right">Ações</th>
            </tr></thead>
            <tbody>{items.map(item=><tr key={item.id}>
              <td><FinanceServiceOrderLink orderId={item.service_order_id} number={item.os_number} />
                <p className="max-w-48 truncate text-xs text-muted-foreground">{item.customer_name || "Cliente não informado"}</p>
                <p className="text-[10px] text-muted-foreground">Orçamento v{item.quote_version}</p>
              </td>
              <td className="max-w-64"><p className="line-clamp-2 text-xs">{item.reason}</p></td>
              <td className="whitespace-nowrap text-xs">{formatDate(item.occurred_at)}</td>
              <td className="whitespace-nowrap text-right font-bold tabular-nums">{formatCurrency(Number(item.amount || 0))}</td>
              <td><span className={`text-xs font-semibold ${STATUS[item.status]?.className || ""}`}>
                {STATUS[item.status]?.label || item.status}</span></td>
              <td className="text-right"><AdminButton variant="quaternary" onClick={()=>setSelected(item)}>Visualizar</AdminButton></td>
            </tr>)}</tbody>
          </table>
        </div>
        <PaginationBar page={page} pageSize={pageSize} totalItems={total}
          onPageChange={setPage} onPageSizeChange={value=>{setPageSize(value);setPage(1);}} />
      </>}
    </AdminCard>
    {selected && <AdminDialog open onClose={()=>setSelected(null)} title={`Orçamento reprovado · OS ${selected.os_number}`}
      description={`Versão ${selected.quote_version} · ${formatDate(selected.occurred_at)}`}
      className="max-w-2xl"
      footer={<div className="flex justify-end"><BtnSecondary onClick={()=>setSelected(null)}>Fechar</BtnSecondary></div>}>
      <div className="space-y-3 text-sm">
        <p><strong>Cliente:</strong> {selected.customer_name || "Não informado"}</p>
        <p><strong>Motivo:</strong> {selected.reason}</p>
        <p><strong>Situação:</strong> {STATUS[selected.status]?.label || selected.status}</p>
        <div className="rounded-lg border border-border">
          {(Array.isArray(selected.items_snapshot)?selected.items_snapshot:[]).map((item,index)=>
            <div key={index} className="flex items-start justify-between gap-3 border-b border-border p-3 last:border-0">
              <span className="min-w-0 break-words">{String(item.title_snapshot || "Item")} · Qtd. {String(item.quantity || 1)}</span>
              <strong className="shrink-0">{formatCurrency(
                Number(item.quantity || 0)*Number(item.unit_price || 0)+Number(item.additional_cost || 0))}</strong>
            </div>)}
        </div>
        <div className="flex justify-between border-t border-border pt-3 font-black">
          <span>Valor não aprovado (com desconto)</span><span>{formatCurrency(Number(selected.amount || 0))}</span>
        </div>
        <FinanceServiceOrderLink orderId={selected.service_order_id} number={selected.os_number}
          label="Abrir ordem de serviço em nova aba" />
      </div>
    </AdminDialog>}
  </div>;
}
