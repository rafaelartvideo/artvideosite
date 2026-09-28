import { useEffect, useState } from "react";
import {
  BarChart3,
  Eye,
  EyeOff,
  LockKeyhole,
  Settings2,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  authenticateAdmin,
  changeAdminPassword,
} from "@/features/auth/infrastructure/auth.repository";
import { LoadingSpinner, Toast } from "@/shared/ui/admin/AdminFeedback";

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

const LOGIN_BACKGROUND = "/assets/crm/login/capatelalogin.png";
const LOGIN_LOGO = "/assets/crm/login/logotelalogin.png";
const REMEMBERED_USERNAME_KEY = "unionworld:remembered-username";

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  placeholder = "Senha",
}: PasswordFieldProps) {
  const visibilityLabel = visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`;

  return (
    <div>
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md border border-[#1da8ff]/20 bg-[#1da8ff]/10 text-[#29b6ff] shadow-[0_6px_18px_rgba(0,145,255,0.10)] backdrop-blur-md"
        >
          <LockKeyhole size={19} strokeWidth={2} />
        </span>
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="admin-login-input admin-login-password h-[54px] w-full appearance-none rounded-lg border border-[#7e9bbb]/55 bg-[#06182a]/60 pl-14 pr-12 text-[15px] text-white outline-none backdrop-blur-sm transition placeholder:text-[#93a7bd] hover:border-[#8fb3d8]/80 focus:border-[#1da8ff] focus:ring-2 focus:ring-[#1da8ff]/20"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visibilityLabel}
          title={visibilityLabel}
          className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-[#c6d5e5] transition-colors hover:bg-white/[0.07] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#17a6ff]/35"
        >
          {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  children,
}: {
  icon: typeof BarChart3;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/70 bg-[#07182a]/25 text-white shadow-[0_8px_28px_rgba(0,0,0,0.12)] backdrop-blur-sm">
        <Icon size={25} strokeWidth={1.9} aria-hidden="true" />
      </div>
      <div className="mt-3 max-w-[130px] text-[13px] font-semibold leading-[1.35] text-white/95">
        {children}
      </div>
    </div>
  );
}

export function AdminLogin({ onLoginSuccess: _onLoginSuccess }: AdminLoginProps) {
  const [mode, setMode] = useState<"login" | "change-password">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberUsername, setRememberUsername] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const remembered = window.localStorage.getItem(REMEMBERED_USERNAME_KEY);
    if (!remembered) return;
    setUsername(remembered);
    setRememberUsername(true);
  }, []);

  const clearFeedback = () => {
    setError("");
    setSuccess("");
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    clearFeedback();

    const normalizedUsername = username.trim().toLowerCase();

    if (rememberUsername) {
      window.localStorage.setItem(REMEMBERED_USERNAME_KEY, normalizedUsername);
    } else {
      window.localStorage.removeItem(REMEMBERED_USERNAME_KEY);
    }

    const result = await authenticateAdmin(normalizedUsername, password);

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
    <main className="admin-crm min-h-[100dvh] overflow-hidden bg-[#041426] text-white lg:grid lg:grid-cols-[42%_58%] xl:grid-cols-[40%_60%]">
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
          -webkit-box-shadow: 0 0 0 1000px #071b30 inset;
          caret-color: #ffffff;
          transition: background-color 9999s ease-in-out 0s;
        }
      `}</style>

      <section className="relative z-10 flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#05182b] px-5 py-8 sm:px-8 lg:px-10 xl:px-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(0,174,255,0.13),transparent_30%),radial-gradient(circle_at_82%_88%,rgba(0,91,196,0.15),transparent_30%),linear-gradient(150deg,#061c31_0%,#041527_50%,#031220_100%)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-24 bg-gradient-to-r from-transparent to-[#03111f]/55 lg:block" />

        <div className="relative w-full max-w-[430px]">
          <div className="mb-8 text-center">
            <img
              src={LOGIN_LOGO}
              alt="Union World — Sistema de Gestão"
              className="mx-auto h-auto w-full max-w-[250px] object-contain sm:max-w-[275px]"
              draggable={false}
            />

            <div className="mt-7 text-left">
              <h1 className="text-[28px] font-black tracking-tight text-white sm:text-[30px]">
                {changingPassword ? "Alterar senha" : "Bem-vindo"}
              </h1>
              <p className="mt-1.5 text-[15px] leading-6 text-[#c0cada]">
                {changingPassword
                  ? "Confirme sua senha atual e defina uma nova senha."
                  : "Faça login para acessar o sistema"}
              </p>
            </div>
          </div>

          <form onSubmit={changingPassword ? handlePasswordChange : handleLogin} className="space-y-3.5">
            <div>
              <label htmlFor="admin-login-username" className="sr-only">Usuário</label>
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md border border-[#1da8ff]/20 bg-[#1da8ff]/10 text-[#29b6ff] shadow-[0_6px_18px_rgba(0,145,255,0.10)] backdrop-blur-md"
                >
                  <UserRound size={19} strokeWidth={2} />
                </span>
                <input
                  id="admin-login-username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value.toLowerCase())}
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Usuário"
                  className="admin-login-input h-[54px] w-full rounded-lg border border-[#7e9bbb]/55 bg-[#06182a]/60 pl-14 pr-4 text-[15px] text-white outline-none backdrop-blur-sm transition placeholder:text-[#93a7bd] hover:border-[#8fb3d8]/80 focus:border-[#1da8ff] focus:ring-2 focus:ring-[#1da8ff]/20"
                />
              </div>
            </div>

            {changingPassword ? (
              <>
                <PasswordField
                  id="admin-current-password"
                  label="Senha atual"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  visible={showCurrentPassword}
                  onToggle={() => setShowCurrentPassword(current => !current)}
                  autoComplete="current-password"
                  placeholder="Senha atual"
                />
                <PasswordField
                  id="admin-new-password"
                  label="Nova senha"
                  value={newPassword}
                  onChange={setNewPassword}
                  visible={showNewPassword}
                  onToggle={() => setShowNewPassword(current => !current)}
                  autoComplete="new-password"
                  placeholder="Nova senha"
                />
                <PasswordField
                  id="admin-confirm-password"
                  label="Confirmar nova senha"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword(current => !current)}
                  autoComplete="new-password"
                  placeholder="Confirmar nova senha"
                />
              </>
            ) : (
              <PasswordField
                id="admin-login-password"
                label="Senha"
                value={password}
                onChange={setPassword}
                visible={showPassword}
                onToggle={() => setShowPassword(current => !current)}
                autoComplete="current-password"
              />
            )}

            {!changingPassword && (
              <div className="flex items-center justify-between gap-4 pt-1">
                <label className="flex cursor-pointer select-none items-center gap-2.5 text-[13px] font-semibold text-[#d7e0eb]">
                  <input
                    type="checkbox"
                    checked={rememberUsername}
                    onChange={(event) => setRememberUsername(event.target.checked)}
                    className="h-[18px] w-[18px] cursor-pointer rounded border border-[#8ca4be] bg-transparent accent-[#149cff]"
                  />
                  Lembrar de mim
                </label>

                <button
                  type="button"
                  onClick={openPasswordChange}
                  disabled={loading}
                  className="text-[13px] font-semibold text-[#21b7ff] transition hover:text-[#7dd5ff] disabled:opacity-60"
                >
                  Alterar senha
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="mt-5 flex h-[54px] w-full items-center justify-center gap-2 rounded-lg bg-[linear-gradient(90deg,#088cff_0%,#159dff_100%)] px-6 text-[16px] font-black text-white shadow-[0_12px_34px_rgba(0,145,255,0.25)] transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#5ec7ff] focus:ring-offset-2 focus:ring-offset-[#041527] disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? <LoadingSpinner size="sm" /> : null}
              {loading
                ? changingPassword ? "Alterando..." : "Entrando..."
                : changingPassword ? "Alterar senha" : "Entrar"}
            </button>

            {changingPassword && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={backToLogin}
                  disabled={loading}
                  className="text-sm font-semibold text-[#24b8ff] transition hover:text-white disabled:opacity-60"
                >
                  Voltar para o login
                </button>
              </div>
            )}
          </form>
        </div>
      </section>

      <aside className="relative hidden min-h-[100dvh] overflow-hidden bg-[#061426] lg:block">
        <img
          src={LOGIN_BACKGROUND}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
          draggable={false}
        />

        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,17,31,0.88)_0%,rgba(3,17,31,0.58)_35%,rgba(3,17,31,0.18)_70%,rgba(3,17,31,0.12)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,13,25,0.14)_0%,rgba(2,13,25,0.04)_52%,rgba(2,13,25,0.30)_100%)]" />

        <div className="relative z-10 flex h-full min-h-[100dvh] flex-col justify-center px-[9%] pb-[8%] pt-[6%] xl:px-[11%]">
          <div className="max-w-[520px] -translate-y-[8%]">
            <h2 className="text-[38px] font-black leading-[1.08] tracking-tight text-white xl:text-[48px]">
              Tudo em um
              <span className="block bg-[linear-gradient(90deg,#20c9ff_0%,#159dff_72%)] bg-clip-text text-transparent">
                só lugar
              </span>
            </h2>

            <p className="mt-5 max-w-[470px] text-[17px] font-medium leading-[1.55] text-white/90 xl:text-[19px]">
              Gestão completa para o seu negócio.
              <br />
              CRM, ordens de serviço, estoque,
              <br className="hidden xl:block" />
              vendas e muito mais.
            </p>

            <div className="mt-12 grid max-w-[590px] grid-cols-4 gap-5 xl:mt-14 xl:gap-7">
              <Feature icon={BarChart3}>Gestão completa</Feature>
              <Feature icon={UsersRound}>Relacionamento com clientes</Feature>
              <Feature icon={Settings2}>Processos otimizados</Feature>
              <Feature icon={ShieldCheck}>Mais controle e produtividade</Feature>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
