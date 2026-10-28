import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, FileText, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { listQuotesPage,listRequestStatuses } from "../infrastructure/quotes.repository";
import type { AdminTab } from "@/features/admin-shell/domain/admin.types";
import { AdminCard,AdminRowActionsTrigger,PageHeader } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel,AdminSearchClearButton,AdminSearchSortMenu,AdminSearchTextField } from "@/shared/ui/admin/AdminSearchPanel";
import { formatCnpj,formatCpf,formatPhone,formatDateTime } from "@/shared/domain/formatters";
import { EmptyState,LoadingState,PageLoadingState,StatusBadge,useAdminInitialLoading } from "@/shared/ui/admin/AdminFeedback";
import { AdminFieldLabel,AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/shared/ui/primitives/dropdown-menu";

type QuoteSort = "" | "asc" | "desc";
type Props = {
  embedded?:boolean;
  routeResourceId?:string|null;
  onRouteChange?:(resourceId:string|null,subpage?:string|null)=>void;
  onNavigate?:(tab:AdminTab)=>void;
};
function useDebounced(value:string,delay=300){
  const [ready,setReady]=useState(value);
  useEffect(()=>{const timer=window.setTimeout(()=>setReady(value),delay);return ()=>window.clearTimeout(timer);},[value,delay]);
  return ready;
}
function DocumentValue({customer}:{customer:any}){
  return <>{customer?.customer_type==="PJ"
    ? customer?.cnpj?formatCnpj(customer.cnpj):"—"
    : customer?.document?formatCpf(customer.document):"—"}</>;
}
export function TabQuotes({embedded=false,onRouteChange}:Props){
  const {hasPermission,activeOrganizationId}=useAuth();
  const org=activeOrganizationId||"";
  const canView=hasPermission("quotes.table.view");
  const canOpen=hasPermission("quotes.details.view");
  const showProtocol=hasPermission("quotes.table.protocol");
  const showCustomer=hasPermission("quotes.table.customer");
  const showDocument=hasPermission("quotes.table.document");
  const showService=hasPermission("quotes.table.service_brand");
  const showStatus=hasPermission("quotes.table.status");
  const showDate=hasPermission("quotes.table.created_at");
  const [customer,setCustomer]=useState("");
  const [document,setDocument]=useState("");
  const [protocol,setProtocol]=useState("");
  const [status,setStatus]=useState("");
  const [sort,setSort]=useState<QuoteSort>("");
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(10);
  const readyCustomer=useDebounced(customer);
  const readyDocument=useDebounced(document);
  const readyProtocol=useDebounced(protocol);
  const filters=useMemo(()=>({
    page,pageSize,customerSearch:readyCustomer,documentSearch:readyDocument,
    protocolSearch:readyProtocol,statusId:status,sort,
  }),[page,pageSize,readyCustomer,readyDocument,readyProtocol,status,sort]);
  const statusesQuery=useQuery({
    queryKey:[...queryKeys.quotes.all,org,"statuses"],
    enabled:Boolean(org&&canView),
    queryFn:async()=>{const r=await listRequestStatuses(org);if(r.error)throw r.error;return r.data||[];},
  });
  const quotesQuery=useQuery({
    queryKey:[...queryKeys.quotes.lists(),org,filters],
    enabled:Boolean(org&&canView),queryFn:()=>listQuotesPage(org,filters),
  });
  const initialLoading=useAdminInitialLoading(Boolean(org&&canView&&(quotesQuery.isPending||statusesQuery.isPending)),org);
  const rows=quotesQuery.data?.items||[];
  const total=quotesQuery.data?.total||0;
  const totalPages=Math.max(1,Math.ceil(total/pageSize));
  const safePage=Math.min(page,totalPages);
  const hasActiveFilters=Boolean(customer||document||protocol||status);
  const hasAdjustments=hasActiveFilters||Boolean(sort);
  useEffect(()=>{setPage(1);},[customer,document,protocol,status,sort]);
  useEffect(()=>{if(page>totalPages)setPage(totalPages);},[page,totalPages]);
  const clear=()=>{setCustomer("");setDocument("");setProtocol("");setStatus("");setSort("");setPage(1);};
  const open=(quote:any)=>{if(canOpen)onRouteChange?.(quote.id,null);};
  const statusName=(quote:any)=>quote.request_status?.slug==="PENDENTE"?"Recebida":quote.statusName||"Sem situação";
  // Mesmo menu de ações utilizado na lista de Ordens de Serviço.
  const quickActions=(quote:any)=> <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <AdminRowActionsTrigger label={`Ações do orçamento ${quote.protocol||quote.id.slice(0,8)}`}/>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56" onClick={event=>event.stopPropagation()}>
      {canOpen ? <DropdownMenuItem className="font-semibold" onSelect={()=>open(quote)}>
        <ClipboardList size={15}/> Ver detalhes
      </DropdownMenuItem>:<DropdownMenuItem disabled>Sem ações disponíveis</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
  if(initialLoading)return <PageLoadingState text="Carregando orçamentos"/>;
  return <div className="min-w-0 space-y-5">
    {!embedded&&<PageHeader title="Orçamentos" subtitle={total+" solicitações recebidas pelo site"}/>}
    {canView&&<AdminSearchPanel title="Buscar orçamentos" headerActions={<>
      {hasAdjustments&&<AdminSearchClearButton onClick={clear}/>}
      <AdminSearchSortMenu value={sort} onChange={v=>setSort(v as QuoteSort)}
        options={[{value:"",label:"Mais recentes"},{value:"asc",label:"Protocolo crescente"},{value:"desc",label:"Protocolo decrescente"}]}/>
    </>}>
      <div className="grid min-w-0 grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminSearchTextField label="Cliente" value={customer} onChange={setCustomer} placeholder="Nome do cliente"/>
        <AdminSearchTextField label="CPF/CNPJ" value={document} onChange={setDocument} placeholder="CPF ou CNPJ"/>
        <AdminSearchTextField label="Protocolo" value={protocol} onChange={setProtocol} placeholder="Número do orçamento"/>
        <div className="min-w-0"><AdminFieldLabel label="Situação"/>
          <AdminSelect className="w-full min-w-0" value={status} onValueChange={setStatus}
            options={[{value:"",label:"Todas"},...(statusesQuery.data||[]).map(s=>({value:s.id,label:s.name}))]}
            ariaLabel="Filtrar por situação"/></div>
      </div>
    </AdminSearchPanel>}
    {canView&&<AdminCard className="[&_th]:md:py-2 [&_td]:md:py-2.5">
      {quotesQuery.isPending?<LoadingState/>:quotesQuery.isError?
        <p role="alert" className="p-5 text-sm text-destructive">Não foi possível carregar os orçamentos.</p>:
       !rows.length?<EmptyState icon={FileText} title="Nenhum orçamento encontrado" message="Ajuste os filtros ou aguarde novas solicitações."/>:
       <>
         <div className="divide-y divide-border md:hidden">{rows.map(quote=>{
           const person=quote.customer as any;return <article key={quote.id}
             role={canOpen?"button":undefined} tabIndex={canOpen?0:undefined}
             onClick={()=>open(quote)}
             onKeyDown={event=>{if(canOpen&&(event.key==="Enter"||event.key===" ")){event.preventDefault();open(quote);}}}
             className="w-full space-y-3 p-4 text-left hover:bg-muted/30">
             <div className="flex items-start justify-between gap-3">
               <div className="min-w-0">
                 {showProtocol&&<p className="font-mono text-xs font-black text-primary">{quote.protocol||quote.id.slice(0,8)}</p>}
                 {showCustomer&&<p className="truncate text-sm font-bold">{person?.full_name||person?.trade_name||"—"}</p>}
               </div>
               <div className="flex shrink-0 items-center gap-1">
                 {showStatus&&<StatusBadge status={statusName(quote)} color={quote.request_status?.color}/>}
                 <div onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
                   {quickActions(quote)}
                 </div>
               </div>
             </div>
             <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
               <Wrench size={15}/><span>Serviço</span>
               {showService&&<span>· {(quote.service as any)?.title||"Serviço solicitado"}</span>}
             </div>
             <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
               {showDocument&&<span><DocumentValue customer={person}/></span>}
               {showDate&&<span>{formatDateTime(quote.created_at)}</span>}
             </div>
           </article>;
         })}</div>
         <div className="hidden overflow-x-auto md:block">
           <table className="min-w-[810px]"><thead><tr>
             {showProtocol&&<th className="text-left">Protocolo</th>}
             {showCustomer&&<th className="text-left">Cliente</th>}
             {showDocument&&<th className="text-left">CPF/CNPJ</th>}
             {showService&&<th className="text-left">Serviço / Equipamento</th>}
             {showStatus&&<th className="text-left">Situação</th>}
             {showDate&&<th className="text-left">Recebido em</th>}
             <th className="text-right">Ações</th>
           </tr></thead><tbody>{rows.map(quote=>{
             const person=quote.customer as any;
             return <tr key={quote.id} tabIndex={canOpen?0:undefined}
               onClick={()=>open(quote)}
               onKeyDown={event=>{if(canOpen&&(event.key==="Enter"||event.key===" ")){event.preventDefault();open(quote);}}}
               className={canOpen?"cursor-pointer hover:bg-muted/40 focus-visible:bg-muted/40":""}>
               {showProtocol&&<td className="font-mono text-xs font-black text-primary">{quote.protocol||quote.id.slice(0,8)}</td>}
               {showCustomer&&<td><p className="font-bold">{person?.full_name||person?.trade_name||"—"}</p><p className="text-xs text-muted-foreground">{formatPhone(person?.whatsapp||person?.phone)}</p></td>}
               {showDocument&&<td className="text-xs text-muted-foreground"><DocumentValue customer={person}/></td>}
               {showService&&<td className="text-xs text-muted-foreground">{(quote.service as any)?.title||"Serviço solicitado"} · {(quote.brand as any)?.name||"—"}</td>}
               {showStatus&&<td><StatusBadge status={statusName(quote)} color={quote.request_status?.color}/></td>}
               {showDate&&<td className="text-xs">{formatDateTime(quote.created_at)}</td>}
               <td onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}
                 className="text-right">
                 <div className="flex justify-end">{quickActions(quote)}</div>
               </td>
             </tr>;
           })}</tbody></table>
         </div>
       </>}
      <PaginationBar page={safePage} pageSize={pageSize} totalItems={total} showFilteredTotal={hasActiveFilters}
        onPageChange={setPage} onPageSizeChange={size=>{setPageSize(size);setPage(1);}}/>
    </AdminCard>}
  </div>;
}
