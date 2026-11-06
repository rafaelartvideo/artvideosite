/** Classifica o vencimento pela data local, sem depender do fuso UTC do servidor. */
export function financialDueUrgency(dueDate, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate || "").slice(0, 10))) return "none";
  const [year, month, day] = String(dueDate).slice(0, 10).split("-").map(Number);
  const dueUtc = Date.UTC(year, month - 1, day);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const difference = Math.round((dueUtc - todayUtc) / 86400000);
  if (difference < 0) return "overdue";
  if (difference === 0) return "today";
  if (difference <= 3) return "urgent";
  if (difference <= 7) return "soon";
  return "normal";
}
