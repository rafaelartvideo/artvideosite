import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/shared/domain/formatters";

type LoginSession = {
  logged_in_at: string;
  logged_out_at: string | null;
};

type LoginSummary = {
  last_login_at: string | null;
  last_logout_at: string | null;
  sessions: LoginSession[];
};

export function RegistrationLoginHistory({
  organizationId,
  userId,
}: {
  organizationId: string | null;
  userId: string | null;
}) {
  const [summary, setSummary] = useState<LoginSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setError(false);
    if (!organizationId || !userId) return;

    setLoading(true);
    void supabase.rpc("get_user_login_summary", {
      p_organization_id: organizationId,
      p_user_id: userId,
    }).then(({ data, error: queryError }) => {
      if (cancelled) return;
      if (queryError) {
        setError(true);
        return;
      }
      const result = data as LoginSummary | null;
      setSummary({
        last_login_at: result?.last_login_at ?? null,
        last_logout_at: result?.last_logout_at ?? null,
        sessions: Array.isArray(result?.sessions) ? result.sessions : [],
      });
    }).catch(() => {
      if (!cancelled) setError(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [organizationId, userId]);

  if (!organizationId || !userId) return null;
  if (loading) return <p className="sm:col-span-2 text-xs text-[#5a6a82]">Consultando histórico de acessos...</p>;
  if (error) return <p className="sm:col-span-2 text-xs text-[#5a6a82]">Não foi possível consultar os registros de acesso.</p>;
  if (!summary) return null;

  return <div className="sm:col-span-2 space-y-3 border-t border-[#0d1b2e]/10 pt-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <div className="text-[10px] font-black uppercase tracking-wider text-[#8a98aa]">Último login</div>
        <div className="mt-1 text-sm font-bold text-[#0d1b2e]">{summary.last_login_at ? formatDateTime(summary.last_login_at, "—") : "Nunca registrado"}</div>
      </div>
      <div>
        <div className="text-[10px] font-black uppercase tracking-wider text-[#8a98aa]">Último logout</div>
        <div className="mt-1 text-sm font-bold text-[#0d1b2e]">{summary.last_logout_at ? formatDateTime(summary.last_logout_at, "—") : "Não registrado"}</div>
      </div>
    </div>
    {summary.sessions.length > 0 && <div>
      <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-[#8a98aa]">Acessos recentes</div>
      <div role="region" aria-label="Histórico de acessos recentes" tabIndex={0} className="max-h-[240px] overflow-y-auto overscroll-contain divide-y divide-[#0d1b2e]/10 rounded-lg border border-[#0d1b2e]/10 sm:max-h-[176px]">
        {summary.sessions.map((session, index) => <div key={session.logged_in_at + index} className="grid min-h-[60px] gap-1 px-3 py-2 text-xs sm:min-h-[44px] sm:grid-cols-2 sm:items-center sm:gap-2">
          <span><span className="font-semibold text-[#5a6a82]">Entrada:</span> <span className="font-bold text-[#0d1b2e]">{formatDateTime(session.logged_in_at, "—")}</span></span>
          <span><span className="font-semibold text-[#5a6a82]">Saída:</span> <span className="font-bold text-[#0d1b2e]">{session.logged_out_at ? formatDateTime(session.logged_out_at, "—") : "Não registrada"}</span></span>
        </div>)}
      </div>
      <p className="mt-2 text-[11px] text-[#5a6a82]">Saídas são registradas ao encerrar a sessão pelo sistema; fechar o navegador pode não informar o horário da saída.</p>
    </div>}
  </div>;
}
