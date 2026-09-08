import { Cpu } from "lucide-react";
import { Section } from "@/shared/ui/admin/AdminLayout";
import { formatDateOnly } from "@/shared/domain/formatters";

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function technicalValueLabel(value: any) {
  return String(value?.label_snapshot || value?.field_key_snapshot || "Campo técnico");
}

function technicalValueText(value: any) {
  if (value?.field_type_snapshot === "number") {
    return value?.value_number == null ? "—" : String(value.value_number);
  }
  return String(value?.value_text || "—");
}

export function CustomerEquipmentsSection({ equipments }: { equipments: any[] }) {
  return (
    <Section title={`Equipamentos (${equipments.length})`}>
      {equipments.length === 0 ? (
        <p className="text-xs text-[#5a6a82]">Nenhum equipamento vinculado a este cliente.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {equipments.map(equipment => {
            const type = relationOne<any>(equipment.equipment_type);
            const brand = relationOne<any>(equipment.equipment_brand);
            const model = relationOne<any>(equipment.equipment_model);
            const technicalValues = Array.isArray(equipment.technical_values)
              ? equipment.technical_values
              : [];

            return (
              <div key={equipment.id} className="min-w-0 rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-4">
                <div className="mb-3 flex min-w-0 items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef5ff] text-[#0057e7]">
                    <Cpu size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-[#0d1b2e]">{type?.name || "Equipamento"}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] font-bold text-[#0057e7]">
                      {equipment.serial_number ? `S/N ${equipment.serial_number}` : "Sem número de série"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Equipamento</p><p className="font-medium text-[#0d1b2e]">{type?.name || "—"}</p></div>
                  <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Marca</p><p className="font-medium text-[#0d1b2e]">{brand?.name || "—"}</p></div>
                  <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Modelo</p><p className="font-medium text-[#0d1b2e]">{model?.name || "—"}</p></div>
                  <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Número de série</p><p className="break-all font-mono font-medium text-[#0d1b2e]">{equipment.serial_number || "—"}</p></div>

                  {technicalValues.map((value: any, index: number) => (
                    <div key={value?.technical_field_id || `${technicalValueLabel(value)}-${index}`}>
                      <p className="text-[10px] font-bold uppercase text-[#5a6a82]">{technicalValueLabel(value)}</p>
                      <p className="break-words font-medium text-[#0d1b2e]">{technicalValueText(value)}</p>
                    </div>
                  ))}
                </div>

                {equipment.updated_at && (
                  <p className="mt-3 border-t border-[#0d1b2e]/8 pt-2 text-[10px] text-[#7c899c]">
                    Atualizado em {formatDateOnly(equipment.updated_at, "—")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
