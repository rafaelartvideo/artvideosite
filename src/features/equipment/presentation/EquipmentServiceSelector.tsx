import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import type { EquipmentServiceSettings } from "../infrastructure/equipment.repository";

type Props = {
  selectedIds: string[];
  services: EquipmentServiceSettings["services"];
  loading: boolean;
  error: string | null;
  disabled: boolean;
  available: boolean;
  onRetry?: () => void;
  onCreate?: () => void;
  onChange: (ids: string[]) => void;
};

export function EquipmentServiceSelector({ selectedIds, services, loading, error, disabled, available, onRetry, onCreate, onChange }: Props) {
  const chosen = new Set(selectedIds);
  const visible = services.filter(service => service.is_active || chosen.has(service.id))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  return <div className="border-t border-border pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Serviços vinculados</h3>
      {onCreate && <BtnSecondary onClick={onCreate} disabled={disabled || loading || !available}>Novo serviço</BtnSecondary>}
    </div>
    {loading && <p className="mt-3 text-xs text-muted-foreground">Carregando serviços da empresa...</p>}
    {!loading && !error && !available && <div role="status" className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span>Vínculos de serviços indisponíveis até a atualização do banco de dados. Você ainda pode editar os demais dados do equipamento.</span>
      {onRetry && <button type="button" onClick={onRetry} className="font-semibold text-primary underline underline-offset-2">Verificar novamente</button>}
    </div>}
    {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
    {!loading && !error && <div className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
      {visible.map(service => <label key={service.id} className="flex cursor-pointer items-center gap-3 border-b border-border py-3 text-xs text-foreground">
        <Checkbox checked={chosen.has(service.id)} disabled={disabled || !available || (!service.is_active && !chosen.has(service.id))}
          onCheckedChange={value => {
            const ids = value === true ? [...chosen, service.id] : selectedIds.filter(id => id !== service.id);
            onChange(ids);
          }} />
        <span className="min-w-0 flex-1 font-semibold">{service.name}</span>
        {!service.is_active && <span className="text-[10px] text-muted-foreground">Inativo</span>}
      </label>)}
      {visible.length === 0 && <p className="py-3 text-xs text-muted-foreground">
        Nenhum Serviço Geral cadastrado. {onCreate ? "Use Novo serviço para cadastrar e vincular." : "Cadastre os serviços no módulo Serviços Gerais para vinculá-los."}
      </p>}
    </div>}
  </div>;
}
