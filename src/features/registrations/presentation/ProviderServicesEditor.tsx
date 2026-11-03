import { Plus, Trash2 } from "lucide-react";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { Section } from "@/shared/ui/admin/AdminLayout";
import type { ProviderServiceForm } from "../domain/registration-form";

type Props = {
  value: ProviderServiceForm[];
  onChange: (services: ProviderServiceForm[]) => void;
  disabled?: boolean;
};

export function ProviderServicesEditor({ value, onChange, disabled = false }: Props) {
  const edit = (index: number, field: "name" | "description" | "reference_price", next: string) => {
    onChange(value.map((service, position) => position === index ? { ...service, [field]: next } : service));
  };

  const add = () => {
    if (disabled || value.length >= 30) return;
    onChange([...value, {
      draft_key: crypto.randomUUID(),
      name: "",
      description: "",
      reference_price: "",
    }]);
  };

  return <Section title="Serviços prestados">
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Cadastre os serviços realizados por este prestador. O valor de referência é opcional e não altera automaticamente o Financeiro ou os preços dos serviços da empresa.
      </p>

      {value.length === 0 && <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
        Nenhum serviço cadastrado. Adicione pelo menos um serviço para este vínculo.
      </p>}

      {value.map((service, index) => <div key={service.id || service.draft_key || index}
        className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-foreground">Serviço {index + 1}</span>
          {!disabled && <button type="button" onClick={() => onChange(value.filter((_, position) => position !== index))}
            aria-label={`Remover serviço ${index + 1}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-destructive/25 px-3 text-xs font-semibold text-destructive hover:bg-destructive/5">
            <Trash2 size={14} /> Remover
          </button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.4fr)]">
          <div>
            <label htmlFor={`provider-service-name-${index}`} className="mb-1.5 block text-xs font-semibold text-foreground">
              Nome do serviço <span className="text-destructive">*</span>
            </label>
            <input id={`provider-service-name-${index}`} value={service.name}
              onChange={event => edit(index, "name", event.target.value)}
              placeholder="Ex.: Instalação elétrica, pintura, transporte"
              maxLength={120} disabled={disabled} className={INPUT} />
          </div>
          <div>
            <label htmlFor={`provider-service-price-${index}`} className="mb-1.5 block text-xs font-semibold text-foreground">
              Valor de referência (R$)
            </label>
            <input id={`provider-service-price-${index}`} value={service.reference_price}
              onChange={event => edit(index, "reference_price", event.target.value)}
              placeholder="Ex.: 150,00" inputMode="decimal" disabled={disabled} className={INPUT} />
          </div>
        </div>
        <div>
          <label htmlFor={`provider-service-description-${index}`} className="mb-1.5 block text-xs font-semibold text-foreground">
            Descrição / observações
          </label>
          <textarea id={`provider-service-description-${index}`} value={service.description}
            onChange={event => edit(index, "description", event.target.value)}
            placeholder="Detalhes do serviço, especialidade ou condições de execução"
            maxLength={500} rows={2} disabled={disabled}
            className={`${INPUT} min-h-[72px] resize-y py-2`} />
        </div>
      </div>)}

      <button type="button" onClick={add} disabled={disabled || value.length >= 30}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-card px-4 py-2 text-xs font-bold text-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50">
        <Plus size={15} /> Adicionar serviço
      </button>
      <span className="ml-3 text-xs text-muted-foreground">{value.length} de 30 serviços</span>
    </div>
  </Section>;
}
