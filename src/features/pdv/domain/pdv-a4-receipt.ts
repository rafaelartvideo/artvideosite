import { formatCurrency } from "@/shared/domain/formatters";
import type { PdvSaleDetail } from "../infrastructure/pdv.repository";

const html = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const conditionLabel = (value?: string) =>
  value === "used" ? "Usado" : value === "refurbished" ? "Recondicionado" : "Novo";

/**
 * Recibo não fiscal de quitação, ligado ao número imutável da venda do PDV.
 * A impressão pelo navegador permite papel A4 ou "Salvar como PDF".
 */
export function printPdvA4Receipt(sale: PdvSaleDetail, fallbackOrganizationName: string, options?: { general?: boolean; direction?: "received" | "paid"; number?: string; reference?: string; reason?: string; detailDescription?: string | null; popup?: Window | null }) {
  if (sale.status !== "completed") throw new Error("Venda cancelada não permite emitir recibo de quitação.");
  if (sale.payments.some(payment => payment.settlement_status === "reversed")) {
    throw new Error("Há pagamento estornado nesta venda; não é possível emitir recibo de quitação.");
  }

  const popup = options?.popup || window.open("", "_blank", "width=960,height=830");
  if (!popup) throw new Error("O navegador bloqueou a janela do recibo.");
  try { popup.opener = null; } catch { /* Isola janela quando suportado. */ }

  const number = options?.number || ("REC-" + String(sale.sale_number).padStart(6, "0"));
  const date = new Date(sale.sold_at).toLocaleString("pt-BR");
  const companyName = sale.organization_name || fallbackOrganizationName || "Empresa";
  const organizationDocument = sale.organization_document;
  const rows = sale.items.map(item => `
    <tr>
      <td>
        <strong>${html(item.product_name)}</strong>
        ${options?.general ? "" : `<div class="minor">${html(conditionLabel(item.condition))}${item.is_manual ? " · Venda avulsa" : ""}${item.serial_number ? " · Série: " + html(item.serial_number) : ""}</div>`}
        ${item.condition_notes ? '<div class="minor pre">' + html(item.condition_notes) + '</div>' : ""}
      </td>
      <td class="right">${html(item.quantity)} ${html(item.unit)}</td>
      <td class="right">${html(formatCurrency(item.unit_price))}</td>
      <td class="right">${html(formatCurrency(item.line_total))}</td>
    </tr>`).join("");

  const payments = sale.payments.map(payment =>
    `<div class="payment-entry"><span>${html(payment.payment_method_name)}</span><strong>${html(formatCurrency(payment.amount))}</strong></div>`
  ).join("");

  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${html(number)} · ${html(companyName)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    /* Formato A5 paisagem: mesma largura do A4 e metade de sua altura. */
    @page { size: 210mm 148mm; margin: 8mm 11mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body { font: 10px/1.3 Arial, Helvetica, sans-serif; }
    .sheet { width: 188mm; min-height: 0; margin: 0 auto; padding: 0; }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10mm; padding: 0 0 3mm; border-bottom: 1px solid #111; }
    .issuer { flex: 1; min-width: 0; }
    .company { font-size: 15px; font-weight: 800; line-height: 1.22; overflow-wrap: anywhere; }
    .muted { color: #505050; font-size: 9px; margin-top: 2px; }
    .doc { flex-shrink: 0; min-width: 43mm; max-width: 75mm; text-align: right; }
    .doc-kind { font-size: 18px; font-weight: 800; letter-spacing: .08em; line-height: 1.1; }
    .doc-number { font-size: 10px; font-weight: 700; margin-top: 3px; }
    .doc-sale { font-size: 9px; color: #555; margin-top: 2px; overflow-wrap: anywhere; }
    .panel { margin: 3mm 0 0; padding: 0; border: 0; border-radius: 0; }
    .panel-title { font-size: 9px; line-height: 1.2; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; margin: 0 0 1.5mm; padding: 0; }
    .panel-content { padding: 0; }
    .grid-info { display: grid; grid-template-columns: minmax(0,1.55fr) minmax(0,1fr) minmax(0,.9fr); gap: 7mm; }
    .info { padding: 0; min-width: 0; overflow-wrap: anywhere; }
    .label { display: block; margin-bottom: 2px; color: #555; font-size: 8.5px; text-transform: uppercase; letter-spacing: .04em; }
    .info strong { display: block; font-size: 10.5px; font-weight: 700; line-height: 1.24; }
    .info .muted { font-size: 9px; }
    .items-panel { margin-top: 3mm; }
    .items-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
    .items-table thead { display: table-header-group; }
    .items-table th { text-align: left; color: #444; font-size: 8.5px; font-weight: 700; padding: 1.5mm 1.5mm; border-top: 1px solid #111; border-bottom: 1px solid #aaa; }
    .items-table td { padding: 1.5mm; border-bottom: .5px solid #d2d2d2; vertical-align: top; overflow-wrap: anywhere; }
    .items-table tr { break-inside: avoid; page-break-inside: avoid; }
    .items-table strong { font-size: 10px; font-weight: 700; }
    .item-description { width: 52%; }
    .item-quantity { width: 12%; }
    .item-price { width: 18%; }
    .right { text-align: right !important; }
    .minor { color: #555; font-size: 8.5px; line-height: 1.3; margin-top: 2px; }
    .pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    .money { white-space: nowrap; }
    .totals { margin: 2.5mm 0 0 auto; width: 72mm; max-width: 100%; break-inside: avoid; page-break-inside: avoid; }
    .totals > .line { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 1px 0; font-size: 9.5px; }
    .totals > .line strong { font-weight: 700; }
    .grand { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-top: 1.5mm; padding: 2mm 0 1mm; border-top: 1.4px solid #111; font-size: 11px; font-weight: 800; }
    .grand .amount { font-size: 16px; white-space: nowrap; font-weight: 800; }
    .payment-panel { margin-top: 2.5mm; break-inside: avoid; page-break-inside: avoid; }
    .payment-panel .panel-content { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 0 8mm; }
    .payment-entry { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 1.5px 0; }
    .payment-entry strong { white-space: nowrap; font-size: 9.5px; }
    .note { margin-top: 2.5mm; overflow-wrap: anywhere; font-size: 9.5px; }
    .disclaimer { margin-top: 3mm; padding-top: 2mm; border-top: 1px solid #bbb; font-size: 8.5px; color: #444; line-height: 1.35; break-inside: avoid; page-break-inside: avoid; }
    .disclaimer strong { color: #111; }
    .footer { margin-top: 2mm; color: #555; font-size: 8px; text-align: left; }
    @media screen {
      html, body { background: #efefef; }
      body { padding: 18px 12px; }
      .sheet { width: 210mm; max-width: 100%; min-height: 148mm; padding: 8mm 11mm; margin: 0 auto; background: #fff; box-shadow: 0 3px 22px #00000020; }
    }
    @media print {
      html, body { background: #fff !important; }
      .sheet { width: auto; min-height: 0; padding: 0; margin: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
<main class="sheet">
  <header class="head">
    <div class="issuer">
      <div class="company">${html(companyName)}</div>
      ${organizationDocument ? '<div class="muted">CNPJ/CPF: ' + html(organizationDocument) + '</div>' : ""}
      
    </div>
    <div class="doc">
      <div class="doc-kind">RECIBO</div>
      <div class="doc-number">${html(number)}</div>
      <div class="doc-sale">${html(options?.general ? options.reference || "Recibo financeiro avulso" : `Venda #${sale.sale_number}`)}</div>
    </div>
  </header>
  <section class="panel">
    <h2 class="panel-title">${options?.general && options.direction === "paid" ? "Dados do pagamento" : "Dados do recebimento"}</h2>
    <div class="panel-content grid-info">
      <div class="info">
        <span class="label">${options?.general && options.direction === "paid" ? "Pagamos a" : "Recebemos de"}</span>
        <strong>${html(sale.customer_name || "Consumidor não identificado")}</strong>
        ${sale.customer_document ? '<div class="muted">' + html(sale.customer_document) + '</div>' : ""}
      </div>
      <div class="info">
        <span class="label">${options?.general ? "Data do recibo" : "Data da venda"}</span>
        <strong>${html(date)}</strong>
      </div>
      <div class="info">
        <span class="label">Responsável</span>
        <strong>${html(sale.sold_by_name || "—")}</strong>
      </div>
    </div>
  </section>
  ${options?.general ? '<section class="panel"><h2 class="panel-title">Motivo do recibo</h2><div class="panel-content"><strong>' + html(options.reason || sale.notes || "—") + '</strong>' + (options.detailDescription ? '<p class="pre" style="margin:6px 0 0">' + html(options.detailDescription) + '</p>' : '') + '</div></section>' : ""}
  <section class="panel items-panel">
    <h2 class="panel-title">${options?.general ? "Discriminação" : "Itens da venda"}</h2>
    <table class="items-table">
      <colgroup><col class="item-description"><col class="item-quantity"><col class="item-price"><col class="item-price"></colgroup>
      <thead><tr><th>Descrição</th><th class="right">Qtd.</th><th class="right">Unitário</th><th class="right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>
  <section class="totals" aria-label="Total do recibo">
    <div class="line"><span>Subtotal</span><strong>${html(formatCurrency(sale.subtotal))}</strong></div>
    ${Number(sale.discount_amount) ? '<div class="line"><span>Descontos</span><strong>- ' + html(formatCurrency(sale.discount_amount)) + '</strong></div>' : ""}
    ${Number(sale.surcharge_amount) ? '<div class="line"><span>Acréscimos</span><strong>+ ' + html(formatCurrency(sale.surcharge_amount)) + '</strong></div>' : ""}
    <div class="grand"><span>${options?.general && options.direction === "paid" ? "PAGO" : "RECEBIDO"}</span><span class="amount">${html(formatCurrency(sale.total_amount))}</span></div>
  </section>
  <section class="panel payment-panel">
    <h2 class="panel-title">Formas de pagamento</h2>
    <div class="panel-content">${payments}</div>
  </section>
  ${sale.notes ? '<section class="note"><strong>Observações:</strong> ' + html(sale.notes) + '</section>' : ""}
  <aside class="disclaimer"><strong>Documento não fiscal.</strong> ${options?.general ? "Comprova a quitação do valor e da finalidade informados; não substitui documentação fiscal obrigatória." : "Comprova o recebimento da venda indicada; não substitui nota fiscal. Os direitos legais do consumidor permanecem preservados."}</aside>
  <footer class="footer">Emitido por ${html(companyName)} ${organizationDocument ? " · " + html(organizationDocument) : ""}</footer>
</main>
<script>
  window.addEventListener("load", function () {
    setTimeout(function () { window.focus(); window.print(); }, 250);
  });
</script>
</body>
</html>`);
  popup.document.close();
}

/** Reutiliza integralmente o modelo A4, P&B, do recibo de venda para recibos financeiros avulsos. */
export type GeneralReceiptA4 = {
  id: string;
  receipt_number: number;
  direction: "received" | "paid";
  counterpart_name: string;
  counterpart_document: string | null;
  description: string;
  detail_description?: string | null;
  items: Array<{ description: string; quantity: number; unit_price: number }>;
  total_amount: number;
  payment_method_name: string | null;
  notes: string | null;
  issuer_name: string;
  organization_name: string;
  organization_document: string | null;
  issued_at: string;
  service_order_number?: string | null;
};

export function printGeneralFinancialReceipt(data: GeneralReceiptA4, printWindow?: Window | null) {
  const sale: PdvSaleDetail = {
    id: data.id,
    sale_number: data.receipt_number,
    status: "completed",
    customer_id: null,
    customer_name: data.counterpart_name,
    customer_document: data.counterpart_document,
    organization_name: data.organization_name,
    organization_document: data.organization_document,
    sold_at: data.issued_at,
    sold_by_name: data.issuer_name,
    notes: data.notes,
    cancelled_at: null,
    cancelled_by_name: null,
    cancellation_reason: null,
    subtotal: Number(data.total_amount),
    discount_amount: 0,
    surcharge_amount: 0,
    total_amount: Number(data.total_amount),
    change_amount: 0,
    items: data.items.map((item,index) => ({
      id: `${data.id}-${index}`,
      product_id: null,
      product_name: item.description,
      sku: null,
      barcode: null,
      quantity: Number(item.quantity),
      unit: "un",
      unit_price: Number(item.unit_price),
      line_subtotal: Number(item.quantity)*Number(item.unit_price),
      discount_amount: 0,
      line_total: Number(item.quantity)*Number(item.unit_price),
    })),
    payments: [{
      id: data.id,
      payment_method_id: "",
      payment_method_name: data.payment_method_name || "Forma não informada",
      method_type: "other",
      financial_account_name: "",
      amount: Number(data.total_amount),
      tendered_amount: null,
      change_amount: 0,
      fee_amount: 0,
      settlement_status: "posted",
    }],
  };
  printPdvA4Receipt(sale, data.organization_name, {
    general: true, direction: data.direction, reason: data.description, detailDescription: data.detail_description, popup: printWindow,
    number: `REC-FIN-${String(data.receipt_number).padStart(6,"0")}`,
    reference: data.service_order_number ? `OS ${data.service_order_number}` : data.description,
  });
}
