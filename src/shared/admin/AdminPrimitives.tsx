export { cn, slugify, getWhatsAppUrl, formatPhone, formatCpf, isValidCpf, formatCnpj, formatFoundationDate, foundationDateToIso, foundationDateFromIso as foundationDateFromCustomer, formatDateOnly, todayDateOnly } from "@/shared/domain/formatters";
export { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
export { getAuthenticatedSession, createMediaRecord, supabaseErrorMessage } from "@/shared/infrastructure/media.repository";
export { fetchCnpjData } from "@/features/customers/infrastructure/cnpj.gateway";
export { emptyCustomerForm, customerFormFromCustomer, customerPayload, customerUpdatePayload, validateCustomerForm, applyCnpjData } from "@/features/customers/domain/customer-form";
export type { CustomerType, CustomerForm } from "@/features/customers/domain/customer-form";
export { INPUT, FInput, CustomerTypeToggle, FTextarea, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
export { isHexColor, StatusBadge, LoadingState, EmptyState, Toast, ConfirmDialog } from "@/shared/ui/admin/AdminFeedback";
export { PaginationBar } from "@/shared/ui/admin/AdminPagination";
export { AdminPage, Section, PageHeader, BtnPrimary, BtnSecondary, InternalBackButton } from "@/shared/ui/admin/AdminLayout";
export { ImageUpload, ProductAdminThumb, BrandAdminLogo } from "@/shared/ui/admin/AdminMedia";

export function initialOrderStatus(statuses: any[]) {
  const ordered = [...statuses].sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
  return ordered.find(status => /abert|novo|recebid|pendente/i.test(status.name || "")) || ordered[0] || null;
}
