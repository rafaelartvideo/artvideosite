import { Plus } from "lucide-react";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import type { EquipmentServiceSettings } from "../infrastructure/equipment.repository";

/** Abre o cadastro completo do serviço, sem campo redundante no cabeçalho. */
export function EquipmentServiceCreate({ onCreate, disabled }: {
  onCreate: (name: string) => void;
  disabled?: boolean;
}) {
  return <AdminButton variant="tertiary" size="sm" disabled={disabled}
    onClick={() => onCreate("")}><Plus size={14} /> Adicionar</AdminButton>;
}

type Props = {
  selectedIds: string[];
  services: EquipmentServiceSettings["services"];
  loading: boolean;
  error: string | null;
  disabled: boolean;
  available: boolean;
  onRetry?: () => void;
  onChange: (ids: string[]) => void;
};

export function EquipmentServiceSelector({ selectedIds, services, loading, error, disabled, available, onRetry, onChange }: Props) {
  const chosen = new Set(selectedIds);
  const visible = services.filter(service => service.is_active || chosen.has(service.id))
    .sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id))
      || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  return <div className="space-y-3">
    {loading && <LoadingState text="Carregando serviços da empresa..." />}
    {!loading && !error && !available && <div role="status" className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span>Vínculos de serviços indisponíveis até a atualização do banco de dados. Você ainda pode editar os demais dados do equipamento.</span>
      {onRetry && <button type="button" onClick={onRetry} className="font-semibold text-primary underline underline-offset-2">Verificar novamente</button>}
    </div>}
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    {!loading && !error && <div className="grid min-h-40 grid-cols-1 content-start gap-x-6 sm:grid-cols-2">
      {visible.map(service => <label key={service.id} className="flex cursor-pointer items-center gap-3 py-2.5 text-xs text-foreground">
        <Checkbox checked={chosen.has(service.id)} disabled={disabled || !available || (!service.is_active && !chosen.has(service.id))}
          onCheckedChange={value => {
            const ids = value === true ? [...chosen, service.id] : selectedIds.filter(id => id !== service.id);
            onChange(ids);
          }} />
        <span className="min-w-0 flex-1 font-semibold">{service.name}</span>
        {!service.is_active && <span className="text-[10px] text-muted-foreground">Inativo</span>}
      </label>)}
      {visible.length === 0 && <p className="py-3 text-xs text-muted-foreground">
        Nenhum Serviço Geral cadastrado. Cadastre um serviço no cabeçalho da seção ou no módulo Serviços Gerais para vinculá-lo.
      </p>}
    </div>}
  </div>;
}
