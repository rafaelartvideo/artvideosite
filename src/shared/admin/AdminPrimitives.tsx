import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useMediaUrl } from "@/lib/hooks";
import { AdminBackContext, AdminPageContext } from "@/features/admin-shell/application/AdminNavigationContext";
import { cn } from "@/shared/domain/formatters";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import {
  Package, Tag, X, Upload,
  ArrowLeft,
} from "lucide-react";

export { cn, slugify, getWhatsAppUrl, formatPhone, formatCpf, isValidCpf, formatCnpj, formatFoundationDate, foundationDateToIso, foundationDateFromIso as foundationDateFromCustomer, formatDateOnly, todayDateOnly } from "@/shared/domain/formatters";
export { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
export { fetchCnpjData } from "@/features/customers/infrastructure/cnpj.gateway";
export { emptyCustomerForm, customerFormFromCustomer, customerPayload, customerUpdatePayload, validateCustomerForm, applyCnpjData } from "@/features/customers/domain/customer-form";
export type { CustomerType, CustomerForm } from "@/features/customers/domain/customer-form";
export { INPUT, FInput, CustomerTypeToggle, FTextarea, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
export { isHexColor, StatusBadge, LoadingState, EmptyState, Toast, ConfirmDialog } from "@/shared/ui/admin/AdminFeedback";

export function initialOrderStatus(statuses: any[]) {
  const ordered = [...statuses].sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
  return ordered.find(status => /abert|novo|recebid|pendente/i.test(status.name || "")) || ordered[0] || null;
}

export function PaginationBar({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-[#0d1b2e]/8 bg-[#f8fafc] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-xs text-[#5a6a82]">
        <span>Linhas:</span>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className={cn(INPUT, "w-[82px] py-2 text-xs")}
        >
          {[5, 10, 20, 30, 50, 100].map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#0d1b2e]/15 bg-white text-[#5a6a82] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#f5f7fa]" aria-label="Primeira página">
          «
        </button>
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#0d1b2e]/15 bg-white text-[#5a6a82] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#f5f7fa]" aria-label="Página anterior">
          ‹
        </button>
        <span className="min-w-[92px] text-center text-xs font-bold text-[#0d1b2e]">{page} de {totalPages}</span>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#0d1b2e]/15 bg-white text-[#5a6a82] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#f5f7fa]" aria-label="Próxima página">
          ›
        </button>
        <button type="button" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#0d1b2e]/15 bg-white text-[#5a6a82] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#f5f7fa]" aria-label="Última página">
          »
        </button>
      </div>
    </div>
  );
}

export function AdminPage({ open, onClose, title, subtitle, breadcrumb, children, fullPage = false }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; breadcrumb: string; children: React.ReactNode; maxW?: string; fullPage?: boolean;
}) {
  const navigation = React.useContext(AdminPageContext);
  const setPage = navigation?.setPage;

  useEffect(() => {
    if (!open) return;
    setPage?.({ breadcrumb, title, subtitle, onBack: onClose });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      setPage?.(null);
    };
  }, [open, breadcrumb, title, subtitle, setPage]);

  if (!open) return null;
  return (
    <div className="absolute inset-0 z-[35] bg-[#f8fafc]">
      {!fullPage && <button type="button" onClick={onClose} aria-label="Fechar" className="absolute top-4 right-4 z-10 p-2 text-[#5a6a82] bg-white border border-[#0d1b2e]/10 rounded-lg shadow-sm hover:text-[#0057e7] hover:bg-[#f5f7fa]"><X size={16} /></button>}
      <div className="max-w-6xl mx-auto w-full p-4 sm:p-8">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#0d1b2e]/8 overflow-hidden">
      <div className="px-5 py-3 border-b border-[#0d1b2e]/8 bg-[#f8fafc]">
        <h3 className="text-[10px] font-black text-[#0d1b2e] uppercase tracking-widest">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
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

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  const onBack = React.useContext(AdminBackContext);
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="min-w-0">
        
        {subtitle && null}
      </div>
      {(actions || onBack) && <div className="flex items-center gap-2 flex-shrink-0">{onBack && <InternalBackButton onBack={onBack} inHeader />}{actions}</div>}
    </div>
  );
}

export function BtnPrimary({ children, onClick, disabled, type = "button", className = "" }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; className?: string;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={cn("inline-flex items-center gap-2 whitespace-nowrap bg-[#0057e7] text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[#0046c0] transition-colors disabled:opacity-50 cursor-pointer", className)}>
      {children}
    </button>
  );
}

export function BtnSecondary({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("inline-flex items-center gap-2 whitespace-nowrap border border-[#0d1b2e]/15 text-[#0d1b2e] px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[#f5f7fa] transition-colors cursor-pointer", className)}>
      {children}
    </button>
  );
}


export function InternalBackButton({ onBack, inHeader = false }: { onBack: () => void; inHeader?: boolean }) {
  const contextualBack = React.useContext(AdminBackContext);
  if (!inHeader && contextualBack === onBack) return null;
  return <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5a6a82] hover:text-[#0057e7] transition-colors"><ArrowLeft size={14} /> Voltar</button>;
}
