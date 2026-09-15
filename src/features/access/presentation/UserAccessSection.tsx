import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, XCircle } from "lucide-react";
import { ARTVIDEO_ORGANIZATION_ID } from "@/features/telephony/domain/uniq-call";
import { listActiveRoles } from "@/features/roles/infrastructure/roles.repository";
import {
  checkEmployeeUsernameAvailability,
  listObservedUniqSubscribers,
} from "../infrastructure/user-access.repository";
import { isValidUsername, normalizeUsername } from "@/features/auth/domain/username";
import { FInput, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { Section } from "@/shared/ui/admin/AdminLayout";
import { cn } from "@/shared/domain/formatters";

export type EmployeeAccessFormState = {
  enabled: boolean;
  profile_id: string | null;
  username: string;
  password: string;
  role_id: string;
  uniq_subscriber_id: string;
};

export const emptyEmployeeAccessForm = (): EmployeeAccessFormState => ({
  enabled: false,
  profile_id: null,
  username: "",
  password: "",
  role_id: "",
  uniq_subscriber_id: "",
});

type RoleOption = { id: string; name: string };
type UniqSubscriber = { subscriber_id: string | number; call_count?: number };
type UsernameAvailability = "idle" | "checking" | "available" | "unavailable" | "error";

const rolesCache = new Map<string, RoleOption[]>();
let uniqSubscribersCache: UniqSubscriber[] | null = null;

export function UserAccessSection({
  organizationId,
  value,
  onChange,
  existingAccess,
  disabled = false,
  loading = false,
  embedded = false,
}: {
  organizationId: string | null;
  value: EmployeeAccessFormState;
  onChange: (value: EmployeeAccessFormState) => void;
  existingAccess: boolean;
  disabled?: boolean;
  loading?: boolean;
  embedded?: boolean;
}) {
  const [roles, setRoles] = useState<RoleOption[]>(organizationId ? rolesCache.get(organizationId) || [] : []);
  const [uniqSubscribers, setUniqSubscribers] = useState<UniqSubscriber[]>(uniqSubscribersCache || []);
  const [showPassword, setShowPassword] = useState(false);
  const [usernameAvailability, setUsernameAvailability] = useState<UsernameAvailability>("idle");
  const isArtVideo = organizationId === ARTVIDEO_ORGANIZATION_ID;
  const normalizedUsername = normalizeUsername(value.username);
  const usernameValid = isValidUsername(normalizedUsername);

  useEffect(() => {
    let cancelled = false;
    if (!organizationId) return;

    const cachedRoles = rolesCache.get(organizationId);
    if (cachedRoles) {
      setRoles(cachedRoles);
    } else {
      void listActiveRoles(organizationId).then(({ data }) => {
        if (cancelled) return;
        const next = (data || []).map((role: any) => ({ id: String(role.id), name: String(role.name) }));
        rolesCache.set(organizationId, next);
        setRoles(next);
      });
    }

    if (isArtVideo) {
      if (uniqSubscribersCache) {
        setUniqSubscribers(uniqSubscribersCache);
      } else {
        void listObservedUniqSubscribers().then(({ data }) => {
          if (cancelled) return;
          const next = (data || []) as UniqSubscriber[];
          uniqSubscribersCache = next;
          setUniqSubscribers(next);
        });
      }
    } else {
      setUniqSubscribers([]);
    }

    return () => { cancelled = true; };
  }, [organizationId, isArtVideo]);

  useEffect(() => {
    if (!value.enabled || !normalizedUsername || !usernameValid) {
      setUsernameAvailability("idle");
      return;
    }

    let cancelled = false;
    setUsernameAvailability("checking");
    const timeout = window.setTimeout(() => {
      void checkEmployeeUsernameAvailability(normalizedUsername, value.profile_id).then(result => {
        if (cancelled) return;
        if (result.error) {
          setUsernameAvailability("error");
          return;
        }
        setUsernameAvailability(result.available ? "available" : "unavailable");
      });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [value.enabled, value.profile_id, normalizedUsername, usernameValid]);

  const roleOptions = useMemo(() => [
    { value: "", label: "Selecionar função..." },
    ...roles.map(role => ({ value: role.id, label: role.name })),
  ], [roles]);

  const uniqOptions = useMemo(() => {
    const options = [
      { value: "", label: "Sem vínculo com a Uniq" },
      ...uniqSubscribers.map(item => ({
        value: String(item.subscriber_id),
        label: `Usuário Uniq • ${String(item.subscriber_id)}${item.call_count != null ? ` (${Number(item.call_count)} chamadas)` : ""}`,
      })),
    ];
    if (value.uniq_subscriber_id && !options.some(option => option.value === value.uniq_subscriber_id)) {
      options.push({ value: value.uniq_subscriber_id, label: `Usuário Uniq • ${value.uniq_subscriber_id}` });
    }
    return options;
  }, [uniqSubscribers, value.uniq_subscriber_id]);

  const availabilityFeedback = !normalizedUsername
    ? <span className="text-[#6b7c93]">Use de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado.</span>
    : !usernameValid
      ? <span className="inline-flex items-center gap-1.5 text-red-600"><XCircle size={13} /> Usuário inválido. Use somente letras, números, ponto, hífen ou sublinhado.</span>
      : usernameAvailability === "checking"
        ? <span className="inline-flex items-center gap-1.5 text-[#6b7c93]"><LoaderCircle size={13} className="animate-spin" /> Verificando disponibilidade...</span>
        : usernameAvailability === "available"
          ? <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600"><CheckCircle2 size={13} /> Usuário disponível</span>
          : usernameAvailability === "unavailable"
            ? <span className="inline-flex items-center gap-1.5 font-semibold text-red-600"><XCircle size={13} /> Usuário já está em uso</span>
            : usernameAvailability === "error"
              ? <span className="inline-flex items-center gap-1.5 text-red-600"><XCircle size={13} /> Não foi possível verificar a disponibilidade.</span>
              : null;

  const content = <div className="space-y-4" aria-busy={loading}>
    <p className="text-xs leading-relaxed text-[#5a6a82]">O funcionário pode existir sem login. O usuário de acesso é global e deve ser único em todo o sistema.</p>

    <FToggle
      label="Permitir acesso ao sistema"
      description={existingAccess ? "Desativar bloqueia o login sem excluir o funcionário." : "Ative para criar o usuário de acesso deste funcionário."}
      checked={value.enabled}
      disabled={disabled || loading}
      onChange={enabled => onChange({ ...value, enabled })}
    />

    {(value.enabled || existingAccess) && <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0">
        <FInput
          label="Usuário"
          required={value.enabled}
          disabled={disabled || loading}
          autoComplete="username"
          spellCheck={false}
          maxLength={32}
          placeholder="ex.: rafael.lima"
          value={value.username}
          onChange={(event: any) => onChange({ ...value, username: normalizeUsername(event.target.value) })}
        />
        <div className="mt-1.5 min-h-4 text-[11px] leading-4">{availabilityFeedback}</div>
      </div>
      <div className="relative min-w-0">
        <FInput
          label={existingAccess ? "Nova senha" : "Senha"}
          required={value.enabled && !existingAccess}
          disabled={disabled || loading || !value.enabled}
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          placeholder={existingAccess ? "Deixe em branco para manter" : "Mínimo de 8 caracteres"}
          value={value.password}
          onChange={(event: any) => onChange({ ...value, password: event.target.value })}
          className="pr-11"
        />
        {value.enabled && !disabled && <button
          type="button"
          onClick={() => setShowPassword(current => !current)}
          className={cn("absolute right-3 top-[35px] rounded p-1 text-[#5a6a82] hover:text-[#0057e7]")}
          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          title={showPassword ? "Ocultar senha" : "Mostrar senha"}
        >{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
      </div>
      <FSelect
        label="Função"
        required={value.enabled}
        disabled={disabled || loading || !value.enabled}
        value={value.role_id}
        onChange={(event: any) => onChange({ ...value, role_id: event.target.value })}
        options={roleOptions}
      />
      {isArtVideo && <FSelect
        label="Usuário / ramal Uniq"
        disabled={disabled || loading}
        value={value.uniq_subscriber_id}
        onChange={(event: any) => onChange({ ...value, uniq_subscriber_id: event.target.value })}
        options={uniqOptions}
      />}
    </div>}
  </div>;

  return embedded ? content : <Section title="Acesso ao sistema">{content}</Section>;
}
