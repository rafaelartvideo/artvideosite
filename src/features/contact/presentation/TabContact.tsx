import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/lib/auth";
import { fetchAddressByZipCode, formatZipCode } from "@/lib/address";
import {
  useSaveSiteSettingsMutation,
  useSiteSettingsQuery,
} from "@/features/settings/presentation/useSiteSettingsQuery";
import { BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { FEmailInput, FInput, FPhoneInput } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";

export function TabContact() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const canView = hasPermission("contact.view");
  const canViewDetails = hasPermission("contact.details.view");
  const canUpdate = hasPermission("contact.update");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [loadingZip, setLoadingZip] = useState(false);
  const [zipError, setZipError] = useState("");
  const settingsQuery = useSiteSettingsQuery();
  const saveSettings = useSaveSiteSettingsMutation();

  useEffect(() => {
    if (!settingsQuery.data) return;
    setSettings(Object.fromEntries(Object.entries(settingsQuery.data).map(([key, value]) => [key, String(value ?? "")] )));
  }, [settingsQuery.data]);

  useEffect(() => {
    if (!settingsQuery.error) return;
    const message = settingsQuery.error instanceof Error ? settingsQuery.error.message : "erro desconhecido";
    setToast({ msg: `Erro ao carregar contato: ${message}`, type: "error" });
  }, [settingsQuery.error]);

  useEffect(() => {
    if (!canUpdate) return;
    const zipCode = (settings.zip_code || "").replace(/\D/g, "");
    if (zipCode.length !== 8) {
      setZipError("");
      return;
    }

    let active = true;
    setLoadingZip(true);
    setZipError("");

    fetchAddressByZipCode(zipCode)
      .then((address) => {
        if (!active) return;
        if (!address) {
          setZipError("CEP não encontrado.");
          return;
        }

        setSettings(current => ({
          ...current,
          zip_code: address.zip_code || current.zip_code || "",
          street: address.street || "",
          neighborhood: address.neighborhood || "",
          city: address.city || "",
          state: address.state || "",
        }));
      })
      .catch(() => {
        if (active) setZipError("Não foi possível consultar este CEP.");
      })
      .finally(() => {
        if (active) setLoadingZip(false);
      });

    return () => {
      active = false;
    };
  }, [canUpdate, settings.zip_code]);

  const updateSetting = (key: string, value: string) => {
    if (!canUpdate) return;
    setSettings(current => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    if (!canUpdate) return;
    try {
      await saveSettings.mutateAsync({ settings, updatedBy: user?.id ?? null });
      setToast({ msg: "Informações de contato salvas com sucesso.", type: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao salvar contato: ${message}`, type: "error" });
    }
  };

  const handleCancel = () => navigate("/admin/site");

  if (!canView || !canViewDetails) return null;

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader
      title="Informações de Contato"
      subtitle="Configure os canais, endereço e horários exibidos no site público."
    />

    {settingsQuery.isPending ? <LoadingState /> : <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <Section title="Canais de contato">
        <div className="grid gap-4 sm:grid-cols-2">
          <FPhoneInput label="Telefone" value={settings.phone || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("phone", event.target.value)} />
          <FPhoneInput label="WhatsApp" mobile value={settings.whatsapp || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("whatsapp", event.target.value)} />
          <div className="sm:col-span-2"><FEmailInput label="E-mail" value={settings.email || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("email", event.target.value)} /></div>
        </div>
      </Section>

      <Section title="Redes sociais">
        <div className="space-y-4">
          <FInput label="Instagram" value={settings.instagram || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("instagram", event.target.value)} placeholder="@empresa" />
          <p className="text-xs leading-5 text-[#5a6a82]">Use o identificador ou link público da rede social.</p>
        </div>
      </Section>

      <div className="xl:col-span-2">
        <Section title="Endereço">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <FInput
                label="CEP"
                value={settings.zip_code || ""}
                disabled={!canUpdate}
                maxLength={9}
                onChange={(event: any) => updateSetting("zip_code", formatZipCode(event.target.value))}
                placeholder="00000-000"
              />
              {loadingZip && <p className="mt-1 text-[10px] text-[#5a6a82]">Consultando CEP...</p>}
              {zipError && <p className="mt-1 text-[10px] text-amber-700">{zipError}</p>}
            </div>
            <div className="sm:col-span-2"><FInput label="Rua" value={settings.street || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("street", event.target.value)} placeholder="Rua da empresa" /></div>
            <FInput label="Número" value={settings.number || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("number", event.target.value)} />
            <div className="sm:col-span-2"><FInput label="Complemento" value={settings.complement || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("complement", event.target.value)} placeholder="Sala, bloco..." /></div>
            <FInput label="Bairro" value={settings.neighborhood || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("neighborhood", event.target.value)} />
            <FInput label="Cidade" value={settings.city || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("city", event.target.value)} />
            <FInput label="Estado" value={settings.state || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("state", event.target.value.toUpperCase())} maxLength={2} placeholder="SP" />
          </div>
        </Section>
      </div>

      <Section title="Horário de funcionamento">
        <FInput label="Horário" value={settings.business_hours || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("business_hours", event.target.value)} placeholder="Seg a Sex: 8h às 18h" />
      </Section>

      <Section title="Identificação pública">
        <FInput label="Nome da empresa" value={settings.company_name || ""} disabled={!canUpdate} onChange={(event: any) => updateSetting("company_name", event.target.value)} placeholder="Eletrônica ArtVideo" />
      </Section>
    </div>}

    <div className="sticky bottom-0 z-20 flex items-center justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white/95 px-4 py-4 backdrop-blur sm:px-5">
      <BtnSecondary onClick={handleCancel} disabled={saveSettings.isPending}>Cancelar</BtnSecondary>
      {canUpdate && <BtnPrimary onClick={() => void handleSave()} loading={saveSettings.isPending} loadingText="Salvando...">Salvar</BtnPrimary>}
    </div>
  </div>;
}
