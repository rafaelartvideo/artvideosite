import { useState } from "react";
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import {
  authenticateAdmin,
  changeAdminPassword,
} from "@/features/auth/infrastructure/auth.repository";
import { LoadingSpinner, Toast } from "@/shared/ui/admin/AdminFeedback";
import logo from "@/imports/Logo2Semfundo.png";
import loginHero from "./assets/login-hero/login-hero.png";

type AdminLoginProps = {
  onLoginSuccess: () => void;
};

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
  placeholder?: string;
};

function PasswordField({ id, label, value, onChange, visible, onToggle, autoComplete, placeholder = "••••••••" }: PasswordFieldProps) {
  const visibilityLabel = visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`;
  return <div>
    <label htmlFor={id} className="mb-2 block text-sm font-semibold text-[#f3f5f8]">{label}</label>
    <div className="relative">
      <LockKeyhole
        size={18}
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9ba6b7]"
      />
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="admin-login-input admin-login-password h-[50px] w-full appearance-none rounded-lg border border-white/[0.11] bg-[#14181e] pl-12 pr-12 text-sm text-white outline-none transition placeholder:text-[#697587] hover:border-white/[0.2] focus:border-[#2f80ed] focus:ring-2 focus:ring-[#2f80ed]/20"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visibilityLabel}
        title={visibilityLabel}
        className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[#a9b4c4] transition-colors hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#2f80ed]/40"
      >
        {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
      </button>
    </div>
  </div>;
}

export function AdminLogin({ onLoginSuccess: _onLoginSuccess }: AdminLoginProps) {
  const [mode, setMode] = useState<"login" | "change-password">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const clearFeedback = () => {
    setError("");
    setSuccess("");
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    clearFeedback();

    const result = await authenticateAdmin(username, password);

    if (result === "invalid_credentials") {
      setError("Credenciais inválidas. Verifique seu usuário e senha.");
    } else if (result === "inactive_user") {
      setError("Usuário inativo. Entre em contato com o gestor.");
    } else if (result === "ip_not_allowed") {
      setError("Acesso negado. Este endereço IP não está autorizado para este usuário.");
    }

    setLoading(false);
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    clearFeedback();

    if (newPassword.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("A confirmação da nova senha não confere.");
      return;
    }

    setLoading(true);
    const result = await changeAdminPassword(username, currentPassword, newPassword);

    if (result === "changed") {
      setMode("login");
      setPassword("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setSuccess("Senha alterada com sucesso. Entre com a nova senha.");
    } else if (result === "invalid_credentials") {
      setError("Usuário ou senha atual inválidos.");
    } else if (result === "inactive_user") {
      setError("Usuário inativo. Entre em contato com o gestor.");
    } else if (result === "weak_password") {
      setError("A nova senha não atende aos requisitos de segurança.");
    } else {
      setError("Não foi possível alterar a senha. Tente novamente.");
    }

    setLoading(false);
  };

  const openPasswordChange = () => {
    clearFeedback();
    setPassword("");
    setMode("change-password");
  };

  const backToLogin = () => {
    clearFeedback();
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMode("login");
  };

  const changingPassword = mode === "change-password";

  return (
    <main className="admin-crm min-h-[100dvh] overflow-hidden bg-[#171c24] text-white lg:grid lg:grid-cols-[40%_60%]">
      {error && <Toast message={error} type="error" onClose={() => setError("")} />}
      {success && <Toast message={success} type="success" onClose={() => setSuccess("")} />}

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
              {changingPassword ? "Alterar senha" : "Bem-vindo"}
            </h1>
            <p className="mt-2 text-sm text-[#aeb7c5]">
              {changingPassword ? "Confirme sua senha atual e defina uma nova senha." : "Acesse sua conta para continuar."}
            </p>
          </div>

          <form onSubmit={changingPassword ? handlePasswordChange : handleLogin} className="space-y-5">
            <div>
              <label htmlFor="admin-login-username" className="mb-2 block text-sm font-semibold text-[#f3f5f8]">
                Usuário
              </label>
              <div className="relative">
                <UserRound
                  size={18}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9ba6b7]"
                />
                <input
                  id="admin-login-username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value.toLowerCase())}
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="seu.usuario"
                  className="admin-login-input h-[50px] w-full rounded-lg border border-white/[0.11] bg-[#14181e] pl-12 pr-4 text-sm text-white outline-none transition placeholder:text-[#697587] hover:border-white/[0.2] focus:border-[#2f80ed] focus:ring-2 focus:ring-[#2f80ed]/20"
                />
              </div>
            </div>

            {changingPassword ? <>
              <PasswordField
                id="admin-current-password"
                label="Senha atual"
                value={currentPassword}
                onChange={setCurrentPassword}
                visible={showCurrentPassword}
                onToggle={() => setShowCurrentPassword(current => !current)}
                autoComplete="current-password"
              />
              <PasswordField
                id="admin-new-password"
                label="Nova senha"
                value={newPassword}
                onChange={setNewPassword}
                visible={showNewPassword}
                onToggle={() => setShowNewPassword(current => !current)}
                autoComplete="new-password"
                placeholder="Mínimo de 8 caracteres"
              />
              <PasswordField
                id="admin-confirm-password"
                label="Confirmar nova senha"
                value={confirmPassword}
                onChange={setConfirmPassword}
                visible={showConfirmPassword}
                onToggle={() => setShowConfirmPassword(current => !current)}
                autoComplete="new-password"
                placeholder="Repita a nova senha"
              />
            </> : <PasswordField
              id="admin-login-password"
              label="Senha"
              value={password}
              onChange={setPassword}
              visible={showPassword}
              onToggle={() => setShowPassword(current => !current)}
              autoComplete="current-password"
            />}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="mt-2 flex h-[50px] w-full items-center justify-center gap-2 rounded-lg bg-[#2f80ed] px-6 text-sm font-bold text-white shadow-[0_10px_28px_rgba(47,128,237,0.2)] transition-all hover:bg-[#2474dd] focus:outline-none focus:ring-2 focus:ring-[#5d9cff] focus:ring-offset-2 focus:ring-offset-[#1c2129] disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? <LoadingSpinner size="sm" /> : null}
              {loading
                ? changingPassword ? "Alterando..." : "Entrando..."
                : changingPassword ? "Alterar senha" : "Entrar"}
            </button>

            <div className="text-center">
              {changingPassword ? <button
                type="button"
                onClick={backToLogin}
                disabled={loading}
                className="text-sm font-semibold text-[#8ebeff] transition hover:text-white disabled:opacity-60"
              >
                Voltar para o login
              </button> : <button
                type="button"
                onClick={openPasswordChange}
                disabled={loading}
                className="text-sm font-semibold text-[#8ebeff] transition hover:text-white disabled:opacity-60"
              >
                Alterar senha
              </button>}
            </div>
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
