import { useState } from "react";
import { ChevronDown, ImageOff, Pin } from "lucide-react";
import { AdminIconButton, AdminSectionEmpty, Section } from "@/shared/ui/admin/AdminLayout";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import { getOrderStatusBadgeClass, getOrderStatusHex } from "@/features/orders/domain/order-status-palette";
import { formatDateOnly } from "@/shared/domain/formatters";

function technicalValueLabel(value: any) {
  return String(value?.label_snapshot || value?.field_key_snapshot || "Campo técnico");
}

function technicalValueText(value: any) {
  return String(value?.value_text ?? (value?.value_number == null ? "—" : value.value_number));
}

export type EquipmentLinkedOrder = {
  id: string;
  os_number: string | number;
  created_at: string;
  order_status: { name?: string; color?: string } | null;
  service_type?: { title?: string } | null;
};

type EquipmentCardsProps = {
  equipments: any[];
  embedded?: boolean;
  photoUrls?: Record<string, string>;
  pinnedIds?: ReadonlySet<string>;
  onTogglePin?: (id: string) => void;
  linkedOrders?: Record<string, EquipmentLinkedOrder[]>;
  onOpenLinkedOrder?: (orderId: string) => void;
  onViewLabelPhoto?: (equipmentId: string) => void;
};

export function CustomerEquipmentsSection({
  equipments, embedded = false, photoUrls = {}, pinnedIds, onTogglePin,
  linkedOrders = {}, onOpenLinkedOrder, onViewLabelPhoto,
}: EquipmentCardsProps) {
  const [chooserEquipmentId, setChooserEquipmentId] = useState<string | null>(null);
  const orderedEquipments = [...equipments].sort((a, b) =>
    Number(Boolean(pinnedIds?.has(b.id))) - Number(Boolean(pinnedIds?.has(a.id))));
  const content = equipments.length === 0
    ? <AdminSectionEmpty>Nenhum equipamento vinculado a este cliente.</AdminSectionEmpty>
    : <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
        {orderedEquipments.map(equipment => {
          const technicalValues = Array.isArray(equipment.technical_values) ? equipment.technical_values : [];
          const title = equipment.equipment_type_name || "Equipamento";
          const model = [equipment.equipment_brand_name, equipment.equipment_model_name].filter(Boolean).join(" · ") || "Modelo não informado";
          const labelPhoto = photoUrls[equipment.id];
          const orders = linkedOrders[equipment.id] || [];
          const canOpen = Boolean(onOpenLinkedOrder && orders.length);
          const pinned = Boolean(pinnedIds?.has(equipment.id));
          const openEquipment = () => {
            if (!canOpen) return;
            if (orders.length === 1) onOpenLinkedOrder?.(orders[0].id);
            else setChooserEquipmentId(equipment.id);
          };
          return <article key={equipment.id} aria-label={title}
            role={canOpen ? "button" : undefined} tabIndex={canOpen ? 0 : undefined}
            onClick={canOpen ? openEquipment : undefined}
            onKeyDown={canOpen ? event => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openEquipment();
              }
            } : undefined}
            className={"group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40 focus-within:border-primary/50 " +
              (canOpen ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" : "")}>
            <header className="flex min-h-11 items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Equipamento</span>
              <div className="flex shrink-0 items-center gap-1" onClick={event => event.stopPropagation()}>
                {canOpen && orders.length > 1 && <DropdownMenu
                  open={chooserEquipmentId === equipment.id}
                  onOpenChange={open => setChooserEquipmentId(open ? equipment.id : null)}>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={"Selecionar OS de " + title}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2 text-[11px] font-semibold text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/40">
                      {orders.length} OS <ChevronDown size={13}/>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[270] w-[min(90vw,310px)] border-border bg-popover p-1 text-popover-foreground">
                    {orders.map(order => <DropdownMenuItem key={order.id} onSelect={() => onOpenLinkedOrder?.(order.id)}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2">
                      <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full"
                        style={{backgroundColor:getOrderStatusHex(order.order_status?.name,order.order_status?.color)}}/>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-foreground">OS {order.os_number}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">{formatDateOnly(order.created_at, "—")} · {order.service_type?.title || "Atendimento"}</span>
                      </span>
                      <span className={"shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold " + getOrderStatusBadgeClass(order.order_status?.name)}>
                        {order.order_status?.name || "—"}
                      </span>
                    </DropdownMenuItem>)}
                  </DropdownMenuContent>
                </DropdownMenu>}
                {onTogglePin && <AdminIconButton variant={pinned ? "tertiary" : "ghost"}
                  ariaLabel={(pinned ? "Desafixar " : "Fixar ") + title}
                  title={pinned ? "Desafixar equipamento" : "Fixar equipamento no início"}
                  aria-pressed={pinned} onClick={() => onTogglePin(equipment.id)}>
                  <Pin size={15} fill={pinned ? "currentColor" : "none"}/>
                </AdminIconButton>}
              </div>
            </header>
            <div className="flex min-w-0 flex-1 flex-col gap-3 p-3.5 sm:p-4">
              <div className="flex min-w-0 items-start gap-3">
                {labelPhoto && onViewLabelPhoto ? <button type="button"
                  aria-label={"Visualizar foto da etiqueta de " + title}
                  title="Visualizar foto da etiqueta"
                  onClick={event => {event.stopPropagation(); onViewLabelPhoto(equipment.id);}}
                  className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-primary/50">
                  <img src={labelPhoto} loading="lazy" alt={"Foto da etiqueta de " + title} className="h-full w-full object-cover"/>
                </button> : <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
                  <span className="flex flex-col items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                    <ImageOff size={20} aria-hidden="true"/> Sem foto
                  </span>
                </div>}
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-black text-foreground">{title}</p>
                  <p className="mt-1 break-words text-xs font-medium text-muted-foreground">{model}</p>
                  <span className="mt-2 inline-block max-w-full break-all rounded-md border border-border bg-primary/5 px-2 py-1 font-mono text-[10px] font-bold text-primary">
                    {equipment.serial_number ? "S/N " + equipment.serial_number : "Sem número de série"}
                  </span>
                </div>
              </div>
              {technicalValues.length > 0 && <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 border-t border-border/70 pt-3">
                {technicalValues.map((value: any, index: number) => <div key={value?.technical_field_id || technicalValueLabel(value) + "-" + index} className="min-w-0">
                  <span className="block break-words text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{technicalValueLabel(value)}</span>
                  <span className="block break-words text-xs font-semibold text-foreground">{technicalValueText(value)}</span>
                </div>)}
              </div>}
              {equipment.updated_at && <p className="mt-auto border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
                Atualizado em {formatDateOnly(equipment.updated_at, "—")}
              </p>}
            </div>
          </article>;
        })}
      </div>;
  return embedded ? content : <Section title={"Equipamentos (" + equipments.length + ")"}>{content}</Section>;
}
