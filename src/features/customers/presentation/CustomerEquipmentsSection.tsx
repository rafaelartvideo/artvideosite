import { Cpu } from "lucide-react";
import { Section } from "@/shared/ui/admin/AdminLayout";
import { formatDateOnly } from "@/shared/domain/formatters";

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
        <div className="space-y-2">
          {equipments.map(equipment => {
            const technicalValues = Array.isArray(equipment.technical_values)
              ? equipment.technical_values
              : [];
            const typeName = equipment.equipment_type_name || "Equipamento";
            const brandName = equipment.equipment_brand_name || "—";
            const modelName = equipment.equipment_model_name || "—";

            return (
              <div key={equipment.id} className="w-full min-w-0 rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] p-3 text-left">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef5ff] text-[#0057e7]">
                      <Cpu size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-[#0d1b2e]">{typeName}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-[#5a6a82]">{brandName} · {modelName}</p>
                    </div>
                  </div>
                  <span className="max-w-[45%] shrink-0 truncate rounded-md bg-[#eef5ff] px-2 py-1 font-mono text-[10px] font-black text-[#0057e7]" title={equipment.serial_number || "Sem número de série"}>
                    {equipment.serial_number ? `S/N ${equipment.serial_number}` : "Sem série"}
                  </span>
                </div>

                {technicalValues.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#0d1b2e]/8 pt-3">
                    {technicalValues.map((value: any, index: number) => (
                      <div key={value?.technical_field_id || `${technicalValueLabel(value)}-${index}`} className="min-w-0">
                        <span className="text-[9px] font-bold uppercase tracking-wide text-[#8a96a8]">{technicalValueLabel(value)}: </span>
                        <span className="break-words text-[11px] font-semibold text-[#34445b]">{technicalValueText(value)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {equipment.updated_at && (
                  <p className="mt-2 text-[10px] text-[#8a96a8]">Atualizado em {formatDateOnly(equipment.updated_at, "—")}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
