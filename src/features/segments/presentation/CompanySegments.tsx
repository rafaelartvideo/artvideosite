import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  CarFront, CheckCircle2, Monitor, SlidersHorizontal, Smartphone, Snowflake,
  Sun, Wrench, type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import {
  loadCompanySegments, saveCompanySegments,
  type BusinessSegment, type CompanySegmentsData,
} from "../infrastructure/company-segments.repository";

const SEGMENT_ICONS: Record<string, LucideIcon> = {
  smartphone: Smartphone,
  wrench: Wrench,
  snowflake: Snowflake,
  monitor: Monitor,
  "car-front": CarFront,
  sun: Sun,
  "sliders-horizontal": SlidersHorizontal,
};

function SegmentIcon({ segment }: { segment: BusinessSegment }) {
  const Icon = SEGMENT_ICONS[segment.icon] ?? Wrench;
  return <Icon aria-hidden="true" className="h-7 w-7 text-[#1032dc]" />;
}

function SegmentPicker({
  organizationId, data, onSaved, onCancel, onboarding = false,
}: {
  organizationId: string;
  data: CompanySegmentsData;
  onSaved: () => void | Promise<void>;
  onCancel?: () => void;
  onboarding?: boolean;
}) {
  const queryClient = useQueryClient();
  const [primary, setPrimary] = useState(data.primaryCode || "");
  const [additional, setAdditional] = useState<string[]>(data.additionalCodes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectPrimary = (code: string) => {
    if (saving) return;
    setPrimary(code);
    setAdditional(current => current.filter(item => item !== code));
    setError("");
  };

  const toggleAdditional = (code: string) => {
    if (saving) return;
    setAdditional(current => current.includes(code)
      ? current.filter(item => item !== code)
      : [...current, code]);
    setError("");
  };

  const save = async () => {
    if (!primary || saving) return;
    setSaving(true);
    setError("");
    try {
      await saveCompanySegments(organizationId, primary, additional);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
      ]);
      await onSaved();
    } catch (cause) {
      setError(systemErrorMessage(cause, "Não foi possível salvar os segmentos da empresa."));
    } finally {
      setSaving(false);
    }
  };


  const actions = <div className="flex flex-wrap justify-end gap-2">
    {onCancel && <BtnSecondary disabled={saving} onClick={onCancel}>Cancelar</BtnSecondary>}
    <BtnPrimary onClick={() => void save()} disabled={!primary || saving} loading={saving} loadingText="Salvando...">
      Confirmar
    </BtnPrimary>
  </div>;

  const content = <div className="space-y-5">
    <h3 className="text-base font-extrabold text-[#132039]">Qual é o principal segmento da sua empresa?</h3>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[...data.segments].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })).map(segment => {
        const selected = primary === segment.code;
        return <button
          key={segment.code}
          type="button"
          aria-pressed={selected}
          disabled={saving}
          onClick={() => selectPrimary(segment.code)}
          className={`relative flex min-h-[166px] min-w-0 flex-col items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1032dc] disabled:opacity-60 ${selected
            ? "border-[#1032dc] bg-[#edf1ff]"
            : "border-[#dce3ec] bg-[#f8fafd] hover:border-[#7990e9]"}`}
        >
          {selected && <CheckCircle2 aria-label="Selecionado" className="absolute right-4 top-4 h-5 w-5 text-[#1032dc]" />}
          <div className="rounded-xl bg-white p-3 shadow-sm"><SegmentIcon segment={segment} /></div>
          <span className="pr-6 text-base font-bold text-[#17263b]">{segment.name}</span>
          <span className="text-sm leading-5 text-[#6b7788]">{segment.description}</span>
        </button>;
      })}
    </div>

    {primary && <section className="space-y-3">
      <h4 className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#17263b]">
        Sua empresa trabalha com outros segmentos?
        <span className="text-xs font-medium text-[#66758a]">(Opcional)</span>
      </h4>
      <div className="grid grid-cols-1 gap-x-6 border-y border-[#0d1b2e]/8 sm:grid-cols-2 lg:grid-cols-3">
        {data.segments.filter(item => item.code !== primary)
          .sort((a, b) => Number(additional.includes(b.code)) - Number(additional.includes(a.code)) || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
          .map(segment => <label
          key={segment.code}
          className="flex min-w-0 cursor-pointer items-center gap-3 border-b border-[#0d1b2e]/8 py-3 text-sm font-medium text-[#20314b]"
        >
          <input
            type="checkbox"
            checked={additional.includes(segment.code)}
            onChange={() => toggleAdditional(segment.code)}
            disabled={saving}
            className="h-4 w-4 shrink-0 accent-[#1032dc]"
          />
          {segment.name}
        </label>)}
      </div>
    </section>}

    {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
  </div>;

  if (onboarding) {
    return <AdminDialog
      open
      onClose={() => undefined}
      minimizable={false}
      closable={false}
      hideHeader
      className="max-w-5xl"
      title="Qual é o principal segmento da sua empresa?"
      footer={actions}
    >
      {content}
    </AdminDialog>;
  }

  return <div className="space-y-5">
    {content}
    {actions}
  </div>;
}

/** Exibido apenas ao proprietário e depois de concluir os termos obrigatórios. */
export function CompanySegmentsOnboardingGate({ hasPendingTerms }: { hasPendingTerms: boolean }) {
  const { activeOrganization, activeOrganizationId } = useAuth();
  const eligible = Boolean(
    activeOrganizationId
    && activeOrganization?.is_owner
    && !activeOrganization?.is_platform_operator
    && !hasPendingTerms,
  );
  const [data, setData] = useState<CompanySegmentsData | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    if (!eligible || !activeOrganizationId) return;
    void loadCompanySegments(activeOrganizationId).then(result => {
      if (live) setData(result);
    }).catch(cause => {
      if (live) setError(systemErrorMessage(cause, "Não foi possível carregar os segmentos."));
    });
    return () => { live = false; };
  }, [eligible, activeOrganizationId, retry]);

  if (!eligible || (!error && (!data || data.configured))) return null;


  if (error) return <AdminDialog
    open
    onClose={() => undefined}
    minimizable={false}
    closable={false}
    hideHeader
    className="max-w-5xl"
    title="Selecionar segmentos da empresa"
  >
    <div className="space-y-3">
      <p role="alert" className="text-sm text-red-600">{error}</p>
      <BtnSecondary onClick={() => setRetry(value => value + 1)}>Tentar novamente</BtnSecondary>
    </div>
  </AdminDialog>;

  return data && activeOrganizationId
    ? <SegmentPicker
        onboarding
        organizationId={activeOrganizationId}
        data={data}
        onSaved={() => setData(current => current ? { ...current, configured: true } : current)}
      />
    : null;
}

/** Edição posterior do perfil na seção Dados da empresa. */
export function CompanySegmentsSettings({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<CompanySegmentsData | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = async () => {
    const next = await loadCompanySegments(organizationId);
    setData(next);
  };

  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    setEditing(false);
    void loadCompanySegments(organizationId).then(next => {
      if (live) setData(next);
    }).catch(cause => {
      if (live) setError(systemErrorMessage(cause, "Não foi possível consultar os segmentos."));
    });
    return () => { live = false; };
  }, [organizationId]);

  const selectedNames = data?.segments
    .filter(segment => segment.code === data.primaryCode || data.additionalCodes.includes(segment.code))
    .map(segment => segment.name).join(", ");

  return <section className="rounded-xl border border-[#dce3ec] bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-base font-extrabold text-[#17263b]">Segmentos da empresa</h3>
        <p className="mt-1 text-sm text-[#68778b]">{selectedNames || "Nenhum segmento configurado."}</p>
      </div>
      {!editing && data && <BtnSecondary onClick={() => { setNotice(""); setEditing(true); }}>Alterar segmentos</BtnSecondary>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}
    {editing && data && <div className="mt-5">
      <SegmentPicker
        key={data.primaryCode || "none"}
        organizationId={organizationId}
        data={data}
        onCancel={() => setEditing(false)}
        onSaved={async () => {
          await reload();
          setEditing(false);
          setNotice("Segmentos atualizados. Seus cadastros existentes foram preservados.");
        }}
      />
    </div>}
  </section>;
}
