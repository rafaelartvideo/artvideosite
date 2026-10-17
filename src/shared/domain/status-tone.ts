/** Paleta semântica única para status operacionais no CRM. */
export type StatusTone = "warning" | "danger" | "success" | "neutral";
export const STATUS_TONE_CLASSES: Record<StatusTone, {
  badge: string; solid: string; dot: string; text: string; surface: string;
}> = {
  warning: {
    badge: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    solid: "bg-orange-500 text-white",
    dot: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-300",
    surface: "bg-orange-500/5 dark:bg-orange-500/10",
  },
  danger: {
    badge: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    solid: "bg-red-600 text-white",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-300",
    surface: "bg-red-500/5 dark:bg-red-500/10",
  },
  success: {
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    solid: "bg-emerald-600 text-white",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    surface: "bg-emerald-500/5 dark:bg-emerald-500/10",
  },
  neutral: {
    badge: "border-border bg-muted text-muted-foreground",
    solid: "bg-muted text-muted-foreground",
    dot: "bg-slate-400",
    text: "text-muted-foreground",
    surface: "bg-muted/35",
  },
};
/** Aceita valores do banco e nomes de status em português/inglês. */
export function getStatusTone(value?: string | null): StatusTone {
  const normalized = String(value || "").trim().toLocaleLowerCase("pt-BR")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_");
  if (!normalized) return "neutral";
  if (/(atras|overdue|expir|expired|vencid|cancel|recus|rejeit|reject|failed|failure|falha|error|erro|estorn|revers|refunded|no_show|nao_cumprid|bloquead|delivery_issue|manual_review|abandon|declined|withdrawn|lost|suspend)/.test(normalized)) return "danger";
  if (/(conclu|completed|complete|finaliz|finished|pronto|entregue|aprov|approved|atendid|fulfilled|liquid|settled|pago|paid|assinad|signed|resolvid|success|sucesso|done|fechad|closed|posted|picked_up|confirmed|accepted)/.test(normalized)) return "success";
  if (/(pendent|pending|aguard|waiting|analise|review|abert|open|in_progress|andamento|em_execuc|processing|processando|a_vencer|partial|parcial|solicit|viewed|visualizad|preparing|ready|out_for_delivery|scheduled|submitted|presented|received|criando)/.test(normalized)) return "warning";
  return "neutral";
}
export const STATUS_TONE_HEX: Record<StatusTone, string> = {
  warning: "#f97316", danger: "#dc2626", success: "#059669", neutral: "#94a3b8",
};
export const getStatusBadgeClass = (status?: string | null) => STATUS_TONE_CLASSES[getStatusTone(status)].badge;
export const getStatusDotClass = (status?: string | null) => STATUS_TONE_CLASSES[getStatusTone(status)].dot;
