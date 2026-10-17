/** Paleta reutilizável dos estados operacionais do CRM (claro e escuro).
 * Classes literais: Tailwind gera os estilos sem safelist dinâmica.
 */
export type StatusTone = "pending" | "progress" | "waiting" | "review" | "info"
  | "warning" | "success" | "danger" | "neutral";
type ToneStyle = { badge: string; solid: string; dot: string; text: string; surface: string };
export const STATUS_TONE_CLASSES: Record<StatusTone, ToneStyle> = {
  pending: {
    badge: "border-yellow-500/35 bg-yellow-500/10 text-yellow-800 dark:text-yellow-300",
    solid: "bg-yellow-500 text-yellow-950", dot: "bg-yellow-500",
    text: "text-yellow-800 dark:text-yellow-300", surface: "bg-yellow-500/10 dark:bg-yellow-500/10",
  },
  progress: {
    badge: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    solid: "bg-blue-600 text-white", dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-300", surface: "bg-blue-500/5 dark:bg-blue-500/10",
  },
  waiting: {
    badge: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    solid: "bg-orange-500 text-white", dot: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-300", surface: "bg-orange-500/5 dark:bg-orange-500/10",
  },
  review: {
    badge: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    solid: "bg-violet-600 text-white", dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-300", surface: "bg-violet-500/5 dark:bg-violet-500/10",
  },
  info: {
    badge: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
    solid: "bg-cyan-600 text-white", dot: "bg-cyan-500",
    text: "text-cyan-700 dark:text-cyan-300", surface: "bg-cyan-500/5 dark:bg-cyan-500/10",
  },
  success: {
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    solid: "bg-emerald-600 text-white", dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300", surface: "bg-emerald-500/5 dark:bg-emerald-500/10",
  },
  danger: {
    badge: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    solid: "bg-red-600 text-white", dot: "bg-red-500",
    text: "text-red-700 dark:text-red-300", surface: "bg-red-500/5 dark:bg-red-500/10",
  },
  /** Alias legado: alerta geral que pede atenção (laranja). */
  warning: {
    badge: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    solid: "bg-orange-500 text-white", dot: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-300", surface: "bg-orange-500/5 dark:bg-orange-500/10",
  },
  neutral: {
    badge: "border-border bg-muted text-muted-foreground",
    solid: "bg-muted text-muted-foreground", dot: "bg-slate-400",
    text: "text-muted-foreground", surface: "bg-muted/35",
  },
};
export const STATUS_TONE_HEX: Record<StatusTone, string> = {
  pending: "#eab308", progress: "#3b82f6", waiting: "#f97316",
  review: "#8b5cf6", info: "#06b6d4", success: "#059669",
  danger: "#dc2626", warning: "#f97316", neutral: "#94a3b8",
};
/** Deriva a cor do estado (e não da prioridade ou cor arbitrária do cadastro). */
export function getStatusTone(value?: string | null): StatusTone {
  const status = String(value || "").trim().toLocaleLowerCase("pt-BR")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_");
  if (!status) return "neutral";
  if (/(atras|overdue|expir|vencid|cancel|recus|rejeit|reject|failed|failure|falha|error|erro|estorn|revers|refunded|no_show|nao_cumprid|nao_aprov|bloquead|delivery_issue|abandon|declined|withdrawn|lost|suspend)/.test(status)) return "danger";
  if (/(conclu|completed|complete|finaliz|finished|pronto|entregue|aprov|approved|atendid|fulfilled|liquid|settled|pago|paid|assinad|signed|resolvid|success|sucesso|done|fechad|closed|posted|picked_up|confirmed|accepted)/.test(status)) return "success";
  if (/(analise|review|revision|verificac|validac|avaliac)/.test(status)) return "review";
  if (/(in_progress|andamento|em_execuc|execuc|processing|processando|preparing|separac|out_for_delivery|in_att|em_atendimento|em_transit|em_rota)/.test(status)) return "progress";
  if (/(aguard|waiting|on_hold|hold|wait_|espera)/.test(status)) return "waiting";
  if (/(pendent|pending|abert|open|partial|parcial|solicit|received|recebid|a_vencer|criando|creating|submitted)/.test(status)) return "pending";
  if (/(viewed|visualizad|scheduled|agendad|presented|encaminhad|notific|informativ)/.test(status)) return "info";
  return "neutral";
}
export const getStatusBadgeClass = (status?: string | null) => STATUS_TONE_CLASSES[getStatusTone(status)].badge;
export const getStatusDotClass = (status?: string | null) => STATUS_TONE_CLASSES[getStatusTone(status)].dot;
