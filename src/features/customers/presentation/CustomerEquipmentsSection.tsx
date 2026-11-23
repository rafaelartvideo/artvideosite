import { ImageOff, ExternalLink, Pin } from "lucide-react";
import { AdminIconButton, AdminSectionEmpty, Section } from "@/shared/ui/admin/AdminLayout";
import { formatDateOnly } from "@/shared/domain/formatters";

function technicalValueLabel(value: any) {
  return String(value?.label_snapshot || value?.field_key_snapshot || "Campo técnico");
}

function technicalValueText(value: any) {
  return String(value?.value_text ?? (value?.value_number == null ? "—" : value.value_number));
}

type EquipmentCardsProps = {
  equipments: any[];
  embedded?: boolean;
  photoUrls?: Record<string, string>;
  pinnedIds?: ReadonlySet<string>;
  onTogglePin?: (id: string) => void;
  linkedOrderIds?: Record<string, string>;
  onOpenLinkedOrder?: (orderId: string) => void;
};

export function CustomerEquipmentsSection({
  equipments, embedded = false, photoUrls = {}, pinnedIds, onTogglePin, linkedOrderIds = {}, onOpenLinkedOrder,
}: EquipmentCardsProps) {
  const orderedEquipments = [...equipments].sort((a,b) =>
    Number(Boolean(pinnedIds?.has(b.id))) - Number(Boolean(pinnedIds?.has(a.id))));
  const content = equipments.length === 0
    ? <AdminSectionEmpty>Nenhum equipamento vinculado a este cliente.</AdminSectionEmpty>
    : <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
        {orderedEquipments.map(equipment => {
          const technicalValues = Array.isArray(equipment.technical_values) ? equipment.technical_values : [];
          const title = equipment.equipment_type_name || "Equipamento";
          const model = [equipment.equipment_brand_name, equipment.equipment_model_name].filter(Boolean).join(" · ") || "Modelo não informado";
          const labelPhoto = photoUrls[equipment.id];
          const linkedOrderId = linkedOrderIds[equipment.id];
          const pinned = Boolean(pinnedIds?.has(equipment.id));
          return <article key={equipment.id} aria-label={title}
            className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40 focus-within:border-primary/50">
            <header className="flex min-h-11 items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Equipamento</span>
              <div className="flex items-center gap-1">
                {onTogglePin && <AdminIconButton variant={pinned ? "tertiary" : "ghost"}
                  ariaLabel={(pinned ? "Desafixar " : "Fixar ") + title}
                  title={pinned ? "Desafixar equipamento" : "Fixar equipamento no início"}
                  aria-pressed={pinned} onClick={() => onTogglePin(equipment.id)}>
                  <Pin size={15} fill={pinned ? "currentColor" : "none"}/>
                </AdminIconButton>}
                {linkedOrderId && onOpenLinkedOrder && <AdminIconButton
                  ariaLabel={"Abrir OS vinculada ao equipamento " + title}
                  title="Abrir OS vinculada" onClick={() => onOpenLinkedOrder(linkedOrderId)}>
                  <ExternalLink size={15}/>
                </AdminIconButton>}
              </div>
            </header>
            <div className="flex min-w-0 flex-1 flex-col gap-3 p-3.5 sm:p-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
                  {labelPhoto
                    ? <img src={labelPhoto} loading="lazy" alt={"Foto da etiqueta de " + title} className="h-full w-full object-cover"/>
                    : <span className="flex flex-col items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                        <ImageOff size={20} aria-hidden="true"/> Sem foto
                      </span>}
                </div>
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
