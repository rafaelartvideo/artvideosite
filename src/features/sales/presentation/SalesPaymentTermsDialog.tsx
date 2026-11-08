import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { listSalesPaymentPresets,saveSalesPaymentPreset } from "../infrastructure/sales-operations.repository";

export function SalesPaymentTermsDialog({organizationId,onClose}:{
  organizationId:string;onClose:()=>void;
}) {
  const client=useQueryClient();
  const [name,setName]=useState("");
  const [count,setCount]=useState(1);
  const [days,setDays]=useState(30);
  const [error,setError]=useState<string|null>(null);
  const query=useQuery({
    queryKey:["sales",organizationId,"payment-presets"],
    queryFn:()=>listSalesPaymentPresets(organizationId),
    enabled:Boolean(organizationId),
  });
  const mutation=useMutation({
    mutationFn:(input:{name:string;installments:number;days:number;active?:boolean})=>
      saveSalesPaymentPreset(organizationId,input),
    onSuccess:()=>{
      setError(null);setName("");
      void client.invalidateQueries({queryKey:["sales",organizationId,"payment-presets"]});
    },
    onError:e=>setError(systemErrorMessage(e,"Não foi possível salvar a condição de pagamento.")),
  });
  return <AdminDialog open onClose={()=>!mutation.isPending&&onClose()}
    title="Condições de pagamento"
    description="Padronize prazos usados pela equipe, evitando preencher parcelas e vencimentos repetidamente."
    className="w-[calc(100vw-1.25rem)] max-w-xl"
    footer={<AdminButton variant="secondary" size="sm" onClick={onClose}>Fechar</AdminButton>}>
    <div className="space-y-4">
      {query.isPending?<LoadingState text="Carregando condições..."/>
        :query.isError?<p role="alert" className="text-xs text-destructive">
          {systemErrorMessage(query.error,"Não foi possível consultar as condições.")}
        </p>
        :<div className="divide-y divide-border rounded-lg border border-border">
          {query.data?.map(preset=><div key={preset.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold">{preset.name}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {preset.installment_count} parcela(s) · primeiro vencimento em {preset.first_due_days} dia(s)
              </p>
            </div>
            <button type="button" disabled={mutation.isPending} aria-label={"Desativar "+preset.name}
              onClick={()=>mutation.mutate({
                name:preset.name,installments:preset.installment_count,
                days:preset.first_due_days,active:false,
              })}
              className="flex h-9 w-9 items-center justify-center text-destructive">
              <Trash2 size={15}/>
            </button>
          </div>)}
        </div>}
      <div className="space-y-3 border-t border-border pt-3">
        <h3 className="text-sm font-semibold">Nova condição</h3>
        <label className="block space-y-1 text-xs font-semibold">
          <span>Nome</span>
          <input value={name} maxLength={60} onChange={e=>setName(e.target.value)}
            placeholder="Ex.: 4x mensal, 45 dias..."
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"/>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs font-semibold"><span>Parcelas</span>
            <select value={count} onChange={e=>setCount(Number(e.target.value))}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
              {Array.from({length:12},(_,i)=>i+1).map(v=><option key={v} value={v}>{v}x</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold"><span>Primeiro vencimento (dias)</span>
            <input type="number" min={0} max={365} step={1} value={days}
              onChange={e=>setDays(Number(e.target.value))}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"/>
          </label>
        </div>
        <AdminButton size="sm" disabled={name.trim().length<2||days<0||days>365||mutation.isPending}
          loading={mutation.isPending} onClick={()=>mutation.mutate({
            name:name.trim(),installments:count,days,
          })}><Plus size={14}/> Adicionar condição</AdminButton>
      </div>
      {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
      {!error&&<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 size={13}/> As condições ficam disponíveis no checkout de toda a equipe autorizada.
      </p>}
    </div>
  </AdminDialog>;
}
