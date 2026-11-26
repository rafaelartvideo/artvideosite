import { Plus, Trash2 } from "lucide-react";
import { AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";

export type ProductIdentifierKind = "barcode" | "manufacturer_code" | "internal_barcode";

export const PRODUCT_IDENTIFIER_OPTIONS: Array<{ value: ProductIdentifierKind; label: string }> = [
  { value: "barcode", label: "GTIN / Código de barras" },
  { value: "manufacturer_code", label: "Código do fabricante / MPN" },
  { value: "internal_barcode", label: "Código de barras interno" },
];

export function visibleProductIdentifierKinds(product: {
  barcode?: string | null;
  manufacturer_code?: string | null;
  internal_barcode?: string | null;
}): ProductIdentifierKind[] {
  const present = PRODUCT_IDENTIFIER_OPTIONS
    .map(option => option.value)
    .filter(kind => Boolean(product[kind]?.trim()));
  return present.length ? present : ["barcode"];
}

/** Interface unificada; os valores continuam em colunas distintas do produto.
 * Não valida formatos, checksum, quantidade de dígitos nem tipo de conteúdo. */
export function ProductIdentifiersEditor({
  kinds, values, onChange, onSelect, onSwitch, onAdd, onRemove, errors = {}, disabled = false,
}: {
  kinds: ProductIdentifierKind[];
  values: Record<ProductIdentifierKind, string>;
  onChange: (kind: ProductIdentifierKind, value: string) => void;
  onSelect?: (kind: ProductIdentifierKind) => void;
  onSwitch: (from: ProductIdentifierKind, to: ProductIdentifierKind) => void;
  onAdd: () => void;
  onRemove: (kind: ProductIdentifierKind) => void;
  errors?: Partial<Record<ProductIdentifierKind, string>>;
  disabled?: boolean;
}) {
  return <section className="min-w-0 space-y-2 sm:col-span-2" aria-label="Códigos do produto">
    <div className="min-w-0 divide-y divide-border">
      {kinds.map((kind, index) => <div key={kind} className="flex min-w-0 flex-wrap items-end gap-2 py-2.5 sm:flex-nowrap">
        <div className="w-full min-w-0 sm:w-[220px] sm:shrink-0">
          <FSelect
            label="Tipo de código"
            value={kind}
            disabled={disabled}
            onChange={(event: any) => onSwitch(kind, event.target.value as ProductIdentifierKind)}
            options={PRODUCT_IDENTIFIER_OPTIONS.filter(option =>
              option.value === kind || !kinds.includes(option.value)
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <FInput
            label={index === 0 ? "Código" : "Código adicional"}
            value={values[kind]}
            disabled={disabled}
            placeholder="Informe o código"
            error={errors[kind]}
            onFocus={() => onSelect?.(kind)}
            onChange={(event: any) => onChange(kind, event.target.value)}
          />
        </div>
        <AdminIconButton
          ariaLabel={"Remover " + PRODUCT_IDENTIFIER_OPTIONS.find(option => option.value === kind)?.label}
          title="Remover código"
          variant="danger"
          className="!h-[42px] !w-[42px] shrink-0"
          disabled={disabled}
          onClick={() => onRemove(kind)}
        >
          <Trash2 size={15}/>
        </AdminIconButton>
        {index === kinds.length - 1 && kinds.length < PRODUCT_IDENTIFIER_OPTIONS.length &&
          <AdminIconButton ariaLabel="Adicionar outro código" title="Adicionar outro código"
            className="!h-[42px] !w-[42px] shrink-0" disabled={disabled} onClick={onAdd}>
            <Plus size={17}/>
          </AdminIconButton>}
      </div>)}
    </div>
  </section>;
}
