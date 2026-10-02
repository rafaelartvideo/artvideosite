import { formatCurrency } from "@/shared/domain/formatters";
import type { PdvSaleDetail } from "../infrastructure/pdv.repository";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function dateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

export function printPdvReceipt(sale: PdvSaleDetail, organizationName: string) {
  const popup = window.open("", "_blank", "width=520,height=760");
  if (!popup) throw new Error("O navegador bloqueou a janela de impressão.");
  try { popup.opener = null; } catch { /* janela de impressão isolada quando suportado */ }

  const itemRows = sale.items.map(item => `
    <div class="item">
      <div class="item-name">${escapeHtml(item.product_name)}</div>
      <div class="item-line">
        <span>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)} × ${escapeHtml(formatCurrency(item.unit_price))}</span>
        <strong>${escapeHtml(formatCurrency(item.line_total))}</strong>
      </div>
      ${Number(item.discount_amount || 0) > 0 ? `<div class="row sub"><span>Desconto no item</span><span>- ${escapeHtml(formatCurrency(item.discount_amount))}</span></div>` : ""}
    </div>
  `).join("");

  const paymentRows = sale.payments.map(payment => `
    <div class="row">
      <span>${escapeHtml(payment.payment_method_name)}</span>
      <strong>${escapeHtml(formatCurrency(payment.amount))}</strong>
    </div>
    ${Number(payment.change_amount || 0) > 0 ? `<div class="row sub"><span>Troco</span><span>${escapeHtml(formatCurrency(payment.change_amount))}</span></div>` : ""}
  `).join("");

  const cancelled = sale.status === "cancelled";
  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Comprovante venda #${escapeHtml(sale.sale_number)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { width: 72mm; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.35; }
    .center { text-align: center; }
    .title { font-size: 15px; font-weight: 800; }
    .muted { color: #444; font-size: 10px; }
    .rule { border-top: 1px dashed #000; margin: 8px 0; }
    .item { padding: 4px 0; }
    .item-name { font-weight: 700; }
    .item-line, .row { display: flex; justify-content: space-between; gap: 8px; }
    .row { margin: 3px 0; }
    .sub { font-size: 10px; }
    .total { font-size: 15px; font-weight: 900; }
    .cancelled { border: 2px solid #000; padding: 5px; font-weight: 900; text-align: center; margin: 8px 0; }
    .wrap { overflow-wrap: anywhere; }
    @media screen {
      body { margin: 16px auto; box-shadow: 0 0 0 1px #ddd; padding: 5mm; width: 80mm; min-height: 100mm; }
    }
    @media print {
      body { width: 72mm; }
    }
  </style>
</head>
<body>
  <div class="center">
    <div class="title">${escapeHtml(organizationName || "Empresa")}</div>
    <div class="muted">Comprovante de venda</div>
  </div>
  ${cancelled ? '<div class="cancelled">VENDA CANCELADA</div>' : ""}
  <div class="rule"></div>
  <div class="row"><span>Venda</span><strong>#${escapeHtml(sale.sale_number)}</strong></div>
  <div class="row"><span>Data</span><span>${escapeHtml(dateTime(sale.sold_at))}</span></div>
  <div class="row"><span>Operador</span><span class="wrap">${escapeHtml(sale.sold_by_name || "—")}</span></div>
  ${sale.customer_name ? `<div class="row"><span>Cliente</span><span class="wrap">${escapeHtml(sale.customer_name)}</span></div>` : ""}
  ${sale.customer_document ? `<div class="row"><span>Documento</span><span>${escapeHtml(sale.customer_document)}</span></div>` : ""}
  <div class="rule"></div>
  ${itemRows}
  <div class="rule"></div>
  <div class="row"><span>Subtotal</span><strong>${escapeHtml(formatCurrency(sale.subtotal))}</strong></div>
  ${Number(sale.discount_amount || 0) > 0 ? `<div class="row"><span>Desconto</span><strong>- ${escapeHtml(formatCurrency(sale.discount_amount))}</strong></div>` : ""}
  ${Number(sale.surcharge_amount || 0) > 0 ? `<div class="row"><span>Acréscimo</span><strong>+ ${escapeHtml(formatCurrency(sale.surcharge_amount))}</strong></div>` : ""}
  <div class="row total"><span>TOTAL</span><strong>${escapeHtml(formatCurrency(sale.total_amount))}</strong></div>
  <div class="rule"></div>
  <div class="muted">Pagamentos</div>
  ${paymentRows}
  ${Number(sale.change_amount || 0) > 0 ? `<div class="row"><span>Troco total</span><strong>${escapeHtml(formatCurrency(sale.change_amount))}</strong></div>` : ""}
  ${sale.notes ? `<div class="rule"></div><div class="wrap"><strong>Observação:</strong> ${escapeHtml(sale.notes)}</div>` : ""}
  ${cancelled ? `<div class="rule"></div><div class="wrap"><strong>Cancelada em:</strong> ${escapeHtml(sale.cancelled_at ? dateTime(sale.cancelled_at) : "—")}</div><div class="wrap"><strong>Motivo:</strong> ${escapeHtml(sale.cancellation_reason || "—")}</div>` : ""}
  <div class="rule"></div>
  <div class="center muted">Documento não fiscal.</div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.focus(); window.print(); }, 250);
    });
  <\/script>
</body>
</html>`);
  popup.document.close();
}
