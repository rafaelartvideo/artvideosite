import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AdminFilterMultiSelect } from "@/shared/ui/admin/AdminFilterMultiSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/primitives/select";
import { Checkbox } from "@/shared/ui/primitives/checkbox";

export type EmployeeOption = { id: string; full_name: string };
export type MultiSelectOption = { value: string; label: string };
export type ServiceOrderProfile = { id: string; full_name: string | null };
export type ServiceOrderWithRelations = {
  assigned_profile?: ServiceOrderProfile | ServiceOrderProfile[] | null;
};

export function getResponsibleName(order: ServiceOrderWithRelations) {
  const profile = Array.isArray(order.assigned_profile) ? order.assigned_profile[0] : order.assigned_profile;
  return profile?.full_name?.trim() || "Responsável não informado";
}

export function EmployeeMultiSelect({ label, employees, selectedIds, onChange, disabled, placeholder, clearLabel }: {
  label: string; employees: EmployeeOption[]; selectedIds: string[]; onChange: (ids: string[]) => void; disabled?: boolean; placeholder: string; clearLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!containerRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, []);
  const filtered = employees.filter(employee => employee.full_name.toLowerCase().includes(search.toLowerCase()));
  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter(selectedId => selectedId !== id) : [...selectedIds, id]);
  return <div ref={containerRef} className="relative">
    <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">{label}</label>
    <button type="button" disabled={disabled} onClick={() => setOpen(value => !value)} className={cn(INPUT, "min-h-[42px] text-left", disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer")}>{selectedIds.length ? `${selectedIds.length} selecionado(s)` : placeholder}</button>
    {selectedIds.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{selectedIds.map(id => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#e8eef8] px-2 py-1 text-[11px] font-bold text-[#0057e7]">{employees.find(employee => employee.id === id)?.full_name || "Funcionário"}<button type="button" disabled={disabled} onClick={() => toggle(id)} aria-label={`Remover ${employees.find(employee => employee.id === id)?.full_name || "funcionário"}`}><X size={12} /></button></span>)}<button type="button" disabled={disabled} onClick={() => onChange([])} className="text-[11px] font-bold text-red-600 hover:text-red-700">{clearLabel}</button></div>}
    {open && !disabled && <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[#0d1b2e]/10 bg-white p-2 shadow-xl"><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome" className={cn(INPUT, "mb-2 py-2 text-xs")} />{filtered.length === 0 ? <p className="px-2 py-3 text-xs text-[#5a6a82]">Nenhum funcionário encontrado.</p> : filtered.map(employee => <label key={employee.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-[#f5f7fa]"><Checkbox checked={selectedIds.includes(employee.id)} onCheckedChange={() => toggle(employee.id)} />{employee.full_name}</label>)}</div>}
  </div>;
}

const PRIORITY_COLORS: Record<string, string> = {
  baixa: "bg-[#e8eef8] text-[#5a6a82]", normal: "bg-[#e8f5e9] text-[#2e7d32]", alta: "bg-[#fff3e0] text-[#e65100]", urgente: "bg-[#ffebee] text-[#c62828]",
};
const PRIORITY_LABELS: Record<string, string> = { baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" };
export const getPriorityLabel = (priority?: string | null) => priority ? PRIORITY_LABELS[priority] || priority : "";
export function PriorityBadge({ priority }: { priority?: string }) { const p = priority || "normal"; return <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap", PRIORITY_COLORS[p] || PRIORITY_COLORS.normal)}>{PRIORITY_LABELS[p] || p}</span>; }

export function OrderFilterMultiSelect({ label, options, selectedValues, onSelect, onRemove, placeholder, disabled = false, loading = false }: { label: string; options: MultiSelectOption[]; selectedValues: string[]; onSelect: (value: string) => void; onRemove: (value: string) => void; placeholder: string; disabled?: boolean; loading?: boolean }) {
  return <AdminFilterMultiSelect
    label={label}
    options={options}
    selectedValues={selectedValues}
    onToggle={(value) => selectedValues.includes(value) ? onRemove(value) : onSelect(value)}
    placeholder={placeholder}
    disabled={disabled}
    loading={loading}
  />;
}

export function OrderAddressSelect({ label, value, onChange, disabled, placeholder, options }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; placeholder: string; options: { value: string; label: string }[] }) {
  return <div>
    <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">{label}<span className="text-red-400">*</span></label>
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn(INPUT, "h-[42px] w-full rounded-lg px-3 py-2.5 text-sm")}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent position="popper" side="bottom" align="start" sideOffset={4} avoidCollisions={false} className="max-h-[min(18rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)]">
        {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}
