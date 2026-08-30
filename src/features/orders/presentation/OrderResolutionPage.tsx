import type { Dispatch, SetStateAction } from "react";
import { Camera, CheckCircle, Upload } from "lucide-react";
import {
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import { FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { InfoRow } from "./OrderDetailsContent";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import {
  OrderImageThumb,
  type OrderImage,
} from "./OrderImages";

export function OrderResolutionPage({
  open,
  detail,
  solveDraft,
  setSolveDraft,
  inventoryItems,
  orderImages,
  solutionImages,
  onAddSolutionImages,
  onRemoveSolutionImage,
  saving,
  onClose,
  onSubmit,
  onViewImage,
}: {
  open: boolean;
  detail: any;
  solveDraft: any;
  setSolveDraft: Dispatch<SetStateAction<any>>;
  inventoryItems: any[];
  orderImages: OrderImage[];
  solutionImages: OrderImage[];
  onAddSolutionImages: (files: FileList | null, keyPrefix?: string) => void;
  onRemoveSolutionImage: (key: string) => void;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onViewImage: (image: OrderImage) => void;
}) {
  if (!open || !detail) return null;
  return (
<AdminPage open={true} onClose={onClose} breadcrumb="Ordens de Serviço" title="Resolver OS" subtitle="Diagnóstico, solução e produtos utilizados" maxW="max-w-2xl">
        <div className="p-5 space-y-5">
          <Section title="Informações da OS">
            <div className="grid sm:grid-cols-2 gap-3">
              <InfoRow label="Nº da OS" value={detail.os_number} />
              <InfoRow label="Serviço" value={(detail.service as any)?.title || (detail.general_service as any)?.name || "—"} />
              <InfoRow label="Equipamento" value={(detail.equipment_type as any)?.name || "—"} />
              <InfoRow label="Marca" value={(detail.equipment_brand as any)?.name || (detail.brand as any)?.name || "—"} />
              <InfoRow label="Modelo" value={(detail.equipment_model as any)?.name || detail.model || "—"} />
              <InfoRow label="Versão" value={detail.model || "—"} />
              <InfoRow label="Nº de série" value={detail.serial_number || "—"} />
              <InfoRow label="Lacre" value={detail.accessories || "—"} />
              <InfoRow label="Garantia" value={detail.equipment_condition || "—"} />
            </div>
          </Section>

          <Section title="Descrição do problema">
            <p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.customer_notes || "Nenhuma descrição do problema registrada."}</p>
          </Section>

          <Section title="Diagnóstico">
            <FTextarea label="Diagnóstico" value={solveDraft.diagnosis} onChange={(e: any) => setSolveDraft(current => ({ ...current, diagnosis: e.target.value }))} rows={5} />
          </Section>

          <Section title="Solução">
            <FTextarea label="Solução" value={solveDraft.solution} onChange={(e: any) => setSolveDraft(current => ({ ...current, solution: e.target.value }))} rows={5} />
          </Section>

          <Section title="Resultado do atendimento">
            <label className="flex items-start gap-2 text-sm font-bold text-[#0d1b2e]">
              <Checkbox checked={solveDraft.cannotSolve} onCheckedChange={checked => setSolveDraft(current => ({ ...current, cannotSolve: checked === true }))} />
              OS não pode ser solucionada
            </label>
            {solveDraft.cannotSolve && <div className="mt-3"><FTextarea label="Justificativa" value={solveDraft.cannotSolveReason} onChange={(e: any) => setSolveDraft(current => ({ ...current, cannotSolveReason: e.target.value }))} rows={4} hint="Informe por que esta OS não pode ser solucionada." /></div>}
          </Section>

          <Section title="Produtos utilizados">
            <div className="space-y-3">
              {solveDraft.usedItems.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhuma peça aprovada para esta OS.</p> : solveDraft.usedItems.map((item: any) => {
                const stockItem = inventoryItems.find(entry => entry.id === item.inventory_item_id);
                const available = Number(stockItem?.quantity ?? 0);
                const requested = Number(item.quantity || 0);
                const approved = Number(item.approved_quantity ?? requested);
                const prewithdrawn = Number(item.prewithdrawn_quantity ?? 0);
                const stockRequired = Math.max(0, requested - prewithdrawn);
                const invalid = requested <= 0 || requested > approved || stockRequired > available;
                return (
                  <div key={item.inventory_item_id} className="rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-[#0d1b2e]">{item.name}</p>
                        <p className="text-[11px] text-[#5a6a82]">{requested} {item.unit || stockItem?.unit || "un"} aprovadas · Disponível: {available} {item.unit || stockItem?.unit || "un"}</p>
                        {prewithdrawn > 0 && <p className="mt-1 text-[10px] font-bold text-violet-700">{prewithdrawn} {item.unit || stockItem?.unit || "un"} {prewithdrawn === 1 ? "já retirada" : "já retiradas"} para teste</p>}
                        {invalid && <p className="mt-1 text-[10px] font-bold text-red-600">Estoque insuficiente</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Imagens da OS">
            {orderImages.length > 0 ? <div className="flex flex-wrap gap-3">{orderImages.map(image => <OrderImageThumb key={image.key} image={image} onView={() => onViewImage(image)} />)}</div> : <p className="text-xs text-[#5a6a82]">Nenhuma imagem da OS cadastrada.</p>}
          </Section>

          <Section title="Imagens da solução">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs text-[#5a6a82]">{solutionImages.length}/5 imagens</p>
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" disabled={solutionImages.length >= 5} onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
                  input.multiple = true;
                  input.onchange = (event: any) => {
                    onAddSolutionImages(event.target.files as FileList | null, "solution");
                  };
                  input.click();
                }} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] border border-[#0057e7]/35 px-3 py-2 rounded-lg disabled:opacity-50"><Upload size={13} /> Adicionar imagens</button>
                <button type="button" disabled={solutionImages.length >= 5} onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.capture = "environment";
                  input.onchange = (event: any) => {
                    onAddSolutionImages(event.target.files as FileList | null, "solution-cam");
                  };
                  input.click();
                }} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] border border-[#0057e7]/35 px-3 py-2 rounded-lg disabled:opacity-50"><Camera size={13} /> Abrir câmera</button>
              </div>
            </div>
            {solutionImages.length > 0 ? <div className="flex flex-wrap gap-3">{solutionImages.map(image => <OrderImageThumb key={image.key} image={image} onRemove={() => onRemoveSolutionImage(image.key)} onView={() => onViewImage(image)} />)}</div> : <p className="text-xs text-[#5a6a82]">Nenhuma imagem adicionada para a solução.</p>}
          </Section>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>
          <BtnPrimary onClick={onSubmit} disabled={saving}><CheckCircle size={14} /> Concluir solução</BtnPrimary>
        </div>
      </AdminPage>
  );
}
