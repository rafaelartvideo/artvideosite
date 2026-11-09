import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Plus, ShoppingCart, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useLocation, useNavigate } from "react-router";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard } from "@/shared/ui/admin/AdminLayout";
import { TopTableScrollbar } from "@/shared/ui/admin/TopTableScrollbar";
import { AdminSearchPanel, AdminSearchTextField, AdminSearchClearButton, AdminSearchSortMenu } from "@/shared/ui/admin/AdminSearchPanel";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { listSalesProposals, type SalesProposalDetail, type ProposalStatus } from "../infrastructure/sales-proposals.repository";
import { SalesProposalDetailDialog } from "./SalesProposalDetailDialog";
import { SalesProposalEditorDialog } from "./SalesProposalEditorDialog";
import { SalesCheckoutDialog } from "./SalesCheckoutDialog";
import { formatSalesDate, formatSalesDueDate } from "../domain/sales-order-display";
import type { PdvProduct } from "@/features/pdv/infrastructure/pdv.repository";

const statuses: Record<ProposalStatus,string> = {
  draft:"Rascunho",sent:"Enviada",approved:"Aprovada",rejected:"Recusada",
  converted:"Convertida",expired:"Vencida",cancelled:"Cancelada",
};
const options: Array<{value:string;label:string}> = [
  {value:"all",label:"Todas"},
  ...Object.entries(statuses).map(([value,label])=>({value,label})),
];

export function SalesProposalsPage() {
  const { activeOrganizationId, hasPermission } = useAuth();
  const org=activeOrganizationId||"";
  const queryClient=useQueryClient();
  const navigate=useNavigate();
  const location=useLocation();
  const modeSuffix=new URLSearchParams(location.search).get("mode")==="crm"?"?mode=crm":"";
  const [search,setSearch]=useState("");
  const [searchDebounced,setSearchDebounced]=useState("");
  const [status,setStatus]=useState("all");
  const [page,setPage]=useState(1);
  const [sort,setSort]=useState<"newest"|"oldest"|"highest"|"lowest">("newest");
  const [pageSize,setPageSize]=useState(15);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [editing,setEditing]=useState<SalesProposalDetail|null>(null);
  const [creating,setCreating]=useState(false);
  const [converting,setConverting]=useState<SalesProposalDetail|null>(null);
  const [converted,setConverted]=useState(false);
  const [toast,setToast]=useState<string|null>(null);

  useEffect(()=>{
    const id=window.setTimeout(()=>setSearchDebounced(search),250);
    return ()=>window.clearTimeout(id);
  },[search]);

  const proposalsQuery=useQuery({
    queryKey:["sales",org,"proposals",searchDebounced,status,page,pageSize],
    queryFn:()=>listSalesProposals(org,{search:searchDebounced,status,page,pageSize}),
    enabled:Boolean(org&&hasPermission("sales.view")),
    staleTime:15_000,refetchOnWindowFocus:true,
    refetchInterval:30_000, // validade de propostas pode mudar sem update no banco
  });
  useEffect(()=>{
    if(!org||!hasPermission("sales.view"))return;
    const channel=supabase.channel("sales-proposals-live:"+org)
      .on("postgres_changes",{
        event:"*",schema:"public",table:"sales_proposals",
        filter:"organization_id=eq."+org,
      },()=>{
        void queryClient.invalidateQueries({queryKey:["sales",org,"proposals"]});
        void queryClient.invalidateQueries({queryKey:["sales",org,"proposal"]});
      })
      .subscribe();
    return ()=>{void supabase.removeChannel(channel);};
  },[org,hasPermission,queryClient]);

  const proposals=useMemo(()=>{
    const values=[...(proposalsQuery.data?.items||[])];
    return values.sort((a,b)=>{
      if(sort==="highest")return Number(b.total_amount)-Number(a.total_amount);
      if(sort==="lowest")return Number(a.total_amount)-Number(b.total_amount);
      const delta=new Date(b.created_at).getTime()-new Date(a.created_at).getTime();
      return sort==="oldest"?-delta:delta;
    });
  },[proposalsQuery.data?.items,sort]);
  const refresh=(message?:string)=>{
    if(message)setToast(message);
    void queryClient.invalidateQueries({queryKey:["sales",org]});
  };
  const newProposal=()=>{
    setSelectedId(null);
    setCreating(true);
  };

  return <div className="min-w-0 space-y-4 pb-6">
    {toast&&<Toast type="success" message={toast} onClose={()=>setToast(null)}/>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold">Propostas comerciais</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Crie orçamentos, acompanhe a negociação e converta propostas aprovadas em pedidos.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {hasPermission("sales.proposals.manage")&&<AdminButton size="sm" onClick={newProposal}>
          <Plus size={15}/> Nova proposta
        </AdminButton>}
      </div>
    </div>
<AdminSearchPanel title="Buscar propostas"
      headerActions={<>
        {(search||status!=="all"||sort!=="newest")&&<AdminSearchClearButton onClick={()=>{
          setSearch("");setStatus("all");setPage(1);setSort("newest");
        }}/>}
        <AdminSearchSortMenu label="Ordenar propostas nesta página" value={sort}
          onChange={setSort} options={[
            {value:"newest",label:"Mais recentes"},
            {value:"oldest",label:"Mais antigas"},
            {value:"highest",label:"Maior valor"},
            {value:"lowest",label:"Menor valor"},
          ]}/>
      </>}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_210px]">
        <AdminSearchTextField label="Número, cliente, produto ou SKU"
          value={search} onChange={value=>{setSearch(value);setPage(1);}}
          placeholder="Buscar propostas..."/>
        <label className="min-w-0 space-y-1.5">
          <span className="block text-xs font-semibold text-muted-foreground">Situação</span>
          <select value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}
            className="h-[42px] w-full rounded-lg border border-border bg-background px-3 text-sm md:h-9">
            {options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
    </AdminSearchPanel>

    {!hasPermission("sales.view")?
      <EmptyState icon={ClipboardList} title="Acesso indisponível" message="Solicite permissão para consultar Vendas."/>
      :proposalsQuery.isPending?<LoadingState text="Carregando propostas comerciais..."/>
      :proposalsQuery.isError?<div className="space-y-2 rounded-lg border border-destructive/25 p-4">
        <p className="text-sm text-destructive">{systemErrorMessage(proposalsQuery.error,"Não foi possível carregar as propostas.")}</p>
        <AdminButton size="sm" variant="secondary" onClick={()=>void proposalsQuery.refetch()}>Tentar novamente</AdminButton>
      </div>
      :!proposalsQuery.data?.items.length?
      <EmptyState icon={ClipboardList} title="Nenhuma proposta encontrada"
        message="Crie um orçamento a partir da Vitrine ou ajuste os filtros."/>
      :<AdminCard square className="[&_th]:md:py-2 [&_td]:md:py-2.5">
        <div className="divide-y divide-border md:hidden">
          {proposals.map(proposal=><button type="button" key={proposal.id}
            onClick={()=>setSelectedId(proposal.id)}
            aria-label={"Abrir proposta "+proposal.proposal_number}
            className="flex w-full min-w-0 items-start gap-3 p-3.5 text-left outline-none hover:bg-muted/25 focus-visible:bg-primary/10">
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-foreground">Proposta #{proposal.proposal_number}</span>
                <strong className="tabular-nums text-sm text-emerald-700 dark:text-emerald-400">{formatCurrency(proposal.total_amount)}</strong>
              </div>
              <p className="truncate text-sm font-medium text-foreground">{proposal.customer_name_snapshot}</p>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className={"inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold "+
                  (proposal.effective_status==="approved"||proposal.effective_status==="converted"
                    ?"border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300":
                   proposal.effective_status==="expired"||proposal.effective_status==="rejected"
                    ?"border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300":
                    "border-border bg-muted/30 text-foreground")}>
                  {statuses[proposal.effective_status]||proposal.effective_status}
                </span>
                <span className="text-xs text-muted-foreground">
                  Validade: {formatSalesDueDate(proposal.valid_until)}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {proposal.seller_name} · {formatSalesDate(proposal.created_at)}
              </p>
            </div>
            <ChevronRight size={18} className="mt-1 shrink-0 text-muted-foreground" aria-hidden="true"/>
          </button>)}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <TopTableScrollbar/>
          <table className="min-w-[710px]">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left">Proposta</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Situação</th>
                <th className="px-4 py-3 text-left">Validade</th>
                <th className="px-4 py-3 text-left">Criada em</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {proposals.map(proposal=><tr key={proposal.id}
                tabIndex={0} role="button" aria-label={"Abrir proposta "+proposal.proposal_number}
                onClick={()=>setSelectedId(proposal.id)}
                onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){
                  event.preventDefault();setSelectedId(proposal.id);
                }}}
                className="cursor-pointer hover:bg-muted/20 focus-visible:bg-primary/10">
                <td className="px-4 py-3 align-top">
                  <p className="font-semibold">#{proposal.proposal_number}</p>
                  <p className="mt-1 max-w-36 truncate text-xs text-muted-foreground">{proposal.seller_name}</p>
                </td>
                <td className="max-w-52 px-4 py-3 align-top">
                  <p className="truncate font-semibold">{proposal.customer_name_snapshot}</p>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className={"inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold "+
                    (proposal.effective_status==="approved"||proposal.effective_status==="converted"
                      ?"border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300":
                    proposal.effective_status==="expired"||proposal.effective_status==="rejected"
                      ?"border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300":
                      "border-border bg-muted/30 text-foreground")}>
                    {statuses[proposal.effective_status]||proposal.effective_status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-muted-foreground">
                  {formatSalesDueDate(proposal.valid_until)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-muted-foreground">
                  {formatSalesDate(proposal.created_at)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right align-top">
                  <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(proposal.total_amount)}</strong>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <PaginationBar page={page} pageSize={pageSize}
          totalItems={proposalsQuery.data.total} onPageChange={setPage}
          onPageSizeChange={size=>{setPageSize(size);setPage(1);}}
          pageSizeOptions={[10,15,25,50]} defaultPageSize={15}
          storageKey="union-sales-proposals-page-size" showFilteredTotal/>
      </AdminCard>}

    {selectedId&&<SalesProposalDetailDialog organizationId={org} id={selectedId}
      onClose={()=>setSelectedId(null)}
      onEdit={proposal=>setEditing(proposal)}
      onConvert={proposal=>{setConverted(false);setConverting(proposal);}}
      onChanged={message=>refresh(message)}
    />}
    {creating&&<SalesProposalEditorDialog key={"new-proposal:"+org}
      organizationId={org}
      onClose={()=>setCreating(false)}
      onSaved={message=>{setCreating(false);refresh(message);}}
    />}
    {editing&&<SalesProposalEditorDialog key={editing.id+":"+editing.updated_at}
      organizationId={org} initial={editing} onClose={()=>setEditing(null)}
      onSaved={message=>{setEditing(null);refresh(message);}}
    />}
    {converting&&<SalesCheckoutDialog key={"proposal-convert:"+converting.id}
      open
      items={converting.items.map(item=>({
        product:{
          product_id:item.product_id,
          inventory_item_id:null,
          name:item.name,sku:item.sku,barcode:null,
          price:item.unit_price,cover_media_id:null,
          quantity:item.quantity,min_quantity:0,unit:"un",conversion_factor:1,
        } satisfies PdvProduct,
        quantity:item.quantity,
      }))}
      proposal={{
        id:converting.id,
        customer:{
          id:converting.customer_id,name:converting.customer_name_snapshot,
          document:converting.customer_document_snapshot,phone:null,whatsapp:null,
        },
        discount:Number(converting.discount_amount||0),
      }}
      onClose={()=>{
        setConverting(null);
        if(converted)navigate("/admin/sales/orders"+modeSuffix);
        setConverted(false);
      }}
      onCompleted={sale=>{
        setConverted(true);
        refresh("Proposta convertida no pedido #"+sale.order_number+".");
      }}
    />}
  </div>;
}
