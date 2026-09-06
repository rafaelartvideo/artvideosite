import { formatDateTime } from "@/shared/domain/formatters";

export const fmtReviewDate = (value?: string | null) => formatDateTime(value);

export const purposeLabel = (purpose?: string | null) =>
  purpose === "TEST" ? "Para teste" : "Para resolução";
