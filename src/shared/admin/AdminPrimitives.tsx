import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useMediaUrl } from "@/lib/hooks";
import { Package, Tag, Upload } from "lucide-react";

export { cn, slugify, getWhatsAppUrl, formatPhone, formatCpf, isValidCpf, formatCnpj, formatFoundationDate, foundationDateToIso, foundationDateFromIso as foundationDateFromCustomer, formatDateOnly, todayDateOnly } from "@/shared/domain/formatters";
export { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
export { fetchCnpjData } from "@/features/customers/infrastructure/cnpj.gateway";
export { emptyCustomerForm, customerFormFromCustomer, customerPayload, customerUpdatePayload, validateCustomerForm, applyCnpjData } from "@/features/customers/domain/customer-form";
export type { CustomerType, CustomerForm } from "@/features/customers/domain/customer-form";
export { INPUT, FInput, CustomerTypeToggle, FTextarea, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
export { isHexColor, StatusBadge, LoadingState, EmptyState, Toast, ConfirmDialog } from "@/shared/ui/admin/AdminFeedback";
export { PaginationBar } from "@/shared/ui/admin/AdminPagination";
export { AdminPage, Section, PageHeader, BtnPrimary, BtnSecondary, InternalBackButton } from "@/shared/ui/admin/AdminLayout";

export function initialOrderStatus(statuses: any[]) {
  const ordered = [...statuses].sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
  return ordered.find(status => /abert|novo|recebid|pendente/i.test(status.name || "")) || ordered[0] || null;
}

export async function getAuthenticatedSession() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.user?.id) throw new Error("Não existe sessão autenticada. Faça login novamente para enviar imagens.");
  console.log("[MEDIA] auth user:", session.user.id);
  console.log("[MEDIA] access token exists:", !!session.access_token);
  return session;
}

export async function createMediaRecord({
  bucket,
  path,
  file,
}: {
  bucket: "service-images" | "product-images" | "brand-images" | "avatars" | "public-assets";
  path: string;
  file: File;
}) {
  const session = await getAuthenticatedSession();
  const { data: media, error } = await supabase
    .from("media")
    .insert({
      bucket_id: bucket,
      storage_path: path,
      file_name: file.name,
      file_size: file.size || null,
      mime_type: file.type || null,
      alt_text: file.name,
      uploaded_by: session.user.id,
    })
    .select("id")
    .single();

  if (error || !media?.id) {
    console.error("[MEDIA] media insert error:", error);
    throw new Error(error?.message || "Não foi possível registrar a imagem.");
  }

  console.log("[MEDIA] record created:", { mediaId: media.id, uploadedBy: session.user.id });
  return media.id as string;
}

export function supabaseErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as { message?: string; details?: string; hint?: string; code?: string };
    return [value.message, value.details, value.hint, value.code ? `Código: ${value.code}` : ""].filter(Boolean).join(" | ");
  }
  return error instanceof Error ? error.message : String(error);
}

export function ImageUpload({ bucket, currentMediaId, onUpload, label = "Imagem", canUpload = true }: {
  bucket: "service-images" | "product-images" | "brand-images" | "avatars" | "public-assets"; currentMediaId?: string | null; onUpload: (mediaId: string) => void; label?: string; canUpload?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const { url: currentUrl } = useMediaUrl(currentMediaId);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

const handleFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      e.target.files?.[0];

    if (!file) return;

    const objectUrl =
      URL.createObjectURL(file);

    setPreviewUrl(objectUrl);
    setUploading(true);

    try {
      const ext =
        file.name
          .split(".")
          .pop()
          ?.toLowerCase();

      const path =
        `${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 6)}.${ext}`;

      /* ================================================
        Upload para Storage
        ================================================ */

      const {
        error: uploadError,
      } =
        await supabase.storage
          .from(bucket)
          .upload(
            path,
            file,
            {
              upsert: true,
            }
          );

      if (uploadError) {
        throw uploadError;
      }

      /* ================================================
        Registro em public.media através da Edge Function
        ================================================ */

      try {
        const mediaId =
          await createMediaRecord({
            bucket,
            path,
            file,
          });

        onUpload(mediaId);
        setPreviewUrl(null);
      } catch (mediaError) {
        /*
        * Se Storage funcionou mas public.media falhou,
        * remove o arquivo para evitar arquivo órfão.
        */

        console.error(
          "[MEDIA] media record error:",
          mediaError
        );

        const {
          error: removeError,
        } =
          await supabase.storage
            .from(bucket)
            .remove([
              path,
            ]);

        if (removeError) {
          console.warn(
            "[MEDIA] orphan cleanup failed:",
            removeError
          );
        }

        throw mediaError;
      }
    } catch (error) {
      console.error(
        "[SUPABASE] Image upload error:",
        error
      );

      alert(
        supabaseErrorMessage(
          error
        )
      );
    } finally {
      setUploading(false);

      /*
      * Permite selecionar novamente o mesmo arquivo.
      */
      e.currentTarget.value = "";
    }
  };

  const displayUrl = previewUrl || currentUrl;

  return (
    <div>
      <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-2">{label}</label>
      {displayUrl && (
        <div className="mb-3 w-36 h-28 rounded-xl overflow-hidden border border-[#0d1b2e]/15 bg-[#f5f7fa]">
          <img src={displayUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      {canUpload && <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
        className="flex items-center gap-2 text-xs font-bold text-[#0057e7] border border-[#0057e7]/40 hover:border-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
        <Upload size={13} /> {uploading ? "Enviando..." : displayUrl ? "Trocar imagem" : "Selecionar imagem"}
      </button>}
    </div>
  );
}

export function ProductAdminThumb({ mediaId, name }: { mediaId: string | null; name: string }) {
  const { url } = useMediaUrl(mediaId);
  return url ? <img src={url} alt={name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-[#0d1b2e]/10" /> : <div className="w-10 h-10 bg-[#f5f7fa] rounded-lg flex-shrink-0 border border-[#0d1b2e]/10 flex items-center justify-center"><Package size={16} className="text-[#5a6a82]" /></div>;
}

export function BrandAdminLogo({ mediaId, name }: { mediaId: string | null; name: string }) {
  const { url } = useMediaUrl(mediaId);
  return url ? <img src={url} alt={name} className="h-12 w-auto object-contain max-w-full" /> : <div className="w-12 h-12 bg-[#f5f7fa] rounded-lg flex items-center justify-center"><Tag size={20} className="text-[#5a6a82]" /></div>;
}
