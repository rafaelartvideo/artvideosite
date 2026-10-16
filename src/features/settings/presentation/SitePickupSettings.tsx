import { useEffect, useState } from "react";
import { MapPin, Clock3, Info, Store, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminStickyToolbar, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { Toast } from "@/shared/ui/admin/AdminFeedback";

type PickupSettings = {
  enabled: boolean;
  location_name: string;
  street: string; number: string; complement: string; district: string;
  city: string; state: string; postal_code: string;
  opening_hours: string; instructions: string;
};
const initial: PickupSettings = {
  enabled: false, location_name: "Retirada na Artvideo",
  street: "", number: "", complement: "", district: "", city: "",
  state: "", postal_code: "", opening_hours: "", instructions: "",
};
const fieldClass = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary";
const labelClass = "block min-w-0 space-y-1.5 text-xs font-bold text-foreground";

export function SitePickupSettings({ canUpdate, onBack }: { canUpdate: boolean; onBack: () => void }) {
  const { activeOrganization } = useAuth();
  const [form, setForm] = useState<PickupSettings>(initial);
  const [original, setOriginal] = useState<PickupSettings>(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  useEffect(() => {
    let open = true;
    (async () => {
      const { data, error } = await supabase.from("artvideo_store_pickup_settings")
        .select("enabled,location_name,street,number,complement,district,city,state,postal_code,opening_hours,instructions")
        .maybeSingle();
      if (!open) return;
      if (error) setFeedback({ msg: systemErrorMessage(error), type: "error" });
      else if (data) {
        const value = data as PickupSettings;
        setForm(value); setOriginal(value);
      }
      setLoading(false);
    })();
    return () => { open = false; };
  }, []);
  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  const patch = (key: keyof PickupSettings, value: string | boolean) => {
    if (!canUpdate) return;
    setForm(current => ({ ...current, [key]: value }));
  };
  const save = async () => {
    if (!canUpdate || !activeOrganization?.id || saving) return;
    const postal = form.postal_code.replace(/\D/g, "");
    const clean = { ...form, postal_code: postal, state: form.state.toUpperCase().trim(),
      location_name: form.location_name.trim(), street: form.street.trim(),
      number: form.number.trim(), district: form.district.trim(), city: form.city.trim(),
      opening_hours: form.opening_hours.trim(), complement: form.complement.trim(), instructions: form.instructions.trim() };
    if (clean.enabled && (!/^\d{8}$/.test(postal) || !/^[A-Z]{2}$/.test(clean.state)
      || [clean.location_name,clean.street,clean.number,clean.district,clean.city,clean.opening_hours].some(v => v.length < 2))) {
      setFeedback({ type:"error", msg:"Para ativar a retirada, informe endereço completo, CEP e horários de atendimento." }); return;
    }
    setSaving(true);
    const { error } = await supabase.from("artvideo_store_pickup_settings")
      .upsert({ ...clean, organization_id: activeOrganization.id, updated_at: new Date().toISOString() },
        { onConflict: "organization_id" });
    setSaving(false);
    if (error) setFeedback({ type:"error", msg:systemErrorMessage(error) });
    else { setForm(clean); setOriginal(clean); setFeedback({type:"success",msg:"Configurações de retirada salvas."}); }
  };
  const back = () => {
    if (dirty && !window.confirm("Existem alterações não salvas. Deseja sair?")) return;
    onBack();
  };
  return <div className="space-y-5">
    {feedback && <Toast message={feedback.msg} type={feedback.type} onClose={()=>setFeedback(null)}/>}
    {loading ? <p className="px-4 py-10 text-sm text-muted-foreground">Carregando configurações...</p> : <>
      <Section title="Retirada na loja" description="Disponibilize a retirada gratuita como alternativa ao frete regional.">
        <div className="space-y-5">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
            <input type="checkbox" checked={form.enabled} disabled={!canUpdate||saving}
              onChange={e=>patch("enabled",e.target.checked)} className="mt-1 h-4 w-4 accent-blue-600"/>
            <span className="text-sm"><strong className="block">Permitir retirar na loja</strong>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Clientes poderão escolher a retirada gratuita durante a compra. A liberação acontece após o pagamento e a separação do pedido.
              </span>
            </span>
          </label>
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
            <Info size={17} className="shrink-0 text-primary"/>
            Nenhuma retirada será anunciada enquanto esta opção estiver desativada. Não há reserva de horário: o cliente deverá aguardar a confirmação de pedido pronto.
          </div>
        </div>
      </Section>

      <Section title="Local de retirada" description="Os dados cadastrados aparecerão para o cliente no checkout.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass+" sm:col-span-2"}>Nome exibido ao cliente *
            <input className={fieldClass} maxLength={100} disabled={!canUpdate} value={form.location_name}
              onChange={e=>patch("location_name",e.target.value)} placeholder="Eletrônica Artvideo"/>
          </label>
          <label className={labelClass+" sm:col-span-2"}>Rua / avenida *
            <input className={fieldClass} maxLength={180} disabled={!canUpdate} value={form.street}
              onChange={e=>patch("street",e.target.value)}/>
          </label>
          <label className={labelClass}>Número *
            <input className={fieldClass} maxLength={20} disabled={!canUpdate} value={form.number}
              onChange={e=>patch("number",e.target.value)}/>
          </label>
          <label className={labelClass}>Complemento
            <input className={fieldClass} maxLength={160} disabled={!canUpdate} value={form.complement}
              onChange={e=>patch("complement",e.target.value)}/>
          </label>
          <label className={labelClass}>Bairro *
            <input className={fieldClass} maxLength={100} disabled={!canUpdate} value={form.district}
              onChange={e=>patch("district",e.target.value)}/>
          </label>
          <label className={labelClass}>Cidade *
            <input className={fieldClass} maxLength={100} disabled={!canUpdate} value={form.city}
              onChange={e=>patch("city",e.target.value)}/>
          </label>
          <label className={labelClass}>UF *
            <input className={fieldClass} maxLength={2} disabled={!canUpdate} value={form.state}
              onChange={e=>patch("state",e.target.value.replace(/[^a-z]/ig,"").toUpperCase())} placeholder="SE"/>
          </label>
          <label className={labelClass}>CEP *
            <input className={fieldClass} inputMode="numeric" maxLength={8} disabled={!canUpdate}
              value={form.postal_code} onChange={e=>patch("postal_code",e.target.value.replace(/\D/g,"").slice(0,8))}
              placeholder="00000000"/>
          </label>
        </div>
      </Section>

      <Section title="Horários e orientações">
        <div className="space-y-4">
          <label className={labelClass}><span className="inline-flex items-center gap-2"><Clock3 size={15}/> Horário de funcionamento *</span>
            <textarea rows={3} maxLength={500} disabled={!canUpdate} value={form.opening_hours}
              onChange={e=>patch("opening_hours",e.target.value)}
              placeholder="Segunda a sexta, 8h às 18h. Sábado, 8h às 12h."
              className={fieldClass+" h-auto min-h-24 resize-y py-2.5"}/>
          </label>
          <label className={labelClass}>Orientações de retirada (opcional)
            <textarea rows={3} maxLength={1000} disabled={!canUpdate} value={form.instructions}
              onChange={e=>patch("instructions",e.target.value)}
              placeholder="Apresente o código do pedido e um documento no balcão."
              className={fieldClass+" h-auto min-h-24 resize-y py-2.5"}/>
          </label>
          {form.enabled && <p className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={15}/> A retirada será oferecida no site após salvar.
          </p>}
        </div>
      </Section>
    </>}
    <AdminStickyToolbar>
      <BtnSecondary onClick={back} disabled={saving}>Voltar</BtnSecondary>
      {dirty && <span className="text-xs text-amber-600">Alterações não salvas</span>}
      {canUpdate && <BtnPrimary onClick={()=>void save()} disabled={saving||loading||!dirty}
        loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}
    </AdminStickyToolbar>
  </div>;
}
