import { useEffect, useState } from "react";
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
  organizationId, data, onSaved, onCancel,
}: {
  organizationId: string;
  data: CompanySegmentsData;
  onSaved: () => void | Promise<void>;
  onCancel?: () => void;
}) {
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
      await onSaved();
    } catch (cause) {
      setError(systemErrorMessage(cause, "Não foi possível salvar os segmentos da empresa."));
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-5">
    <div>
      <h3 className="text-base font-extrabold text-[#132039]">Qual é o principal segmento da sua empresa?</h3>
      <p className="mt-1 text-sm leading-6 text-[#627185]">
        Escolha o ramo de atuação. Depois, você pode selecionar outros segmentos que também atende.
      </p>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {data.segments.map(segment => {
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

    {primary && <div className="rounded-xl border border-[#dce3ec] p-4">
      <h4 className="text-sm font-bold text-[#17263b]">Sua empresa trabalha com outros segmentos?</h4>
      <p className="mt-1 text-xs leading-5 text-[#66758a]">Opcional. Ative somente os que realmente fazem parte da operação.</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {data.segments.filter(item => item.code !== primary).map(segment => <label
          key={segment.code}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#dce3ec] px-3 py-3 text-sm font-medium text-[#20314b]"
        >
          <input
            type="checkbox"
            checked={additional.includes(segment.code)}
            onChange={() => toggleAdditional(segment.code)}
            disabled={saving}
            className="h-4 w-4 accent-[#1032dc]"
          />
          {segment.name}
        </label>)}
      </div>
    </div>}

    <p className="text-xs leading-5 text-[#67778b]">
      Por enquanto, essa escolha configura apenas o perfil da empresa. Equipamentos, marcas e modelos
      não serão importados antes da revisão do catálogo oficial. Seus cadastros e OS continuam intactos.
    </p>

    {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      {onCancel && <BtnSecondary disabled={saving} onClick={onCancel}>Cancelar</BtnSecondary>}
      <BtnPrimary onClick={() => void save()} disabled={!primary || saving} loading={saving} loadingText="Salvando...">
        Confirmar segmentos
      </BtnPrimary>
    </div>
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

  return <AdminDialog
    open
    onClose={() => undefined}
    minimizable={false}
    closable={false}
    className="max-w-5xl"
    title="Configure o perfil da sua empresa"
    description="Essa etapa é realizada somente pelo proprietário."
  >
    {error
      ? <div className="space-y-3">
          <p role="alert" className="text-sm text-red-600">{error}</p>
          <BtnSecondary onClick={() => setRetry(value => value + 1)}>Tentar novamente</BtnSecondary>
        </div>
      : data && activeOrganizationId && <SegmentPicker
          organizationId={activeOrganizationId}
          data={data}
          onSaved={() => setData(current => current ? { ...current, configured: true } : current)}
        />}
  </AdminDialog>;
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
