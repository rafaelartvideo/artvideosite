import { useEffect, useState } from "react";
import { Section, BtnPrimary } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { Switch } from "@/shared/ui/primitives/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/primitives/select";
import {
  defaultQueueIntegrationSettings,
  getQueueIntegrationSettings,
  saveQueueIntegrationSettings,
  type QueueIntegrationSettings,
  type QueueOutagePolicy,
} from "../infrastructure/queue-integration.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";

export function QueueIntegrationSettingsSection({
  organizationId,
  canUpdate,
}: {
  organizationId: string;
  canUpdate: boolean;
}) {
  const [settings, setSettings] = useState<QueueIntegrationSettings>(() => defaultQueueIntegrationSettings(organizationId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage(null);
    void getQueueIntegrationSettings(organizationId)
      .then((next) => { if (active) setSettings(next); })
      .catch((error) => { if (active) setMessage({ text: systemErrorMessage(error, "Não foi possível carregar a integração da fila."), error: true }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId]);

  const update = <K extends keyof QueueIntegrationSettings>(key: K, value: QueueIntegrationSettings[K]) => {
    if (!canUpdate || saving) return;
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage(null);
  };

  const save = async () => {
    if (!canUpdate || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveQueueIntegrationSettings(settings);
      setMessage({ text: "Configuração do Union Senhas salva." });
    } catch (error) {
      setMessage({ text: systemErrorMessage(error, "Não foi possível salvar a integração da fila."), error: true });
    } finally {
      setSaving(false);
    }
  };

  return <Section title="Configuração do Union Senhas">
    {loading ? <LoadingState /> : <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 border-b border-[#0d1b2e]/10 pb-4">
        <div>
          <p className="text-sm font-semibold text-[#0d1b2e] dark:text-white">Ativar integração</p>
          <p className="mt-1 text-xs text-[#5a6a82] dark:text-slate-400">Permite validar as senhas emitidas pelo Union Senhas.</p>
        </div>
        <Switch checked={settings.enabled} onCheckedChange={(checked) => update("enabled", checked)} disabled={!canUpdate || saving} />
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-[#0d1b2e]/10 pb-4">
        <div>
          <p className="text-sm font-semibold text-[#0d1b2e] dark:text-white">Exigir código para abrir Nova OS</p>
          <p className="mt-1 text-xs text-[#5a6a82] dark:text-slate-400">Ao abrir uma OS, solicita o código de 4 dígitos entregue junto com a senha.</p>
        </div>
        <Switch
          checked={settings.require_code_for_orders}
          onCheckedChange={(checked) => update("require_code_for_orders", checked)}
          disabled={!canUpdate || saving || !settings.enabled}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Tempo da reserva</span>
          <Select
            value={String(settings.reservation_ttl_seconds)}
            onValueChange={(value) => update("reservation_ttl_seconds", Number(value))}
            disabled={!canUpdate || saving || !settings.enabled}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="300">5 minutos</SelectItem>
              <SelectItem value="600">10 minutos</SelectItem>
              <SelectItem value="900">15 minutos</SelectItem>
              <SelectItem value="1800">30 minutos</SelectItem>
              <SelectItem value="3600">1 hora</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-[#5a6a82] dark:text-slate-400">Após validar, o código fica reservado enquanto a OS é preenchida.</p>
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Se o Union Senhas estiver indisponível</span>
          <Select
            value={settings.outage_policy}
            onValueChange={(value) => update("outage_policy", value as QueueOutagePolicy)}
            disabled={!canUpdate || saving || !settings.enabled}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="block">Bloquear abertura da OS</SelectItem>
              <SelectItem value="manager_override">Permitir somente gestores</SelectItem>
              <SelectItem value="allow">Permitir com justificativa</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-4 pt-1">
        <div className={message?.error ? "text-sm text-red-600" : "text-sm text-emerald-700 dark:text-emerald-400"}>
          {message?.text || "O código é de uso único e fica vinculado à OS criada."}
        </div>
        {canUpdate && <BtnPrimary onClick={save} loading={saving} loadingText="Salvando...">Salvar integração</BtnPrimary>}
      </div>
    </div>}
  </Section>;
}
