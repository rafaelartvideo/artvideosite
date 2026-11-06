import { Plus, Trash2 } from "lucide-react";
import type { CustomField } from "../domain/order-rules";

const input = "w-full min-w-0 rounded-lg border border-border bg-card px-2 py-2 text-sm text-foreground";
const iconButton = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card transition-colors disabled:opacity-50";

export function OrderCustomFieldsEditor({
  fields, onChange, disabled,
}: {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
  disabled: boolean;
}) {
  const change = (index: number, patch: Partial<CustomField>) =>
    onChange(fields.map((field, i) => i === index ? { ...field, ...patch } : field));

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-semibold text-foreground">Campos extras</h4>
      <button type="button" disabled={disabled || fields.length >= 30}
        aria-label="Adicionar campo extra" title="Adicionar campo"
        className={iconButton + " text-primary hover:bg-primary/10"}
        onClick={() => onChange([...fields, {
          key: "campo_" + crypto.randomUUID().slice(0, 8),
          label: "Novo campo", type: "text", mode: "optional", stage: "create",
        }])}
      ><Plus size={17} /></button>
    </div>
    <p className="text-xs text-muted-foreground">Até 30 campos por regra. Arquivos podem ser exigidos ao iniciar ou concluir a OS.</p>
    <div className="divide-y divide-border border-y border-border">
      {fields.map((field, i) => <div key={field.key} className="space-y-3 py-3">
        <div className="grid min-w-0 gap-3 md:grid-cols-3">
          <label className="min-w-0 space-y-1">
            <span className="block text-[11px] font-semibold text-muted-foreground">Nome do campo</span>
            <span className="flex min-w-0 items-center gap-2">
              <input className={input} disabled={disabled} maxLength={80} aria-label="Nome do campo" value={field.label}
                onChange={event => change(i, { label: event.target.value })} />
              <button type="button" disabled={disabled}
                aria-label={`Excluir campo ${field.label}`} title="Excluir campo"
                className={iconButton + " text-red-600 hover:border-red-500/30 hover:bg-red-500/10"}
                onClick={() => onChange(fields.filter((_, index) => index !== i))}
              ><Trash2 size={16} /></button>
            </span>
          </label>
          <label className="min-w-0 space-y-1">
            <span className="block text-[11px] font-semibold text-muted-foreground">Tipo</span>
            <select className={input} disabled={disabled} value={field.type}
              onChange={event => change(i, {
                type: event.target.value as CustomField["type"],
                stage: event.target.value === "file" && field.stage === "create" ? "start" : field.stage,
              })}>
              {([["text", "Texto"], ["number", "Número"], ["date", "Data"], ["select", "Seleção"], ["checkbox", "Checkbox"], ["file", "Arquivo"]] as const)
                .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-1">
            <span className="block text-[11px] font-semibold text-muted-foreground">Exigência</span>
            <select className={input} disabled={disabled} value={field.mode}
              onChange={event => change(i, { mode: event.target.value as CustomField["mode"] })}>
              <option value="required">Obrigatório</option>
              <option value="optional">Opcional</option>
              <option value="hidden">Oculto</option>
            </select>
          </label>
        </div>
        <div className="grid min-w-0 gap-3 md:grid-cols-3">
          <label className="min-w-0 space-y-1">
            <span className="block text-[11px] font-semibold text-muted-foreground">Quando exigir</span>
            <select className={input} disabled={disabled} value={field.stage}
              onChange={event => change(i, { stage: event.target.value as CustomField["stage"] })}>
              {field.type !== "file" && <option value="create">Criar OS</option>}
              <option value="start">Iniciar serviço</option>
              <option value="finish">Concluir OS</option>
            </select>
          </label>
          {field.type === "select" && <label className="min-w-0 space-y-1 md:col-span-2">
            <span className="block text-[11px] font-semibold text-muted-foreground">Opções (separadas por vírgula)</span>
            <input className={input} disabled={disabled} placeholder="Opção 1, Opção 2"
              value={(field.options || []).join(", ")}
              onChange={event => change(i, {
                options: event.target.value.split(",").map(option => option.trim()).filter(Boolean).slice(0, 30),
              })} />
          </label>}
        </div>
      </div>)}
    </div>
  </section>;
}
