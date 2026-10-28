import { useState } from "react";
import { ClipboardList } from "lucide-react";
import type { CustomerPortal, CustomerServiceOrder } from "../infrastructure/customer-account.repository";
import { CustomerOrderDetailsModal } from "./CustomerOrderDetailsModal";

const date=(value?:string|null)=>value?new Date(value).toLocaleDateString("pt-BR"):"—";

/** O status de conclusão/cancelamento define somente a faixa lateral, não a situação mostrada. */
export function customerOrderStatusTone(item:CustomerServiceOrder){
  const status=(item.status||"").trim().toLocaleLowerCase("pt-BR");
  if(item.cancelled_at || status.includes("cancelad"))return {edge:"bg-red-500",badge:"bg-red-50 text-red-700 border-red-200"};
  if(item.completed_at || status.includes("fechad") || status.includes("concluíd"))
    return {edge:"bg-blue-600",badge:"bg-blue-50 text-blue-700 border-blue-200"};
  if(status.includes("abert") || status.includes("andamento"))
    return {edge:"bg-emerald-500",badge:"bg-emerald-50 text-emerald-700 border-emerald-200"};
  return {edge:"bg-slate-400",badge:"bg-slate-50 text-slate-700 border-slate-200"};
}

/** A lista não deve misturar equipamento e descrição do serviço. */
export function customerOrderEquipment(item:CustomerServiceOrder){
  return (item.equipment||item.model||"").trim() || "Não informado";
}

function SituationBadge({item}:{item:CustomerServiceOrder}){
  const name=item.situation_name?.trim()||"Sem situação";
  const color=/^#[0-9a-f]{6}$/i.test(item.situation_color||"") ? item.situation_color! : "#1032DC";
  return <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[#d9e4f1] bg-[#f4f7fc] px-2.5 py-1 text-[11px] font-semibold text-[#284565]">
    <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{backgroundColor:color}}/>
    <span className="truncate">{name}</span>
  </span>;
}

export function CustomerCrmHistory({portal}:{portal:CustomerPortal}) {
  const [selected,setSelected]=useState<CustomerServiceOrder|null>(null);
  const orders=portal.service_orders||[];
  if(!portal.crm_access)return <div className="rounded-xl border border-[#e2e8f1] bg-white px-5 py-10 text-center text-sm text-[#687f9c]">
    O acesso ao histórico do CRM precisa ser ativado pela recepção da Artvideo.
  </div>;
  return <div className="space-y-3">
    {orders.length ? <>
      {/* Mesmo conceito de cards da listagem de OS do CRM, sem tabela larga no celular. */}
      <div className="space-y-2 md:hidden" aria-label="Minhas ordens de serviço">
        {orders.map(item=>{
          const tone=customerOrderStatusTone(item);
          return <button type="button" key={item.id} onClick={()=>setSelected(item)}
            aria-label={"Abrir detalhes da OS "+item.os_number}
            className="relative block w-full overflow-hidden rounded-xl border border-[#e2e8f1] bg-white px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-[#f3f7ff] active:bg-[#ecf3ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1032DC]">
            <span className={"absolute bottom-0 left-0 top-0 w-1.5 "+tone.edge} aria-hidden="true"/>
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#6b809a]">Ordem de serviço</p>
                <p className="mt-0.5 text-[14px] font-bold text-[#193756]">OS {item.os_number}</p>
              </div>
              <SituationBadge item={item}/>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-[#eef1f6] pt-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#6b809a]">Equipamento</p>
                <p className="mt-1 break-words text-[12px] font-medium text-[#263f5c]">{customerOrderEquipment(item)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#6b809a]">Abertura</p>
                <p className="mt-1 text-[12px] font-medium text-[#263f5c]">{date(item.created_at)}</p>
              </div>
            </div>
          </button>;
        })}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-[#e2e8f1] bg-white md:block">
        <table className="w-full min-w-[600px] border-collapse text-left text-[13px]">
          <thead className="bg-[#f3f6fa] text-[11px] font-bold uppercase tracking-wider text-[#61748e]">
            <tr><th className="px-4 py-3">Ordem de serviço</th><th className="px-4 py-3">Equipamento</th>
              <th className="px-4 py-3">Situação</th><th className="px-4 py-3">Abertura</th></tr>
          </thead>
          <tbody className="divide-y divide-[#ecf0f6]">
            {orders.map(item=>{
              const tone=customerOrderStatusTone(item);
              return <tr key={item.id} className="cursor-pointer transition-colors hover:bg-[#f3f7ff] focus-visible:bg-[#f3f7ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1032DC]"
                tabIndex={0} role="button" aria-label={"Abrir detalhes da OS "+item.os_number}
                onClick={()=>setSelected(item)}
                onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setSelected(item);}}}>
                <td className="relative py-3 pl-6 pr-4 font-bold text-[#193756]">
                  <span className={"absolute bottom-1 left-0 top-1 w-1.5 rounded-r "+tone.edge} aria-hidden="true"/>
                  OS {item.os_number}
                </td>
                <td className="max-w-[260px] px-4 py-3">
                  <span className="block truncate font-medium text-[#263f5c]">{customerOrderEquipment(item)}</span>
                </td>
                <td className="px-4 py-3"><SituationBadge item={item}/></td>
                <td className="whitespace-nowrap px-4 py-3 text-[#657b95]">{date(item.created_at)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </> : <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-[#e2e8f1] bg-white px-5 py-10 text-center">
      <ClipboardList size={25} className="text-[#91a5c0]"/>
      <p className="text-sm text-[#687f9c]">Nenhuma ordem de serviço vinculada à sua conta.</p>
    </div>}
    {selected&&<CustomerOrderDetailsModal order={selected} onClose={()=>setSelected(null)}/>}
  </div>;
}
