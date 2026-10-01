import { formatCurrency } from "@/shared/domain/formatters";
import type { PdvCashSessionReport } from "../infrastructure/pdv.repository";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function dateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

export function printPdvCashReport(report: PdvCashSessionReport, organizationName: string) {
  const popup = window.open("", "_blank", "width=560,height=820");
  if (!popup) throw new Error("O navegador bloqueou a janela de impressão.");
  try { popup.opener = null; } catch { /* isolamento quando suportado */ }

  const session = report.session;
  const payments = report.payment_breakdown.map(payment => `
    <div class="row">
      <span>${escapeHtml(payment.payment_method_name)}</span>
      <strong>${escapeHtml(formatCurrency(payment.amount))}</strong>
    </div>
  `).join("");

  const movements = report.movements
    .filter(movement => movement.movement_type !== "cash_adjustment")
    .slice(0, 40)
    .map(movement => `
      <div class="movement">
        <div class="row">
          <span>${escapeHtml(dateTime(movement.occurred_at))}</span>
          <strong>${movement.direction === "credit" ? "+" : "-"} ${escapeHtml(formatCurrency(movement.amount))}</strong>
        </div>
        <div class="muted wrap">${escapeHtml(movement.description)}</div>
      </div>
    `).join("");

  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Fechamento de caixa</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { width: 72mm; font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.35; }
    .center { text-align: center; }
    .title { font-size: 15px; font-weight: 900; }
    .subtitle { font-size: 11px; font-weight: 800; margin-top: 2px; }
    .muted { color: #444; font-size: 9px; }
    .rule { border-top: 1px dashed #000; margin: 7px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
    .section { font-weight: 900; text-transform: uppercase; margin: 7px 0 4px; }
    .total { font-size: 13px; font-weight: 900; }
    .movement { padding: 3px 0; border-bottom: 1px dotted #bbb; }
    .wrap { overflow-wrap: anywhere; }
    .status { border: 1px solid #000; padding: 4px; margin: 6px 0; text-align: center; font-weight: 900; }
    @media screen {
      body { margin: 16px auto; box-shadow: 0 0 0 1px #ddd; padding: 5mm; width: 80mm; min-height: 100mm; }
    }
    @media print { body { width: 72mm; } }
  </style>
</head>
<body>
  <div class="center">
    <div class="title">${escapeHtml(organizationName || "Empresa")}</div>
    <div class="subtitle">Relatório de caixa PDV</div>
  </div>
  <div class="status">${session.status === "open" ? "CAIXA ABERTO" : "CAIXA FECHADO"}</div>
  <div class="row"><span>Conta</span><strong>${escapeHtml(session.account_name)}</strong></div>
  <div class="row"><span>Abertura</span><span>${escapeHtml(dateTime(session.opened_at))}</span></div>
  <div class="row"><span>Operador</span><span class="wrap">${escapeHtml(session.opened_by_name || "—")}</span></div>
  ${session.closed_at ? `<div class="row"><span>Fechamento</span><span>${escapeHtml(dateTime(session.closed_at))}</span></div>` : ""}
  ${session.closed_by_name ? `<div class="row"><span>Fechado por</span><span class="wrap">${escapeHtml(session.closed_by_name)}</span></div>` : ""}

  <div class="rule"></div>
  <div class="section">Vendas</div>
  <div class="row"><span>Vendas concluídas</span><strong>${escapeHtml(report.sales.completed_count)}</strong></div>
  <div class="row"><span>Total vendido</span><strong>${escapeHtml(formatCurrency(report.sales.completed_total))}</strong></div>
  <div class="row"><span>Vendas em dinheiro</span><strong>${escapeHtml(formatCurrency(report.sales.cash_total))}</strong></div>
  <div class="row"><span>Canceladas</span><strong>${escapeHtml(report.sales.cancelled_count)}</strong></div>
  ${Number(report.sales.cancelled_total || 0) > 0 ? `<div class="row"><span>Total cancelado</span><strong>${escapeHtml(formatCurrency(report.sales.cancelled_total))}</strong></div>` : ""}

  <div class="rule"></div>
  <div class="section">Formas de pagamento</div>
  ${payments || '<div class="muted">Sem vendas registradas neste turno.</div>'}

  <div class="rule"></div>
  <div class="section">Movimento do caixa</div>
  <div class="row"><span>Contado na abertura</span><strong>${escapeHtml(formatCurrency(session.opening_counted_amount))}</strong></div>
  <div class="row"><span>Recebimentos</span><strong>+ ${escapeHtml(formatCurrency(report.cash_movements.receipts))}</strong></div>
  <div class="row"><span>Suprimentos</span><strong>+ ${escapeHtml(formatCurrency(report.cash_movements.supplies))}</strong></div>
  <div class="row"><span>Sangrias</span><strong>- ${escapeHtml(formatCurrency(report.cash_movements.withdrawals))}</strong></div>
  <div class="row"><span>Estornos</span><strong>- ${escapeHtml(formatCurrency(report.cash_movements.reversals))}</strong></div>
  ${Number(report.cash_movements.fees || 0) > 0 ? `<div class="row"><span>Taxas</span><strong>- ${escapeHtml(formatCurrency(report.cash_movements.fees))}</strong></div>` : ""}
  <div class="row total"><span>Esperado</span><strong>${escapeHtml(formatCurrency(session.expected_amount))}</strong></div>
  ${session.closing_counted_amount != null ? `<div class="row total"><span>Contado</span><strong>${escapeHtml(formatCurrency(session.closing_counted_amount))}</strong></div>` : ""}
  ${session.closing_difference != null ? `<div class="row"><span>Diferença</span><strong>${escapeHtml(formatCurrency(session.closing_difference))}</strong></div>` : ""}
  ${session.closing_reason ? `<div class="wrap"><strong>Justificativa:</strong> ${escapeHtml(session.closing_reason)}</div>` : ""}

  ${movements ? `<div class="rule"></div><div class="section">Movimentações</div>${movements}` : ""}

  <div class="rule"></div>
  <div class="center muted">Relatório operacional do PDV.</div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.focus(); window.print(); }, 250);
    });
  <\/script>
</body>
</html>`);
  popup.document.close();
}
