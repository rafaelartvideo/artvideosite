import { useState } from "react";
import { AlertCircle, Clock, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { FInput, INPUT } from "@/app/admin/shared";
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

    const normalizedEmail = email.trim().toLowerCase();
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError) {
      setError("Credenciais inválidas. Verifique seu e-mail e senha.");
      setLoading(false);
      return;
    }

    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("id", data.user.id)
        .single();

      if (profile?.is_active === false) {
        await supabase.auth.signOut();
        setError("Usuário inativo. Entre em contato com o gestor.");
        setLoading(false);
        return;
      }
    }

    setLoading(false);
  };

  const passwordVisibilityLabel = showPassword ? "Ocultar senha" : "Mostrar senha";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d1b2e] via-[#0a1520] to-[#06101a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-6">
            <img src={logoSolo} alt="" aria-hidden="true" className="h-10 w-10 shrink-0 object-contain" />
            <div className="text-left">
              <span className="text-[9px] font-bold tracking-[0.3em] uppercase text-[#00b4ff] block">Eletrônica</span>
              <span className="text-xl font-black text-white block" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>ARTVIDEO</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl border border-white/5">
          <h1 className="text-2xl font-black text-[#0d1b2e] mb-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Bem-vindo de volta</h1>
          <p className="text-sm text-[#5a6a82] mb-6">Entre com suas credenciais para acessar o painel.</p>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
              <AlertCircle size={16} className="flex-shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <FInput
              label="E-mail"
              type="email"
              value={email}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
              required
              placeholder="seu@email.com"
            />

            <div>
              <label className="flex items-baseline gap-1 text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">
                Senha<span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  placeholder="••••••••"
                  className={`${INPUT} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={passwordVisibilityLabel}
                  title={passwordVisibilityLabel}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[#5a6a82] hover:text-[#0057e7] focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40 rounded"
                >
                  {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0057e7] text-white font-bold py-3 px-6 rounded-xl text-sm hover:bg-[#0046c0] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {loading ? <Clock size={18} className="animate-spin" /> : null}
              {loading ? "Entrando..." : "Entrar no painel"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
