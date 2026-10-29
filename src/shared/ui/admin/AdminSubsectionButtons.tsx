import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AdminSectionNav } from "./AdminSectionNav";

/** Navegação de subseções no mesmo padrão de todos os módulos do CRM. */
export function AdminSubsectionButtons<T extends string>({ value, items, onChange, ariaLabel, trailing, className }: {
  value: T;
  items: ReadonlyArray<{ id: T; label: string; Icon: LucideIcon }>;
  onChange: (id: T) => void;
  ariaLabel: string;
  trailing?: ReactNode;
  className?: string;
}) {
  return <AdminSectionNav value={value} items={items} onSelect={onChange} ariaLabel={ariaLabel} trailing={trailing} className={className} />;
}
