import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { fetchAddressByZipCode, formatZipCode } from "@/lib/address";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminStickyToolbar, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { FInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";

type PickupSettings = {
  enabled: boolean;
  location_name: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  postal_code: string;
  opening_hours: string;
  instructions: string;
};

const PICKUP_FIELDS = "enabled,location_name,street,number,complement,district,city,state,postal_code,opening_hours,instructions";
const initial: PickupSettings = {
  enabled: false,
  location_name: "Retirada na Artvideo",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  postal_code: "",
  opening_hours: "",
  instructions: "",
};
const cleanPickup = (form: PickupSettings): PickupSettings => ({
  ...form,
  location_name: form.location_name.trim(),
  street: form.street.trim(),
  number: form.number.trim(),
  complement: form.complement.trim(),
  district: form.district.trim(),
  city: form.city.trim(),
  state: form.state.trim().toUpperCase(),
  postal_code: form.postal_code.replace(/\D/g, "").slice(0, 8),
  opening_hours: form.opening_hours.trim(),
  instructions: form.instructions.trim(),
});
const validPickup = (form: PickupSettings) =>
  form.location_name.length >= 3 &&
  form.street.length >= 3 &&
  form.number.length >= 1 &&
  form.district.length >= 2 &&
  form.city.length >= 2 &&
  /^[A-Z]{2}$/.test(form.state) &&
  /^\d{8}$/.test(form.postal_code) &&
  form.opening_hours.length >= 3;

export function SitePickupSettings({ canUpdate, onBack }: { canUpdate: boolean; onBack: () => void }) {
  const { activeOrganization } = useAuth();
  const organizationId = activeOrganization?.organization_id;
  const [form, setForm] = useState<PickupSettings>({ ...initial });
  const [original, setOriginal] = useState<PickupSettings>({ ...initial });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookupZip, setLookupZip] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.from("artvideo_store_pickup_settings")
        .select(PICKUP_FIELDS)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        notifyAdmin(systemErrorMessage(error, "Não foi possível carregar a retirada na loja."), "error");
      } else {
        const loaded = data ? (data as PickupSettings) : { ...initial };
        setForm(loaded);
        setOriginal(loaded);
      }
      setLoading(false);
    })().catch(error => {
      if (!cancelled) {
        notifyAdmin(systemErrorMessage(error, "Não foi possível carregar a retirada na loja."), "error");
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [organizationId]);

  useEffect(() => {
    if (!/^\d{8}$/.test(lookupZip)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLookupLoading(true);
      void fetchAddressByZipCode(lookupZip).then(address => {
        if (cancelled) return;
        if (!address) {
          notifyAdmin("CEP não encontrado. Confira o número ou informe o endereço manualmente.", "warning");
          return;
        }
        setForm(current => current.postal_code !== lookupZip ? current : {
          ...current,
          street: address.street ?? "",
          district: address.neighborhood ?? "",
          city: address.city ?? "",
          state: (address.state ?? "").toUpperCase(),
        });
      }).catch(error => {
        if (!cancelled) notifyAdmin(systemErrorMessage(error, "Não foi possível consultar o CEP. Preencha o endereço manualmente."), "warning");
      }).finally(() => {
        if (!cancelled) setLookupLoading(false);
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lookupZip]);

  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  const patch = (key: keyof PickupSettings, value: string | boolean) => {
    if (!canUpdate || saving) return;
    setForm(current => ({ ...current, [key]: value }));
  };
  const changeZip = (value: string) => {
    if (!canUpdate || saving) return;
    const digits = value.replace(/\D/g, "").slice(0, 8);
    patch("postal_code", digits);
    setLookupZip(digits);
    if (digits.length !== 8) setLookupLoading(false);
  };

  const persist = async (candidate: PickupSettings, mode: "form" | "toggle" = "form") => {
    if (!canUpdate || !organizationId || saving || loading) {
      if (!organizationId) notifyAdmin("Não foi possível identificar a empresa para salvar a retirada.", "error");
      return;
    }
    const clean = cleanPickup(candidate);
    if (clean.enabled && !validPickup(clean)) {
      notifyAdmin("Para ativar, informe nome do local, rua, número, bairro, cidade, UF, CEP e horários válidos.", "error");
      return;
    }
    if (clean.location_name.length < 3 || clean.location_name.length > 100) {
      notifyAdmin("Informe um nome válido para o local de retirada.", "error");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("artvideo_store_pickup_settings")
        .upsert({
          ...clean,
          organization_id: organizationId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "organization_id" })
        .select(PICKUP_FIELDS)
        .single();
      if (error) throw error;
      if (!data) throw new Error("O banco não confirmou a gravação das configurações."); // Always require persisted data.
      const confirmed = data as PickupSettings;
      setForm(confirmed);
      setOriginal(confirmed);
      notifyAdmin(mode === "toggle"
        ? confirmed.enabled ? "Retirada na loja ativada." : "Retirada na loja desativada."
        : "Configurações de retirada salvas.", "success");
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível salvar as configurações de retirada."), "error");
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (dirty && !window.confirm("Existem alterações não salvas. Deseja sair?")) return;
    onBack();
  };

  const fieldDisabled = !canUpdate || saving;
  return <div className="space-y-5">
    {loading ? <LoadingState text="Carregando retirada na loja..." /> : <>
      <Section title="Local de retirada" description="Endereço e horário exibidos ao cliente no checkout."
        actions={canUpdate ? <AdminActiveStateButton
          active={form.enabled}
          entityLabel="retirada na loja"
          disabled={saving || lookupLoading}
          loading={saving}
          onClick={() => void persist({ ...form, enabled: !form.enabled }, "toggle")}
        /> : undefined}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FInput label="Nome exibido ao cliente" required value={form.location_name}
              maxLength={100} disabled={fieldDisabled} placeholder="Eletrônica Artvideo"
              onChange={(event: any) => patch("location_name", event.target.value)} />
          </div>
          <FInput label="CEP" required inputMode="numeric" placeholder="00000-000"
            maxLength={9} disabled={fieldDisabled} value={formatZipCode(form.postal_code)}
            hint={lookupLoading ? "Buscando endereço pelo CEP..." : "Rua, bairro, cidade e UF são preenchidos automaticamente."}
            onChange={(event: any) => changeZip(event.target.value)} />
          <FInput label="UF" required value={form.state} maxLength={2} disabled={fieldDisabled}
            onChange={(event: any) => patch("state", event.target.value.replace(/[^a-z]/ig, "").toUpperCase())}
            placeholder="SE" />
          <div className="sm:col-span-2">
            <FInput label="Rua / avenida" required maxLength={180} disabled={fieldDisabled}
              value={form.street} onChange={(event: any) => patch("street", event.target.value)} />
          </div>
          <FInput label="Número" required maxLength={20} disabled={fieldDisabled}
            value={form.number} onChange={(event: any) => patch("number", event.target.value)} />
          <FInput label="Complemento" maxLength={160} disabled={fieldDisabled}
            value={form.complement} onChange={(event: any) => patch("complement", event.target.value)} />
          <FInput label="Bairro" required maxLength={100} disabled={fieldDisabled}
            value={form.district} onChange={(event: any) => patch("district", event.target.value)} />
          <FInput label="Cidade" required maxLength={100} disabled={fieldDisabled}
            value={form.city} onChange={(event: any) => patch("city", event.target.value)} />
        </div>
      </Section>

      <Section title="Horário de retirada">
        <FTextarea label="Horário de funcionamento" required rows={3} maxLength={500}
          disabled={fieldDisabled} value={form.opening_hours}
          onChange={(event: any) => patch("opening_hours", event.target.value)}
          placeholder="Segunda a sexta, 8h às 18h. Sábado, 8h às 12h." />
      </Section>
    </>}
    <AdminStickyToolbar className="justify-between">
      <BtnSecondary onClick={back} disabled={saving}>Voltar</BtnSecondary>
      {canUpdate && <BtnPrimary onClick={() => void persist(form)} disabled={saving || loading}
        loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}
    </AdminStickyToolbar>
  </div>;
}
