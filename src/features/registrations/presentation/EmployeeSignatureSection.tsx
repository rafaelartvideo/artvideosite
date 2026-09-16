import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature } from "lucide-react";
import { formatDateTime } from "@/shared/domain/formatters";
import { BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import {
  createEmployeeSignaturePreviewUrl,
  getActiveEmployeeSignature,
  saveEmployeeSignature,
} from "../infrastructure/employee-signatures.repository";
import {
  EmployeeSignaturePad,
  type EmployeeSignaturePadHandle,
} from "./EmployeeSignaturePad";

export function EmployeeSignatureSection({
  organizationId,
  entityId,
  canManage,
}: {
  organizationId: string | null;
  entityId?: string | null;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const padRef = useRef<EmployeeSignaturePadHandle | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const queryKey = ["employee-signature", organizationId || "", entityId || ""] as const;

  const signatureQuery = useQuery({
    queryKey,
    queryFn: () => getActiveEmployeeSignature(organizationId!, entityId!),
    enabled: Boolean(canManage && organizationId && entityId),
  });
  const signature = signatureQuery.data || null;

  useEffect(() => {
    let cancelled = false;
    if (!signature?.storage_path) {
      setPreviewUrl(null);
      return;
    }
    void createEmployeeSignaturePreviewUrl(signature.storage_path)
      .then(url => { if (!cancelled) setPreviewUrl(url); })
      .catch(() => { if (!cancelled) setPreviewUrl(null); });
    return () => { cancelled = true; };
  }, [signature?.storage_path]);

  if (!canManage) return null;

  const save = async () => {
    if (!organizationId || !entityId || saving) return;
    setError("");
    const blob = await padRef.current?.toPngBlob();
    if (!blob) {
      setError("Faça sua assinatura antes de salvar.");
      return;
    }

    setSaving(true);
    try {
      const saved = await saveEmployeeSignature({ organizationId, entityId, blob });
      queryClient.setQueryData(queryKey, saved);
      padRef.current?.clear();
      setReplacing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const editor = <div className="space-y-3">
    <EmployeeSignaturePad ref={padRef} disabled={saving} onInkChange={() => setError("")} />
    {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}
    <div className="flex flex-wrap justify-end gap-2">
      {signature && <BtnSecondary onClick={() => { padRef.current?.clear(); setError(""); setReplacing(false); }} disabled={saving}>Cancelar</BtnSecondary>}
      <BtnPrimary onClick={() => void save()} loading={saving} loadingText="Salvando...">{signature ? "Salvar nova assinatura" : "Salvar assinatura"}</BtnPrimary>
    </div>
  </div>;

  return <Section title="Assinatura">
    {!entityId ? <div className="flex items-start gap-3 rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-4">
      <FileSignature size={19} className="mt-0.5 shrink-0 text-[#0057e7]" />
      <div><p className="text-sm font-bold text-[#0d1b2e]">Assinatura do funcionário</p><p className="mt-1 text-xs leading-5 text-[#5a6a82]">Salve o cadastro antes de cadastrar a assinatura.</p></div>
    </div> : signatureQuery.isPending ? <div className="text-sm text-[#5a6a82]">Carregando assinatura...</div> : signatureQuery.error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Não foi possível carregar a assinatura: {signatureQuery.error instanceof Error ? signatureQuery.error.message : String(signatureQuery.error)}</div> : signature && !replacing ? <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex min-h-36 items-center justify-center overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white p-4">
          {previewUrl ? <img src={previewUrl} alt="Assinatura cadastrada do funcionário" className="max-h-28 max-w-full object-contain" /> : <span className="text-xs text-[#5a6a82]">Assinatura cadastrada.</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#5a6a82]"><span><b className="text-[#0d1b2e]">Versão {signature.version}</b></span><span>Cadastrada em {formatDateTime(signature.created_at, "—")}</span></div>
      </div>
      <BtnSecondary onClick={() => { setError(""); setReplacing(true); }}>Substituir assinatura</BtnSecondary>
    </div> : editor}
  </Section>;
}
