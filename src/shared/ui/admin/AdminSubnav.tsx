import { AdminSectionNav } from "./AdminSectionNav";

/** Navigation between existing CRM sections, with one scrollable row on mobile. */
export function AdminSubnav<T extends string>({ value, items, onSelect, ariaLabel, className }: {
  value: T;
  items: Array<{ id: T; label: string }>;
  onSelect: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return <AdminSectionNav value={value} items={items} onSelect={onSelect} ariaLabel={ariaLabel} className={className} />;
}
