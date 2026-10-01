import { useEffect, useState } from "react";
import { FileCheck2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminCard, BtnPrimary, BtnSecondary, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import {
  listOrganizationTerms,
  saveOrganizationTerm,
  type OrganizationTerm,
  type OrganizationTermType,
} from "../infrastructure/terms.repository";

type Draft = {
  title: string;
  content: string;
  is_active: boolean;
  version: number;
};

const DEFAULTS: Record<OrganizationTermType, Draft> = {
  usage: {
    title: "Termos de Uso",
    content: "",
    is_active: true,
    version: 1,
  },
  responsibility: {
    title: "Termo de Responsabilidade",
    content: "",
    is_active: true,
    version: 1,
  },
};

function TermEditor({
  type,
  value,
  canManage,
  saving,
  onChange,
  onSave,
}: {
  type: OrganizationTermType;
  value: Draft;
  canManage: boolean;
  saving: boolean;
  onChange: (value: Draft) => void;
  onSave: () => void;
}) {
  const usage = type === "usage";
  return <AdminCard className="overflow-hidden p-0">
    <div className="border-b border-[#0d1b2e]/8 bg-[#f8fafc] px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8eef8] text-[#0057e7]">
          {usage ? <FileCheck2 size={19} /> : <ShieldCheck size={19} />}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-black text-[#0d1b2e]">{usage ? "Termos de Uso" : "Termo de Responsabilidade"}</h2>
          <p className="mt-1 text-sm leading-5 text-[#5a6a82]">
            {usage
              ? "Aceite obrigatório do proprietário da empresa. Uma nova versão exige um novo aceite."
              : "Aceite individual de cada usuário no primeiro acesso à versão vigente."}
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[#8a96a8]">Versão atual: {value.version}</p>
        </div>
      </div>
    </div>

    <div className="space-y-4 p-4 sm:p-5">
      <div>
        <label className="mb-1.5 block text-xs font-bold text-[#35465c]">Título</label>
        <input
          value={value.title}
          disabled={!canManage || saving}
          onChange={event => onChange({ ...value, title: event.target.value })}
          className="h-10 w-full rounded-lg border border-[#cfd8e6] bg-white px-3 text-sm font-semibold text-[#0d1b2e] outline-none transition focus:border-[#0057e7] focus:ring-2 focus:ring-[#0057e7]/10 disabled:bg-[#f5f7fa]"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-bold text-[#35465c]">Conteúdo do termo</label>
        <textarea
          value={value.content}
          disabled={!canManage || saving}
          onChange={event => onChange({ ...value, content: event.target.value })}
          placeholder="Digite aqui o texto completo que deverá ser aceito..."
          className="min-h-[280px] w-full resize-y rounded-lg border border-[#cfd8e6] bg-white px-3 py-3 text-sm leading-6 text-[#0d1b2e] outline-none transition focus:border-[#0057e7] focus:ring-2 focus:ring-[#0057e7]/10 disabled:bg-[#f5f7fa]"
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#35465c]">
        <input
          type="checkbox"
          checked={value.is_active}
          disabled={!canManage || saving}
          onChange={event => onChange({ ...value, is_active: event.target.checked })}
          className="h-4 w-4 accent-[#0057e7]"
        />
        Exigir aceite desta versão
      </label>

      {canManage && <div className="flex justify-end border-t border-[#0d1b2e]/8 pt-4">
        <BtnPrimary onClick={onSave} loading={saving} loadingText="Salvando...">Salvar termo</BtnPrimary>
      </div>}
    </div>
  </AdminCard>;
}

export function TabTerms({ onBack }: { onBack: () => void }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canView = hasPermission("terms.view") || hasPermission("terms.manage");
  const canManage = hasPermission("terms.manage");
  const [terms, setTerms] = useState<OrganizationTerm[]>([]);
  const [drafts, setDrafts] = useState<Record<OrganizationTermType, Draft>>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<OrganizationTermType | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    if (!activeOrganizationId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listOrganizationTerms(activeOrganizationId);
      setTerms(rows);
      setDrafts({
        usage: rows.find(term => term.term_type === "usage")
          ? {
              title: rows.find(term => term.term_type === "usage")!.title,
              content: rows.find(term => term.term_type === "usage")!.content,
              is_active: rows.find(term => term.term_type === "usage")!.is_active,
              version: rows.find(term => term.term_type === "usage")!.version,
            }
          : DEFAULTS.usage,
        responsibility: rows.find(term => term.term_type === "responsibility")
          ? {
              title: rows.find(term => term.term_type === "responsibility")!.title,
              content: rows.find(term => term.term_type === "responsibility")!.content,
              is_active: rows.find(term => term.term_type === "responsibility")!.is_active,
              version: rows.find(term => term.term_type === "responsibility")!.version,
            }
          : DEFAULTS.responsibility,
      });
    } catch (error) {
      setToast({ msg: systemErrorMessage(error, "Não foi possível carregar os termos."), type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganizationId, canView]);

  const save = async (type: OrganizationTermType) => {
    if (!activeOrganizationId || !canManage) return;
    const draft = drafts[type];
    if (!draft.title.trim()) {
      setToast({ msg: "Informe o título do termo.", type: "error" });
      return;
    }
    if (draft.is_active && !draft.content.trim()) {
      setToast({ msg: "Informe o conteúdo antes de exigir o aceite.", type: "error" });
      return;
    }

    setSavingType(type);
    try {
      await saveOrganizationTerm({
        organizationId: activeOrganizationId,
        termType: type,
        title: draft.title,
        content: draft.content,
        isActive: draft.is_active,
      });
      setToast({ msg: `${type === "usage" ? "Termos de Uso" : "Termo de Responsabilidade"} salvos.`, type: "success" });
      await load();
    } catch (error) {
      setToast({ msg: systemErrorMessage(error, "Não foi possível salvar o termo."), type: "error" });
    } finally {
      setSavingType(null);
    }
  };

  if (!canView) return null;
  if (loading) return <LoadingState text="Carregando termos..." />;

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader
      title="Termos"
      subtitle="Configure os documentos de aceite obrigatório da empresa."
      actions={<BtnSecondary onClick={onBack}>Voltar</BtnSecondary>}
    />
    <div className="grid gap-4 xl:grid-cols-2">
      <TermEditor
        type="usage"
        value={drafts.usage}
        canManage={canManage}
        saving={savingType === "usage"}
        onChange={value => setDrafts(current => ({ ...current, usage: value }))}
        onSave={() => void save("usage")}
      />
      <TermEditor
        type="responsibility"
        value={drafts.responsibility}
        canManage={canManage}
        saving={savingType === "responsibility"}
        onChange={value => setDrafts(current => ({ ...current, responsibility: value }))}
        onSave={() => void save("responsibility")}
      />
    </div>
  </div>;
}
