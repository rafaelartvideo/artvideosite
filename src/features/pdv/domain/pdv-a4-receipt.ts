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
export function printPdvA4Receipt(sale: PdvSaleDetail, fallbackOrganizationName: string, options?: { general?: boolean; direction?: "received" | "paid"; number?: string; reference?: string; popup?: Window | null }) {
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
  const rows = sale.items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
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
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html { background: #fff; }
    body { margin: 0; padding: 0; background: white; color: #111; font: 12px/1.45 Arial, Helvetica, sans-serif; }
    .sheet { width: 210mm; min-height: 296mm; margin: 0 auto; padding: 17mm 16mm 14mm; display: flex; flex-direction: column; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 18mm; padding-bottom: 9mm; border-bottom: 1.5px solid #242424; }
    .issuer { min-width: 0; flex: 1; }
    .company { font-size: 24px; line-height: 1.2; font-weight: 800; overflow-wrap: anywhere; }
    .muted { margin-top: 4px; color: #555; font-size: 10.5px; line-height: 1.4; }
    .doc { min-width: 47mm; max-width: 64mm; padding-left: 7mm; border-left: 1px solid #555; text-align: right; }
    .doc-kind { font-size: 25px; line-height: 1.15; font-weight: 800; letter-spacing: .01em; }
    .doc-number { margin-top: 4px; font-size: 12px; font-weight: 700; }
    .doc-sale { margin-top: 4px; color: #444; font-size: 11px; }
    .panel { margin-top: 8mm; border: .8px solid #555; border-radius: 5px; overflow: hidden; }
    .panel-title { margin: 0; padding: 9px 12px; font-size: 12px; line-height: 1.4; font-weight: 800; text-transform: uppercase; letter-spacing: .025em; border-bottom: .8px solid #999; }
    .panel-content { padding: 14px 13px; }
    .grid-info { display: grid; grid-template-columns: 1.1fr 1.05fr .85fr; }
    .info { min-width: 0; padding: 0 12px; border-left: .6px solid #b3b3b3; overflow-wrap: anywhere; }
    .info:first-child { padding-left: 0; border-left: 0; }
    .info:last-child { padding-right: 0; }
    .label { display: block; margin-bottom: 6px; color: #555; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; }
    .info strong { display: block; font-size: 12.5px; line-height: 1.4; color: #111; }
    .info .muted { font-size: 11px; }
    .items-panel { margin-top: 8mm; }
    .items-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 11.5px; }
    .items-table th { padding: 10px 10px; text-align: left; font-size: 10px; color: #444; font-weight: 700; border-bottom: .8px solid #999; }
    .items-table td { padding: 12px 10px; border-top: .6px solid #d0d0d0; vertical-align: top; overflow-wrap: anywhere; }
    .items-table td + td, .items-table th + th { border-left: .5px solid #d0d0d0; }
    .items-table tbody tr:first-child td { border-top: 0; }
    .items-table tbody tr { break-inside: avoid; page-break-inside: avoid; }
    .items-table thead { display: table-header-group; }
    .items-table strong { font-size: 11.5px; font-weight: 700; }
    .item-number { width: 7%; }
    .item-description { width: 45%; }
    .item-quantity { width: 12%; }
    .item-price { width: 18%; }
    .right { text-align: right !important; }
    .minor { color: #555; font-size: 10px; line-height: 1.5; margin-top: 4px; }
    .pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    .money { white-space: nowrap; }
    .totals { width: 76mm; max-width: 100%; margin: 7mm 0 0 auto; break-inside: avoid; page-break-inside: avoid; }
    .totals > .line { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 4px 0; font-size: 11.5px; }
    .totals > .line strong { font-size: 12px; }
    .grand { margin-top: 7px; padding: 12px; border: 1px solid #333; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-weight: 800; font-size: 16px; }
    .grand .amount { font-size: 21px; padding-left: 12px; border-left: .8px solid #888; white-space: nowrap; }
    .payment-panel { margin-top: 8mm; break-inside: avoid; page-break-inside: avoid; }
    .payment-entry { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 5px 0; border-bottom: .5px solid #ddd; }
    .payment-entry:first-child { padding-top: 0; }
    .payment-entry:last-child { padding-bottom: 0; border-bottom: 0; }
    .payment-entry strong { font-size: 12px; white-space: nowrap; }
    .note { margin-top: 7mm; padding: 11px 13px; border: .7px solid #888; border-radius: 4px; overflow-wrap: anywhere; }
    .disclaimer { margin-top: 8mm; border: .8px solid #777; border-radius: 4px; padding: 12px 14px; color: #333; font-size: 10.5px; line-height: 1.6; break-inside: avoid; page-break-inside: avoid; }
    .disclaimer strong { color: #111; }
    .signature { margin: 16mm auto 0; width: 76mm; max-width: 100%; padding-top: 6px; border-top: .7px solid #777; text-align: center; color: #444; font-size: 10.5px; overflow-wrap: anywhere; break-inside: avoid; }
    .footer { margin-top: auto; padding-top: 10mm; text-align: center; }
    @media screen {
      body { background: #eee; }
      .sheet { background: #fff; box-shadow: 0 0 0 1px #d4d4d4, 0 8px 30px #0001; margin: 22px auto; }
    }
    @media print {
      html, body { background: #fff !important; }
      .sheet { margin: 0; box-shadow: none; width: 210mm; }
      .panel, .payment-panel, .disclaimer, .grand { background: #fff !important; }
    }
  </style>
</head>
<body>
<main class="sheet">
  <header class="head">
    <div class="issuer">
      <div class="company">${html(companyName)}</div>
      ${organizationDocument ? '<div class="muted">CNPJ/CPF: ' + html(organizationDocument) + '</div>' : ""}
      <div class="muted">Comprovante emitido pela Union World</div>
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
  <section class="panel items-panel">
    <h2 class="panel-title">${options?.general ? "Discriminação" : "Itens da venda"}</h2>
    <table class="items-table">
      <colgroup><col class="item-number"><col class="item-description"><col class="item-quantity"><col class="item-price"><col class="item-price"></colgroup>
      <thead><tr><th>#</th><th>Descrição</th><th class="right">Qtd.</th><th class="right">Unitário</th><th class="right">Total</th></tr></thead>
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
  <aside class="disclaimer"><strong>DOCUMENTO NÃO FISCAL.</strong> ${options?.general ? "Este recibo registra a declaração de quitação do valor discriminado, conforme informado pelo emitente. Não substitui documentos fiscais exigidos pela legislação e não movimenta automaticamente o caixa ou o financeiro." : "Este recibo comprova o recebimento do valor referente à venda identificada. Não substitui NFC-e, NF-e ou outro documento fiscal exigido pela legislação. A indicação de produto usado não exclui a garantia legal nem os direitos do consumidor."}</aside>
  <footer class="footer"><div class="signature">${html(companyName)} ${organizationDocument ? " · " + html(organizationDocument) : ""}</div></footer>
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
    general: true, direction: data.direction, popup: printWindow,
    number: `REC-FIN-${String(data.receipt_number).padStart(6,"0")}`,
    reference: data.service_order_number ? `OS ${data.service_order_number}` : data.description,
  });
}
