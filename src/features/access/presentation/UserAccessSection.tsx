import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { ARTVIDEO_ORGANIZATION_ID } from "@/features/telephony/domain/uniq-call";
import { listActiveRoles } from "@/features/roles/infrastructure/roles.repository";
import { listObservedUniqSubscribers } from "../infrastructure/user-access.repository";
import { FEmailInput, FInput, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { Section } from "@/shared/ui/admin/AdminLayout";
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

export function UserAccessSection({
  organizationId,
  value,
  onChange,
  existingAccess,
  disabled = false,
  loading = false,
}: {
  organizationId: string | null;
  value: EmployeeAccessFormState;
  onChange: (value: EmployeeAccessFormState) => void;
  existingAccess: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [uniqSubscribers, setUniqSubscribers] = useState<Array<{ subscriber_id: string | number; call_count?: number }>>([]);
  const [showPassword, setShowPassword] = useState(false);
  const isArtVideo = organizationId === ARTVIDEO_ORGANIZATION_ID;

  useEffect(() => {
    let cancelled = false;
    if (!organizationId) return;
    void listActiveRoles(organizationId).then(({ data }) => {
      if (!cancelled) setRoles((data || []).map((role: any) => ({ id: String(role.id), name: String(role.name) })));
    });
    if (isArtVideo) {
      void listObservedUniqSubscribers().then(({ data }) => {
        if (!cancelled) setUniqSubscribers((data || []) as Array<{ subscriber_id: string | number; call_count?: number }>);
      });
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

  return <Section title="Acesso ao sistema">
    <div className="space-y-4">
      <div className="rounded-xl border border-[#0057e7]/15 bg-[#0057e7]/5 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#0057e7]" />
          <div className="min-w-0">
            <div className="text-sm font-black text-[#0d1b2e]">Login separado do cadastro funcional</div>
            <p className="mt-1 text-xs leading-relaxed text-[#5a6a82]">O funcionário pode existir sem login. Ao habilitar o acesso, a função define as permissões-base; permissões extras podem ser configuradas individualmente nos detalhes do cadastro.</p>
          </div>
        </div>
      </div>

      <FToggle
        label="Permitir acesso ao sistema"
        description={existingAccess ? "Desativar bloqueia o login sem excluir o funcionário." : "Ative para criar o usuário de acesso deste funcionário."}
        checked={value.enabled}
        disabled={disabled || loading}
        onChange={enabled => onChange({ ...value, enabled })}
      />

      {(value.enabled || existingAccess) && <div className="grid gap-4 sm:grid-cols-2">
        <FEmailInput
          label="E-mail de acesso"
          required={value.enabled}
          disabled={disabled || loading}
          value={value.email}
          onChange={(event: any) => onChange({ ...value, email: event.target.value })}
        />
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
    </div>
  </Section>;
}
