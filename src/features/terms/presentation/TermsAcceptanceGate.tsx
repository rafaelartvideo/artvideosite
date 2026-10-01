import { useEffect, useState } from "react";
import { FileCheck2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { BtnPrimary } from "@/shared/ui/admin/AdminLayout";
import { LoadingSpinner } from "@/shared/ui/admin/AdminFeedback";
import {
  acceptOrganizationTerm,
  getPendingOrganizationTerms,
  type PendingOrganizationTerm,
} from "../infrastructure/terms.repository";

export function TermsAcceptanceGate() {
  const { activeOrganizationId, user } = useAuth();
  const [pending, setPending] = useState<PendingOrganizationTerm[]>([]);
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    if (!activeOrganizationId || !user?.id) {
      setPending([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setPending(await getPendingOrganizationTerms(activeOrganizationId));
    } catch (requestError) {
      setError(systemErrorMessage(requestError, "Não foi possível verificar os termos pendentes."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setAccepted(false);
    void load();
  }, [activeOrganizationId, user?.id]);

  const current = pending[0] || null;

  useEffect(() => {
    setAccepted(false);
  }, [current?.id, current?.version]);

  const confirm = async () => {
    if (!current || !activeOrganizationId || !accepted || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await acceptOrganizationTerm(activeOrganizationId, current.id, current.version);
      setPending(items => items.slice(1));
    } catch (requestError) {
      setError(systemErrorMessage(requestError, "Não foi possível registrar o aceite."));
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  if (!loading && !error && !current) return null;

  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#08111f]/75 p-4 backdrop-blur-sm">
    <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
      {loading && !current ? <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 p-8 text-center">
        <LoadingSpinner size="lg" />
        <p className="text-sm font-semibold text-[#5a6a82]">Verificando termos de acesso...</p>
      </div> : error && !current ? <div className="p-6 text-center sm:p-8">
        <h2 className="text-lg font-black text-[#0d1b2e]">Não foi possível validar os termos</h2>
        <p className="mt-2 text-sm leading-6 text-red-600">{error}</p>
        <div className="mt-5 flex justify-center"><BtnPrimary onClick={() => void load()}>Tentar novamente</BtnPrimary></div>
      </div> : current ? <>
        <div className="flex items-start gap-3 border-b border-[#0d1b2e]/8 bg-[#f8fafc] px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8eef8] text-[#0057e7]">
            {current.term_type === "usage" ? <FileCheck2 size={19} /> : <ShieldCheck size={19} />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#0057e7]">
              {current.term_type === "usage" ? "Aceite do proprietário" : "Aceite individual"}
            </p>
            <h2 className="mt-1 text-lg font-black text-[#0d1b2e]">{current.title}</h2>
            <p className="mt-1 text-xs text-[#5a6a82]">{current.organization_name} · versão {current.version}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="whitespace-pre-wrap text-sm leading-7 text-[#35465c]">{current.content}</div>
        </div>

        <div className="border-t border-[#0d1b2e]/8 bg-white px-5 py-4">
          {error && <p className="mb-3 text-sm font-semibold text-red-600">{error}</p>}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#d9e1ec] bg-[#f8fafc] p-3 text-sm font-semibold leading-5 text-[#35465c]">
            <input
              type="checkbox"
              checked={accepted}
              onChange={event => setAccepted(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#0057e7]"
            />
            <span>
              Li e concordo com {current.term_type === "usage" ? "os Termos de Uso" : "o Termo de Responsabilidade"} apresentados acima.
            </span>
          </label>
          <div className="mt-4 flex justify-end">
            <BtnPrimary onClick={() => void confirm()} disabled={!accepted || submitting} loading={submitting} loadingText="Registrando aceite...">
              Aceitar e continuar
            </BtnPrimary>
          </div>
        </div>
      </> : null}
    </div>
  </div>;
}
