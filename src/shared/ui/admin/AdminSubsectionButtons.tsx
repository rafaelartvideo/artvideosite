import type { LucideIcon } from "lucide-react";
import { AdminSubsectionTabs } from "@/shared/ui/admin/AdminSubsectionTabs";

/** Mantém os eventos originais e usa o padrão único de subseções. */
export function AdminSubsectionButtons<T extends string>({
  value, items, onChange, ariaLabel,
}: {
  value: T;
  items: ReadonlyArray<{ id: T; label: string; Icon: LucideIcon }>;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return <AdminSubsectionTabs value={value} items={items} onChange={onChange} ariaLabel={ariaLabel} />;
}
