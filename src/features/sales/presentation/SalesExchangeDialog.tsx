import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Minus, Plus, Search, Trash2 } from "lucide-react";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { searchSalesProducts } from "../infrastructure/sales.repository";
import { issueSalesExchange, type SalesReturn } from "../infrastructure/sales-operations.repository";
import type { PdvProduct } from "@/features/pdv/infrastructure/pdv.repository";

type Line = {product:PdvProduct;quantity:number};
const available=(product:PdvProduct)=>{
  const factor=product.unit==="cx"?Math.max(1,Number(product.conversion_factor||1)):1;
  return Math.floor(Math.max(0,Number(product.quantity||0))/factor);
};

export function SalesExchangeDialog({organizationId,entry,onClose,onCompleted}:{
  organizationId:string;entry:SalesReturn;onClose:()=>void;onCompleted:(message:string)=>void;
}){
  const client=useQueryClient();
  const [search,setSearch]=useState("");
  const [debounced,setDebounced]=useState("");
  const [lines,setLines]=useState<Line[]>([]);
  const [notes,setNotes]=useState("");
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    const id=window.setTimeout(()=>setDebounced(search.trim()),250);
    return ()=>window.clearTimeout(id);
  },[search]);
  const productsQuery=useQuery({
    queryKey:["sales",organizationId,"exchange-products",debounced],
    queryFn:()=>searchSalesProducts(organizationId,debounced,60),
    enabled:Boolean(organizationId),staleTime:15_000,
  });
  const total=useMemo(()=>Math.round(lines.reduce(
    (sum,line)=>sum+Number(line.product.price||0)*line.quantity,0)*100)/100,[lines]);
  const credit=Number(entry.credit_amount);
  const difference=Math.round((total-credit)*100)/100;
  const valid=lines.length>0&&Math.abs(difference)<0.005&&
    lines.every(line=>line.quantity>0&&Number.isInteger(line.quantity)&&
      line.quantity<=available(line.product));
  const busy=false;
  const mutation=useMutation({
    mutationFn:()=>issueSalesExchange(organizationId,entry.id,
      lines.map(line=>({productId:line.product.product_id,quantity:line.quantity})),notes),
    onSuccess:data=>{
      setError(null);
      void client.invalidateQueries({queryKey:["sales",organizationId]});
      void client.invalidateQueries({queryKey:["inventory"]});
      void client.invalidateQueries({queryKey:["pdv"]});
      onCompleted("Troca concluída. "+data.items+" item(ns) entregues no valor de "+
        formatCurrency(data.value)+". Nenhuma nova cobrança foi gerada.");
    },
    onError:e=>setError(systemErrorMessage(e,"Não foi possível concluir a troca.")),
  });
  const add=(product:PdvProduct)=>{
    if(available(product)<1||!(Number(product.price)>0))return;
    setLines(previous=>{
      const prior=previous.find(line=>line.product.product_id===product.product_id);
      if(prior)return previous.map(line=>line.product.product_id===product.product_id
        ?{...line,quantity:Math.min(available(product),line.quantity+1)}:line);
      return [...previous,{product,quantity:1}];
    });
    setError(null);
  };
  const update=(productId:string,quantity:number)=>{
    setLines(previous=>previous.map(line=>line.product.product_id===productId
      ?{...line,quantity:Math.max(1,Math.min(available(line.product),quantity))}:line));
    setError(null);
  };
  return <AdminDialog open onClose={()=>!mutation.isPending&&onClose()}
    title={"Concluir troca #" +entry.return_number}
    description="Escolha produtos substitutos de valor equivalente. O estoque será baixado uma única vez."
    className="w-[calc(100vw-1.25rem)] max-w-2xl"
    bodyClassName="max-h-[min(74dvh,730px)] overflow-y-auto"
    footer={<div className="flex w-full justify-end gap-2">
      <AdminButton size="sm" variant="secondary" disabled={mutation.isPending}
        onClick={onClose}>Voltar</AdminButton>
      <AdminButton size="sm" disabled={!valid||mutation.isPending}
        loading={mutation.isPending} onClick={()=>{setError(null);mutation.mutate();}}>
        <ArrowLeftRight size={15}/> Registrar entrega da troca
      </AdminButton>
    </div>}>
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
        <div><p className="text-xs text-muted-foreground">Crédito da devolução</p>
          <strong className="mt-1 block text-lg">{formatCurrency(credit)}</strong></div>
        <div><p className="text-xs text-muted-foreground">Total dos substitutos</p>
          <strong className="mt-1 block text-lg">{formatCurrency(total)}</strong></div>
      </div>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Escolher produtos substitutos</h3>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Nome, código, modelo compatível..."
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm"/>
        </div>
        {productsQuery.isPending?<LoadingState text="Buscando produtos..."/>
          :productsQuery.isError?<p role="alert" className="text-xs text-destructive">
            {systemErrorMessage(productsQuery.error,"Não foi possível buscar produtos.")}
          </p>
          :<div className="max-h-52 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {(productsQuery.data||[]).filter(product=>Number(product.price)>0).slice(0,30)
              .map(product=><div key={product.product_id}
                className="flex min-w-0 items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{product.name}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatCurrency(Number(product.price))} · {available(product)} disponíveis
                  </p>
                </div>
                <button type="button" onClick={()=>add(product)} disabled={available(product)<1}
                  aria-label={"Adicionar "+product.name}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-primary disabled:opacity-40">
                  <Plus size={16}/>
                </button>
              </div>)}
          </div>}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Itens que serão entregues</h3>
        {lines.length===0?<p className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
          Selecione os substitutos na busca.
        </p>:<div className="divide-y divide-border rounded-lg border border-border">
          {lines.map(line=><div key={line.product.product_id}
            className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{line.product.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatCurrency(Number(line.product.price))} × {line.quantity}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Diminuir quantidade"
                onClick={()=>update(line.product.product_id,line.quantity-1)}
                disabled={line.quantity<=1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border disabled:opacity-40">
                <Minus size={14}/>
              </button>
              <span className="w-9 text-center text-sm tabular-nums">{line.quantity}</span>
              <button type="button" aria-label="Aumentar quantidade"
                onClick={()=>update(line.product.product_id,line.quantity+1)}
                disabled={line.quantity>=available(line.product)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border disabled:opacity-40">
                <Plus size={14}/>
              </button>
              <button type="button" aria-label={"Remover "+line.product.name}
                onClick={()=>setLines(previous=>previous.filter(item=>
                  item.product.product_id!==line.product.product_id))}
                className="ml-1 flex h-8 w-8 items-center justify-center text-destructive">
                <Trash2 size={15}/>
              </button>
            </div>
          </div>)}
        </div>}
      </section>
      {lines.length>0&&Math.abs(difference)>=0.005&&<p role="status"
        className="rounded-lg border border-orange-500/30 p-3 text-xs text-orange-700 dark:text-orange-300">
        {difference>0?"Os produtos substitutos ultrapassam o crédito em ":"O crédito supera os substitutos em "}
        <strong>{formatCurrency(Math.abs(difference))}</strong>.
        Para valores diferentes, finalize a diferença comercial em um pedido separado.
      </p>}
      <label className="block space-y-1 text-xs font-semibold"><span>Observações (opcional)</span>
        <textarea value={notes} rows={3} maxLength={1000} onChange={e=>setNotes(e.target.value)}
          placeholder="Ex.: substituição por peça equivalente."
          className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm"/>
      </label>
      {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Trocas equivalentes não geram nova venda ou recebimento: apenas documentam a saída dos produtos substitutos.
        Estoque reservado para outras propostas não pode ser utilizado.
      </p>
    </div>
  </AdminDialog>;
}
