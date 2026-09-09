import { useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { authenticateAdmin } from "@/features/auth/infrastructure/auth.repository";
import { LoadingSpinner, Toast } from "@/shared/ui/admin/AdminFeedback";
import logo from "@/imports/Logo1Semfundo.png";
import { loginHero } from "./loginHero";

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
    <main className="admin-crm min-h-[100dvh] overflow-hidden bg-[#171c24] text-white lg:grid lg:grid-cols-[40%_60%]">
      {error && <Toast message={error} type="error" onClose={() => setError("")} />}

      <style>{`
        .admin-login-password::-ms-reveal,
        .admin-login-password::-ms-clear {
          display: none;
        }

        .admin-login-input:-webkit-autofill,
        .admin-login-input:-webkit-autofill:hover,
        .admin-login-input:-webkit-autofill:focus {
          -webkit-text-fill-color: #ffffff;
          -webkit-box-shadow: 0 0 0 1000px #14181e inset;
          transition: background-color 9999s ease-in-out 0s;
        }
      `}</style>

      <section className="relative z-10 flex min-h-[100dvh] items-center justify-center bg-[radial-gradient(circle_at_18%_12%,rgba(47,128,237,0.09),transparent_30%),linear-gradient(145deg,#23272f_0%,#1c2129_52%,#171c24_100%)] px-5 py-8 sm:px-8 lg:px-10 xl:px-16">
        <div className="w-full max-w-[410px]">
          <div className="mb-7 text-center sm:mb-8">
            <img
              src={logo}
              alt="Eletrônica ArtVideo"
              className="mx-auto h-auto w-full max-w-[210px] object-contain sm:max-w-[225px]"
            />
            <h1 className="mt-4 text-[30px] font-extrabold tracking-tight text-white sm:text-[34px]">
              Bem-vindo
            </h1>
            <p className="mt-2 text-sm text-[#aeb7c5]">Acesse sua conta para continuar.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="admin-login-email" className="mb-2 block text-sm font-semibold text-[#f3f5f8]">
                Email
              </label>
              <div className="relative">
                <Mail
                  size={18}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9ba6b7]"
                />
                <input
                  id="admin-login-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="seu@email.com"
                  className="admin-login-input h-[50px] w-full rounded-lg border border-white/[0.11] bg-[#14181e] pl-12 pr-4 text-sm text-white outline-none transition placeholder:text-[#697587] hover:border-white/[0.2] focus:border-[#2f80ed] focus:ring-2 focus:ring-[#2f80ed]/20"
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-login-password" className="mb-2 block text-sm font-semibold text-[#f3f5f8]">
                Senha
              </label>
              <div className="relative">
                <LockKeyhole
                  size={18}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9ba6b7]"
                />
                <input
                  id="admin-login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="admin-login-input admin-login-password h-[50px] w-full appearance-none rounded-lg border border-white/[0.11] bg-[#14181e] pl-12 pr-12 text-sm text-white outline-none transition placeholder:text-[#697587] hover:border-white/[0.2] focus:border-[#2f80ed] focus:ring-2 focus:ring-[#2f80ed]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={passwordVisibilityLabel}
                  title={passwordVisibilityLabel}
                  className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[#a9b4c4] transition-colors hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#2f80ed]/40"
                >
                  {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="mt-2 flex h-[50px] w-full items-center justify-center gap-2 rounded-lg bg-[#2f80ed] px-6 text-sm font-bold text-white shadow-[0_10px_28px_rgba(47,128,237,0.2)] transition-all hover:bg-[#2474dd] focus:outline-none focus:ring-2 focus:ring-[#5d9cff] focus:ring-offset-2 focus:ring-offset-[#1c2129] disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? <LoadingSpinner size="sm" /> : null}
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </section>

      <aside className="relative hidden min-h-[100dvh] overflow-hidden bg-[#06111c] lg:block" aria-hidden="true">
        <img
          src={loginHero}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[center_44%]"
          draggable={false}
        />
        <div className="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-[#171c24]/35 to-transparent" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,11,20,0.02)_0%,rgba(0,11,20,0.01)_70%,rgba(0,11,20,0.1)_100%)]" />
      </aside>
    </main>
  );
}
