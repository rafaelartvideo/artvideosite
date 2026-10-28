import { useState } from "react";
import { ClipboardList } from "lucide-react";
import type { CustomerPortal, CustomerServiceOrder } from "../infrastructure/customer-account.repository";
import { CustomerOrderDetailsModal } from "./CustomerOrderDetailsModal";

const date=(value?:string|null)=>value?new Date(value).toLocaleDateString("pt-BR"):"—";
export function customerOrderStatusTone(item:CustomerServiceOrder){
  const status=item.status.trim().toLocaleLowerCase("pt-BR");
  if(status.includes("cancelad"))return {edge:"bg-red-500",badge:"bg-red-50 text-red-700 border-red-200"};
  if(item.completed_at || status.includes("fechad") || status.includes("concluíd"))
    return {edge:"bg-blue-600",badge:"bg-blue-50 text-blue-700 border-blue-200"};
  if(status.includes("abert") || status.includes("andamento"))
    return {edge:"bg-emerald-500",badge:"bg-emerald-50 text-emerald-700 border-emerald-200"};
  return {edge:"bg-slate-400",badge:"bg-slate-50 text-slate-700 border-slate-200"};
}
export function CustomerCrmHistory({portal}:{portal:CustomerPortal}) {
  const [selected,setSelected]=useState<CustomerServiceOrder|null>(null);
  const orders=portal.service_orders||[];
  if(!portal.crm_access)return <div className="rounded-xl border border-[#e2e8f1] bg-white px-5 py-10 text-center text-sm text-[#687f9c]">
    O acesso ao histórico do CRM precisa ser ativado pela recepção da Artvideo.
  </div>;
  return <div className="space-y-3">
    {orders.length ? <div className="overflow-x-auto rounded-xl border border-[#e2e8f1] bg-white">
      <table className="w-full min-w-[600px] border-collapse text-left text-[13px]">
        <thead className="bg-[#f3f6fa] text-[11px] font-bold uppercase tracking-wider text-[#61748e]">
          <tr><th className="px-4 py-3">Ordem de serviço</th><th className="px-4 py-3">Equipamento / serviço</th>
            <th className="px-4 py-3">Status</th><th className="px-4 py-3">Abertura</th></tr>
        </thead>
        <tbody className="divide-y divide-[#ecf0f6]">
          {orders.map(item=>{
            const tone=customerOrderStatusTone(item);
            return <tr key={item.id} className="cursor-pointer transition-colors hover:bg-[#f3f7ff]"
              tabIndex={0} role="button" aria-label={"Abrir detalhes da OS "+item.os_number}
              onClick={()=>setSelected(item)}
              onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setSelected(item);}}}>
              <td className="relative py-3 pl-6 pr-4 font-bold text-[#193756]">
                <span className={"absolute bottom-1 left-0 top-1 w-1.5 rounded-r "+tone.edge} aria-hidden="true"/>
                OS {item.os_number}
              </td>
              <td className="max-w-[260px] px-4 py-3">
                <span className="block truncate font-medium text-[#263f5c]">{item.model||item.description||"Ordem de serviço"}</span>
              </td>
              <td className="px-4 py-3"><span className={"inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold "+tone.badge}>{item.status}</span></td>
              <td className="whitespace-nowrap px-4 py-3 text-[#657b95]">{date(item.created_at)}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div> : <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-[#e2e8f1] bg-white px-5 py-10 text-center">
      <ClipboardList size={25} className="text-[#91a5c0]"/>
      <p className="text-sm text-[#687f9c]">Nenhuma ordem de serviço vinculada à sua conta.</p>
    </div>}
    {selected&&<CustomerOrderDetailsModal order={selected} onClose={()=>setSelected(null)}/>}
  </div>;
}
