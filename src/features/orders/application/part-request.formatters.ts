export const fmtReviewDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const purposeLabel = (purpose?: string | null) =>
  purpose === "TEST" ? "Para teste" : "Para resolução";
