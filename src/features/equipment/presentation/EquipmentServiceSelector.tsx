import { Checkbox } from "@/shared/ui/primitives/checkbox";
import type { EquipmentServiceSettings } from "../infrastructure/equipment.repository";

type Props = {
  selectedIds: string[];
  services: EquipmentServiceSettings["services"];
  loading: boolean;
  error: string | null;
  disabled: boolean;
  onChange: (ids: string[]) => void;
};

export function EquipmentServiceSelector({ selectedIds, services, loading, error, disabled, onChange }: Props) {
  const chosen = new Set(selectedIds);
  const visible = services.filter(service => service.is_active || chosen.has(service.id));
  return <div className="border-t border-border pt-4">
    <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Serviços vinculados</h3>
    <p className="mt-1 text-xs text-muted-foreground">
      Marque os Serviços Gerais que podem ser adicionados às OS deste equipamento.
      Os serviços avulsos continuam disponíveis separadamente.
    </p>
    {loading && <p className="mt-3 text-xs text-muted-foreground">Carregando serviços da empresa...</p>}
    {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
    {!loading && !error && <div className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
      {visible.map(service => <label key={service.id} className="flex cursor-pointer items-center gap-3 border-b border-border py-3 text-xs text-foreground">
        <Checkbox checked={chosen.has(service.id)} disabled={disabled || (!service.is_active && !chosen.has(service.id))}
          onCheckedChange={value => {
            const ids = value === true ? [...chosen, service.id] : selectedIds.filter(id => id !== service.id);
            onChange(ids);
          }} />
        <span className="min-w-0 flex-1 font-semibold">{service.name}</span>
        {!service.is_active && <span className="text-[10px] text-muted-foreground">Inativo</span>}
      </label>)}
      {visible.length === 0 && <p className="py-3 text-xs text-muted-foreground">
        Nenhum Serviço Geral cadastrado. Cadastre os serviços no módulo Serviços Gerais para vinculá-los.
      </p>}
    </div>}
  </div>;
}
