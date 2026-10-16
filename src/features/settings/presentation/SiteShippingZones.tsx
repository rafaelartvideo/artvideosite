import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminDialog, AdminStickyToolbar, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { Toast } from "@/shared/ui/admin/AdminFeedback";

type ShippingZone = {
  id: string; title: string; cep_start: string; cep_end: string;
  price: number; delivery_days: number | null; active: boolean;
};
type Draft = { id?: string; title: string; start: string; end: string;
  mode: "single" | "range"; price: string; days: string; active: boolean };
const emptyDraft: Draft = { title: "Entrega regional", start: "", end: "",
  mode: "single", price: "0.00", days: "", active: true };
const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, 8);
const displayCep = (value: string) => /^\d{8}$/.test(value) ? value.replace(/^(\d{5})(\d{3})$/, "$1-$2") : value;
const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export function SiteShippingZones({ canUpdate, onBack }: { canUpdate: boolean; onBack: () => void }) {
  const [items, setItems] = useState<ShippingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error } = await supabase.from("artvideo_shipping_zones")
      .select("id,title,cep_start,cep_end,price,delivery_days,active")
      .order("cep_start", { ascending: true })
      .order("cep_end", { ascending: true });
    if (error) setError(systemErrorMessage(error));
    else setItems((data || []) as ShippingZone[]);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const filtered = useMemo(() => {
    const q = search.replace(/\D/g, "");
    const name = search.trim().toLocaleLowerCase("pt-BR");
    return items.filter(row => !name || row.title.toLocaleLowerCase("pt-BR").includes(name)
      || (q && (row.cep_start.includes(q) || row.cep_end.includes(q))));
  }, [items, search]);
  const lastPage = Math.max(1, Math.ceil(filtered.length / 10));
  const rows = filtered.slice((Math.min(page, lastPage) - 1) * 10, Math.min(page, lastPage) * 10);

  const save = async () => {
    if (!draft || saving || !canUpdate) return;
    const start = onlyDigits(draft.start);
    const end = draft.mode === "single" ? start : onlyDigits(draft.end);
    const amount = Number(draft.price.replace(",", "."));
    const days = draft.days.trim() ? Number(draft.days) : null;
    if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end) || start > end) {
      setToast({ msg: "Confira os CEPs. O CEP final deve ser igual ou maior que o inicial.", type: "error" }); return;
    }
    if (!draft.title.trim() || draft.title.trim().length < 2 || draft.title.length > 100 ||
      !Number.isFinite(amount) || amount < 0 || amount > 99999 ||
      (days !== null && (!Number.isInteger(days) || days < 1 || days > 120))) {
      setToast({ msg: "Informe nome, valor e prazo válidos. O prazo é opcional.", type: "error" }); return;
    }
    if (items.some(item => item.id !== draft.id && item.cep_start === start && item.cep_end === end)) {
      setToast({ msg: "Essa faixa de CEP já está cadastrada.", type: "error" }); return;
    }
    setSaving(true);
    const payload = { title: draft.title.trim(), cep_start: start, cep_end: end,
      price: amount, delivery_days: days, active: draft.active };
    const result = draft.id
      ? await supabase.from("artvideo_shipping_zones").update(payload).eq("id", draft.id)
      : await supabase.from("artvideo_shipping_zones").insert(payload);
    setSaving(false);
    if (result.error) {
      setToast({ msg: systemErrorMessage(result.error), type: "error" }); return;
    }
    setDraft(null); setToast({ msg: "Regra de entrega salva.", type: "success" });
    await refresh();
  };
  const remove = async (item: ShippingZone) => {
    if (!canUpdate || saving || !window.confirm(`Excluir a regra para ${displayCep(item.cep_start)}${item.cep_end !== item.cep_start ? ` até ${displayCep(item.cep_end)}` : ""}?`)) return;
    setSaving(true);
    const { error } = await supabase.from("artvideo_shipping_zones").delete().eq("id", item.id);
    setSaving(false);
    if (error) setToast({ msg: systemErrorMessage(error), type: "error" });
    else { setToast({ msg: "Regra excluída.", type: "success" }); await refresh(); }
  };
  const toggle = async (item: ShippingZone) => {
    if (!canUpdate || saving) return;
    setSaving(true);
    const { error } = await supabase.from("artvideo_shipping_zones")
      .update({ active: !item.active }).eq("id", item.id);
    setSaving(false);
    if (error) setToast({ msg: systemErrorMessage(error), type: "error" });
    else await refresh();
  };
  const edit = (item: ShippingZone) => setDraft({
    id: item.id, title: item.title, start: item.cep_start, end: item.cep_end,
    mode: item.cep_start === item.cep_end ? "single" : "range",
    price: String(item.price), days: item.delivery_days == null ? "" : String(item.delivery_days),
    active: item.active,
  });

  return <>
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)}/>}
    <Section title="Áreas de entrega" description="Defina CEPs atendidos, valores e prazos.">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Defina onde a Artvideo entrega e quanto cobra, por CEP ou faixa. CEPs fora das regras ativas não poderão finalizar a compra. Quando houver faixas sobrepostas, vale a mais específica; um CEP individual sempre prevalece.</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por CEP ou região" aria-label="Buscar regras de entrega"
              className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"/>
          </div>
        </div>
        {error && <div className="rounded-md border border-red-200 p-3 text-sm text-red-700">
          Falha ao carregar regras: {error} <button type="button" className="ml-2 font-bold underline" onClick={() => void refresh()}>Tentar novamente</button>
        </div>}
        {loading ? <p className="py-6 text-center text-sm text-muted-foreground">Carregando CEPs atendidos...</p> :
          rows.length === 0 ? <div className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            {items.length === 0 ? "Nenhuma área de entrega cadastrada. Adicione os CEPs atendidos para habilitar o frete regional." : "Nenhuma regra encontrada nesta busca."}
          </div> :
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground"><tr>
                <th className="px-3 py-3">Região / modalidade</th><th className="px-3 py-3">CEP atendido</th>
                <th className="px-3 py-3">Valor</th><th className="px-3 py-3">Prazo</th><th className="px-3 py-3">Ativo</th>
                {canUpdate && <th className="px-3 py-3 text-right">Ações</th>}
              </tr></thead>
              <tbody>{rows.map(item => <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-3 py-3 font-medium">{item.title}</td>
                <td className="px-3 py-3 tabular-nums">{displayCep(item.cep_start)}{item.cep_start !== item.cep_end ? ` a ${displayCep(item.cep_end)}` : ""}</td>
                <td className="px-3 py-3 font-semibold">{item.price === 0 ? "Grátis" : brl(Number(item.price))}</td>
                <td className="px-3 py-3 text-muted-foreground">{item.delivery_days ? `${item.delivery_days} dias úteis` : "Não informado"}</td>
                <td className="px-3 py-3"><button type="button" disabled={!canUpdate || saving} onClick={() => void toggle(item)}
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${item.active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{item.active ? "Sim" : "Não"}</button></td>
                {canUpdate && <td className="whitespace-nowrap px-3 py-3 text-right">
                  <button type="button" aria-label="Editar regra" onClick={() => edit(item)} className="rounded p-2 text-primary hover:bg-primary/10"><Pencil size={16}/></button>
                  <button type="button" aria-label="Excluir regra" onClick={() => void remove(item)} className="rounded p-2 text-red-600 hover:bg-red-500/10"><Trash2 size={16}/></button>
                </td>}
              </tr>)}</tbody>
            </table>
          </div>}
        {filtered.length > 10 && <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
          <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p-1))} className="rounded p-1 disabled:opacity-40"><ChevronLeft size={17}/></button>
          {Math.min(page, lastPage)} de {lastPage}
          <button type="button" disabled={page >= lastPage} onClick={() => setPage(p => Math.min(lastPage, p+1))} className="rounded p-1 disabled:opacity-40"><ChevronRight size={17}/></button>
        </div>}
      </div>
    </Section>
    <AdminStickyToolbar className="mt-5">
      <BtnSecondary onClick={onBack} disabled={saving}>Voltar</BtnSecondary>
      {canUpdate && <BtnPrimary onClick={() => setDraft({...emptyDraft})} disabled={saving}><Plus size={16} /> Novo</BtnPrimary>}
    </AdminStickyToolbar>
    <AdminDialog open={Boolean(draft)} onClose={() => { if (!saving) setDraft(null); }}
      title={draft?.id ? "Editar área de entrega" : "Nova área de entrega"}
      description="Controle quais CEPs poderão receber os produtos e o preço do frete."
      className="max-w-lg" footer={<div className="flex justify-end gap-2">
        <BtnSecondary disabled={saving} onClick={() => setDraft(null)}>Cancelar</BtnSecondary>
        <BtnPrimary disabled={saving} loading={saving} loadingText="Salvando..." onClick={() => void save()}>Salvar</BtnPrimary>
      </div>}>
      {draft && <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {([{value:"single",label:"CEP individual"},{value:"range",label:"Faixa de CEPs"}] as const).map(option =>
            <button key={option.value} type="button" onClick={() => setDraft(d => d ? {...d,mode:option.value} : d)}
              className={`min-h-10 rounded-md border px-3 text-xs font-bold transition-colors ${draft.mode===option.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/40"}`}>
              {option.label}
            </button>)}
        </div>
        <FInput label="Nome da região ou modalidade" value={draft.title} maxLength={100} required
          onChange={(e:any)=>setDraft(d=>d?{...d,title:e.target.value}:d)}/>
        <div className="grid gap-3 sm:grid-cols-2">
          <FInput label={draft.mode==="single"?"CEP":"CEP inicial"} required value={draft.start} inputMode="numeric"
            placeholder="00000000" maxLength={8} onChange={(e:any)=>setDraft(d=>d?{...d,start:onlyDigits(e.target.value)}:d)}/>
          {draft.mode==="range" && <FInput label="CEP final" required inputMode="numeric" value={draft.end}
            placeholder="00000000" maxLength={8} onChange={(e:any)=>setDraft(d=>d?{...d,end:onlyDigits(e.target.value)}:d)}/>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FInput label="Valor do frete (R$)" type="number" min={0} max={99999} step="0.01" required
            value={draft.price} onChange={(e:any)=>setDraft(d=>d?{...d,price:e.target.value}:d)}/>
          <FInput label="Prazo (dias úteis, opcional)" type="number" min={1} max={120} step={1}
            value={draft.days} onChange={(e:any)=>setDraft(d=>d?{...d,days:e.target.value}:d)}/>
        </div>
        <FToggle label="Regra ativa" checked={draft.active}
          description="Se desativada, não será considerada na consulta de entrega."
          onChange={v=>setDraft(d=>d?{...d,active:v}:d)}/>
        <p className="text-xs text-muted-foreground">Para oferecer frete grátis, informe valor zero. Os preços são por pedido, independentemente do peso ou das medidas.</p>
      </div>}
    </AdminDialog>
  </>;
}
