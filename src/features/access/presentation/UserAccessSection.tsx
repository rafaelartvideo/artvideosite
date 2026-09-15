import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { ARTVIDEO_ORGANIZATION_ID } from "@/features/telephony/domain/uniq-call";
import { listActiveRoles } from "@/features/roles/infrastructure/roles.repository";
import { listObservedUniqSubscribers } from "../infrastructure/user-access.repository";
import { FEmailInput, FInput, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, Section } from "@/shared/ui/admin/AdminLayout";
import { cn } from "@/shared/domain/formatters";

export type EmployeeAccessFormState = {
  enabled: boolean;
  email: string;
  password: string;
  role_id: string;
  uniq_subscriber_id: string;
};

export const emptyEmployeeAccessForm = (): EmployeeAccessFormState => ({
  enabled: false,
  email: "",
  password: "",
  role_id: "",
  uniq_subscriber_id: "",
});

type RoleOption = { id: string; name: string };
type UniqSubscriber = { subscriber_id: string | number; call_count?: number };

const rolesCache = new Map<string, RoleOption[]>();
let uniqSubscribersCache: UniqSubscriber[] | null = null;

export function UserAccessSection({
  organizationId,
  value,
  onChange,
  existingAccess,
  registrationEmail = "",
  disabled = false,
  loading = false,
  embedded = false,
}: {
  organizationId: string | null;
  value: EmployeeAccessFormState;
  onChange: (value: EmployeeAccessFormState) => void;
  existingAccess: boolean;
  registrationEmail?: string;
  disabled?: boolean;
  loading?: boolean;
  embedded?: boolean;
}) {
  const [roles, setRoles] = useState<RoleOption[]>(organizationId ? rolesCache.get(organizationId) || [] : []);
  const [uniqSubscribers, setUniqSubscribers] = useState<UniqSubscriber[]>(uniqSubscribersCache || []);
  const [showPassword, setShowPassword] = useState(false);
  const isArtVideo = organizationId === ARTVIDEO_ORGANIZATION_ID;
  const normalizedRegistrationEmail = registrationEmail.trim().replace(/\s+/g, "").toLowerCase();
  const normalizedLoginEmail = value.email.trim().replace(/\s+/g, "").toLowerCase();
  const canCopyRegistrationEmail = Boolean(
    normalizedRegistrationEmail
    && normalizedRegistrationEmail !== normalizedLoginEmail
    && !disabled
    && !loading,
  );

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

  const content = <div className="space-y-4" aria-busy={loading}>
    <p className="text-xs leading-relaxed text-[#5a6a82]">O funcionário pode existir sem login. O e-mail de login é independente do e-mail de contato do cadastro e pode ser diferente.</p>

    <FToggle
      label="Permitir acesso ao sistema"
      description={existingAccess ? "Desativar bloqueia o login sem excluir o funcionário." : "Ative para criar o usuário de acesso deste funcionário."}
      checked={value.enabled}
      disabled={disabled || loading}
      onChange={enabled => onChange({ ...value, enabled })}
    />

    {(value.enabled || existingAccess) && <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0">
        <FEmailInput
          label="E-mail de login"
          required={value.enabled}
          disabled={disabled || loading}
          value={value.email}
          onChange={(event: any) => onChange({ ...value, email: event.target.value })}
        />
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <AdminButton
            variant="secondary"
            size="sm"
            disabled={!canCopyRegistrationEmail}
            onClick={() => onChange({ ...value, email: normalizedRegistrationEmail })}
            title={normalizedRegistrationEmail ? "Copiar o e-mail de contato para o e-mail de login" : "Cadastre primeiro um e-mail de contato"}
          >
            <Copy size={13} /> Usar e-mail do cadastro
          </AdminButton>
          {normalizedRegistrationEmail && <span className="min-w-0 truncate text-[11px] text-[#6b7c93]" title={normalizedRegistrationEmail}>{normalizedRegistrationEmail}</span>}
        </div>
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
