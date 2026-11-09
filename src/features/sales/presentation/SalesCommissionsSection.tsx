import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";
import { useState } from "react";
import { useLocation,useNavigate } from "react-router";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CalendarClock, Wallet } from "lucide-react";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton,AdminDialog } from "@/shared/ui/admin/AdminLayout";

import {
  approveSalesCommission,listApprovedSalesCommissions,type SalesSellerMetric,
} from "../infrastructure/sales-operations.repository";
import { formatSalesDate } from "../domain/sales-order-display";
import { localSalesDate } from "../domain/sales-payment-schedule";

export function SalesCommissionsSection({organizationId,month,sellers,canManage}:{
  organizationId:string;month:string;sellers:SalesSellerMetric[];canManage:boolean;
}) {
  const client=useQueryClient();
  const navigate=useNavigate();
  const location=useLocation();
  const [seller,setSeller]=useState<SalesSellerMetric|null>(null);
  const [notes,setNotes]=useState("");
  const [error,setError]=useState<string|null>(null);
  const [feedback,setFeedback]=useState<string|null>(null);
  const closedMonth=Boolean(month&&month<localSalesDate().slice(0,7));
  const query=useQuery({
    queryKey:["sales",organizationId,"approved-commissions",month],
    queryFn:()=>listApprovedSalesCommissions(organizationId,month),
    enabled:Boolean(organizationId&&month),
    staleTime:15_000,
  });
  const existing=new Map((query.data||[]).map(row=>[row.seller_id,row]));
  const mutation=useMutation({
    mutationFn:()=>approveSalesCommission(organizationId,seller!.seller_id,month,notes),
    onSuccess:result=>{
      setSeller(null);setError(null);setNotes("");
      setFeedback("Comissão aprovada: "+formatCurrency(result.amount)+". Pagamento pendente no Financeiro.");
      void client.invalidateQueries({queryKey:["sales",organizationId]});
    },
    onError:e=>setError(systemErrorMessage(e,"Não foi possível aprovar a comissão.")),
  });
  const finance=(id:string)=>{
    const mode=new URLSearchParams(location.search).get("mode")==="crm"?"?mode=crm":"";
    navigate("/admin/finance/payables/"+encodeURIComponent(id)+mode);
  };
  return <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4">
    <div>
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <Wallet size={16}/> Aprovação e pagamento das comissões
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        A aprovação cria uma conta a pagar. A comissão só será considerada paga depois da baixa real no Financeiro.
      </p>
    </div>
    {feedback&&<p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{feedback}</p>}
    {!closedMonth&&<p className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
      <CalendarClock size={15}/> Aguarde o encerramento do mês para aprovar comissões definitivas.
    </p>}
    {query.isPending?<AdminWorkspaceSkeleton rows={5} columns={7} />
      :query.isError?<p role="alert" className="text-xs text-destructive">
        {systemErrorMessage(query.error,"Não foi possível consultar comissões aprovadas.")}
      </p>
      :<div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {sellers.filter(item=>Number(item.rate)>0||existing.has(item.seller_id)).length===0
          ?<p className="p-4 text-xs text-muted-foreground">Configure uma comissão para os vendedores antes de aprová-la.</p>
          :sellers.filter(item=>Number(item.rate)>0||existing.has(item.seller_id)).map(item=>{
          const approved=existing.get(item.seller_id);
          return <div key={item.seller_id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{item.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {approved
                  ? "Aprovada em "+formatSalesDate(approved.approved_at)+" · "+formatCurrency(approved.amount)
                  : "Estimativa: "+formatCurrency(item.commission_estimated)+" · "+item.rate+"%"}
              </p>
              {approved&&<p className="mt-1 text-xs text-muted-foreground">
                {formatCurrency(approved.paid_amount)} baixados no Financeiro
              </p>}
            </div>
            {approved?<div className="flex flex-wrap items-center gap-2">
              <span className={"text-xs font-semibold "+(Number(approved.paid_amount)>=Number(approved.amount)
                ?"text-emerald-700 dark:text-emerald-300":"text-orange-700 dark:text-orange-300")}>
                {Number(approved.paid_amount)>=Number(approved.amount)?"Paga":"A pagar"}
              </span>
              <AdminButton size="sm" variant="secondary" onClick={()=>finance(approved.financial_entry_id)}>
                <Wallet size={14}/> Financeiro
              </AdminButton>
            </div>
              :canManage&&closedMonth&&Number(item.commission_estimated)>0
                ?<AdminButton size="sm" onClick={()=>{setSeller(item);setNotes("");setError(null);}}>
                  <BadgeCheck size={14}/> Aprovar comissão
                </AdminButton>
                :null}
          </div>;
        })}
      </div>}
    {seller&&<AdminDialog open onClose={()=>!mutation.isPending&&setSeller(null)}
      title={"Aprovar comissão · "+seller.name}
      description="Confirme a obrigação financeira de comissão para um mês encerrado."
      className="max-w-lg"
      footer={<div className="flex flex-wrap justify-end gap-2">
        <AdminButton variant="secondary" size="sm" disabled={mutation.isPending}
          onClick={()=>setSeller(null)}>Voltar</AdminButton>
        <AdminButton size="sm" disabled={mutation.isPending}
          loading={mutation.isPending} onClick={()=>mutation.mutate()}>Confirmar aprovação</AdminButton>
      </div>}>
      <div className="space-y-3">
        <p className="text-sm">Vendedor: <strong>{seller.name}</strong></p>
        <p className="text-sm">Mês: <strong>{month}</strong></p>
        <p className="text-sm">Comissão estimada: <strong>{formatCurrency(seller.commission_estimated)}</strong></p>
        <p className="text-xs text-muted-foreground">
          O valor será recalculado no banco ao confirmar. Não haverá depósito ou baixa automática.
          A obrigação será registrada em Contas a Pagar e não poderá ser aprovada duas vezes para o mesmo mês e vendedor.
        </p>
        <label className="block space-y-1.5 text-xs font-semibold">
          <span>Observações (opcional)</span>
          <textarea value={notes} maxLength={1000} rows={3}
            onChange={e=>setNotes(e.target.value)}
            className="w-full rounded-lg border border-border bg-background p-3 text-sm"/>
        </label>
        {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
    </AdminDialog>}
  </section>;
}
