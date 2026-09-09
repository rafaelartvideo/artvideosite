import { useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { authenticateAdmin } from "@/features/auth/infrastructure/auth.repository";
import { FInput, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { LoadingSpinner, Toast } from "@/shared/ui/admin/AdminFeedback";
import logoSolo from "@/imports/LogoSoloSemFundo.png";

type AdminLoginProps = {
  onLoginSuccess: () => void;
};

export function AdminLogin({ onLoginSuccess: _onLoginSuccess }: AdminLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const result = await authenticateAdmin(email, password);

    if (result === "invalid_credentials") {
      setError("Credenciais inválidas. Verifique seu e-mail e senha.");
    } else if (result === "inactive_user") {
      setError("Usuário inativo. Entre em contato com o gestor.");
    }

    setLoading(false);
  };

  const passwordVisibilityLabel = showPassword ? "Ocultar senha" : "Mostrar senha";

  return (
    <main className="admin-crm relative min-h-screen overflow-hidden bg-[#eaf0f7] px-3 py-3 sm:px-6 sm:py-6 lg:flex lg:items-center lg:justify-center lg:p-10">
      {error && <Toast message={error} type="error" onClose={() => setError("")} />}

      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#00b4ff]/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-[#0057e7]/10 blur-3xl" />

      <div className="relative mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-6xl overflow-hidden rounded-[24px] bg-white shadow-[0_28px_80px_rgba(13,27,46,0.18)] sm:min-h-[720px] sm:rounded-[30px] lg:min-h-[min(760px,calc(100vh-5rem))] lg:grid-cols-[0.92fr_1.08fr]">
        <section className="flex min-w-0 flex-col px-5 py-6 sm:px-10 sm:py-9 lg:px-14 lg:py-11 xl:px-20">
          <div className="flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0d1b2e] shadow-md shadow-[#0d1b2e]/15">
              <img src={logoSolo} alt="" aria-hidden="true" className="h-8 w-8 object-contain" />
            </span>
            <div className="leading-none">
              <span className="block text-[9px] font-bold uppercase tracking-[0.32em] text-[#0057e7]">Eletrônica</span>
              <span className="mt-1 block text-xl font-black text-[#0d1b2e]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>ARTVIDEO</span>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 sm:py-14 lg:py-10">
            <div className="mb-7">
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#eef5ff] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#0057e7]">
                <ShieldCheck size={14} />
                Acesso seguro
              </span>
              <h1 className="text-3xl font-black tracking-tight text-[#0d1b2e] sm:text-4xl">Bem-vindo de volta</h1>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#5a6a82]">
                Entre com suas credenciais para acessar o painel de gestão.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <FInput
                label="E-mail"
                type="email"
                value={email}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
                required
                autoComplete="email"
                inputMode="email"
                placeholder="seu@email.com"
              />

              <div>
                <label className="mb-1.5 flex items-baseline gap-1 text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">
                  Senha<span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={`${INPUT} h-[46px] pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={passwordVisibilityLabel}
                    title={passwordVisibilityLabel}
                    className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#5a6a82] transition-colors hover:bg-[#eef5ff] hover:text-[#0057e7] focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40"
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="mt-2 flex h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#0057e7] px-6 text-sm font-bold text-white shadow-lg shadow-[#0057e7]/20 transition-all hover:-translate-y-0.5 hover:bg-[#0046c0] hover:shadow-xl hover:shadow-[#0057e7]/25 focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40 focus:ring-offset-2 disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60"
              >
                {loading ? <LoadingSpinner size="sm" /> : null}
                {loading ? "Entrando..." : "Entrar no painel"}
              </button>
            </form>

            <p className="mt-6 text-center text-[11px] leading-5 text-[#7c899c]">
              Acesso exclusivo para usuários autorizados.
            </p>
          </div>

          <p className="text-center text-[10px] text-[#94a0b0] lg:text-left">
            © {new Date().getFullYear()} Eletrônica ArtVideo
          </p>
        </section>

        <aside className="relative hidden min-w-0 overflow-hidden bg-gradient-to-br from-[#0057e7] via-[#0649bb] to-[#0d1b2e] p-10 text-white lg:flex lg:flex-col xl:p-14">
          <div aria-hidden="true" className="absolute -right-24 -top-28 h-96 w-96 rounded-full border-[70px] border-white/[0.045]" />
          <div aria-hidden="true" className="absolute -bottom-36 -left-32 h-96 w-96 rounded-full bg-[#00b4ff]/15 blur-3xl" />
          <div aria-hidden="true" className="absolute left-1/3 top-1/4 h-64 w-64 rounded-full bg-white/[0.04] blur-2xl" />

          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#dff5ff] backdrop-blur-sm">
              <Wrench size={14} />
              Gestão de assistência técnica
            </span>
            <h2 className="mt-6 max-w-md text-4xl font-black leading-[1.08] tracking-tight xl:text-5xl">
              Sua operação técnica, em um só lugar.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-blue-100/85">
              Acompanhe ordens de serviço, clientes e atividades da equipe com mais clareza e agilidade.
            </p>
          </div>

          <div className="relative z-10 my-auto py-8">
            <div className="relative mx-auto max-w-md rounded-[24px] border border-white/15 bg-white/[0.09] p-5 shadow-2xl shadow-[#061d4f]/35 backdrop-blur-md">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200">Visão da operação</p>
                  <p className="mt-1 text-lg font-black">Controle e produtividade</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00b4ff] text-white shadow-lg shadow-[#00b4ff]/25">
                  <BarChart3 size={20} />
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Ordens de serviço", "Acompanhamento"],
                  ["Equipe técnica", "Responsáveis"],
                  ["Clientes", "Histórico"],
                  ["Atendimentos", "Organização"],
                ].map(([title, subtitle], index) => (
                  <div key={title} className="rounded-xl border border-white/10 bg-white/[0.08] p-3">
                    <span className={`mb-3 flex h-7 w-7 items-center justify-center rounded-lg ${index === 0 ? "bg-[#00b4ff]" : "bg-white/10"}`}>
                      <CheckCircle2 size={15} />
                    </span>
                    <p className="text-xs font-bold">{title}</p>
                    <p className="mt-0.5 text-[10px] text-blue-200/80">{subtitle}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative z-10 flex items-center gap-3 text-xs text-blue-100/75">
            <span className="h-px flex-1 bg-white/15" />
            Tecnologia a serviço da sua equipe
            <span className="h-px flex-1 bg-white/15" />
          </div>
        </aside>
      </div>
    </main>
  );
}
