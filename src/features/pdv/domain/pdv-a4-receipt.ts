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
export function printPdvA4Receipt(sale: PdvSaleDetail, fallbackOrganizationName: string) {
  if (sale.status !== "completed") throw new Error("Venda cancelada não permite emitir recibo de quitação.");
  if (sale.payments.some(payment => payment.settlement_status === "reversed")) {
    throw new Error("Há pagamento estornado nesta venda; não é possível emitir recibo de quitação.");
  }

  const popup = window.open("", "_blank", "width=960,height=830");
  if (!popup) throw new Error("O navegador bloqueou a janela do recibo.");
  try { popup.opener = null; } catch { /* Isola janela quando suportado. */ }

  const number = "REC-" + String(sale.sale_number).padStart(6, "0");
  const date = new Date(sale.sold_at).toLocaleString("pt-BR");
  const companyName = sale.organization_name || fallbackOrganizationName || "Empresa";
  const organizationDocument = sale.organization_document;
  const rows = sale.items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>
        <strong>${html(item.product_name)}</strong>
        <div class="minor">${html(conditionLabel(item.condition))}${item.is_manual ? " · Venda avulsa" : ""}${item.serial_number ? " · Série: " + html(item.serial_number) : ""}</div>
        ${item.condition_notes ? '<div class="minor pre">' + html(item.condition_notes) + '</div>' : ""}
      </td>
      <td class="right">${html(item.quantity)} ${html(item.unit)}</td>
      <td class="right">${html(formatCurrency(item.unit_price))}</td>
      <td class="right">${html(formatCurrency(item.line_total))}</td>
    </tr>`).join("");

  const payments = sale.payments.map(payment =>
    `<span>${html(payment.payment_method_name)}: <strong>${html(formatCurrency(payment.amount))}</strong></span>`
  ).join(" &nbsp; | &nbsp; ");

  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><title>${html(number)} · ${html(companyName)}</title>
<style>
  @page { size: A4; margin: 17mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 13px Arial, Helvetica, sans-serif; color: #16253d; background: white; }
  .head { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 3px solid #125cc8; padding-bottom: 22px; }
  .company { font-size: 19px; font-weight: 800; }
  .minor { color: #64748b; font-size: 11px; line-height: 1.65; }
  .doc { text-align: right; }
  .doc .kind { color: #125cc8; font-size: 21px; font-weight: 900; }
  .doc .number { font-weight: 700; margin-top: 5px; }
  h2 { font-size: 13px; margin: 25px 0 11px; text-transform: uppercase; letter-spacing: .08em; }
  .detail { display: flex; flex-wrap: wrap; gap: 14px 40px; padding: 16px; background: #f5f7fa; border: 1px solid #e2e8f0; border-radius: 7px; }
  .detail > div { min-width: 170px; flex: 1; }
  .label { font-size: 10px; color: #64748b; display: block; margin-bottom: 5px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #eef3fa; color: #3b506c; font-size: 10px; text-align: left; padding: 10px 8px; }
  td { padding: 12px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .right { text-align: right; white-space: nowrap; }
  .pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  .totals { margin-left: auto; margin-top: 16px; width: 300px; }
  .totals > div { display: flex; justify-content: space-between; padding: 5px 0; }
  .totals .grand { font-size: 20px; font-weight: 900; color: #125cc8; border-top: 2px solid #125cc8; margin-top: 9px; padding-top: 10px; }
  .payment { margin: 18px 0; padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 7px; }
  .note { overflow-wrap: anywhere; margin-top: 18px; }
  .disclaimer { margin-top: 30px; padding: 13px; border: 1px solid #cbd5e1; font-size: 11px; line-height: 1.55; }
  .signature { margin-top: 55px; border-top: 1px solid #94a3b8; width: 65%; padding-top: 8px; font-size: 11px; }
  @media screen { body { max-width: 794px; min-height: 1123px; margin: 25px auto; padding: 62px 60px; box-shadow: 0 0 0 1px #ddd, 0 8px 30px #0001; } }
</style></head><body>
<header class="head">
  <div><div class="company">${html(companyName)}</div>${organizationDocument ? '<div class="minor">CNPJ/CPF: ' + html(organizationDocument) + '</div>' : ''}<div class="minor">Comprovante emitido pela Union World</div></div>
  <div class="doc"><div class="kind">RECIBO</div><div class="number">${html(number)}</div><div class="minor">Venda #${html(sale.sale_number)}</div></div>
</header>
<h2>Dados do recebimento</h2>
<section class="detail">
  <div><span class="label">Recebemos de</span><strong>${html(sale.customer_name || "Consumidor não identificado")}</strong>${sale.customer_document ? '<div class="minor">' + html(sale.customer_document) + '</div>' : ''}</div>
  <div><span class="label">Data da venda</span><strong>${html(date)}</strong></div>
  <div><span class="label">Responsável</span><strong>${html(sale.sold_by_name || "—")}</strong></div>
</section>
<h2>Itens da venda</h2>
<table><thead><tr><th>#</th><th>Descrição</th><th class="right">Qtd.</th><th class="right">Unitário</th><th class="right">Total</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals">
  <div><span>Subtotal</span><strong>${html(formatCurrency(sale.subtotal))}</strong></div>
  ${Number(sale.discount_amount) ? '<div><span>Descontos</span><strong>- ' + html(formatCurrency(sale.discount_amount)) + '</strong></div>' : ""}
  ${Number(sale.surcharge_amount) ? '<div><span>Acréscimos</span><strong>+ ' + html(formatCurrency(sale.surcharge_amount)) + '</strong></div>' : ""}
  <div class="grand"><span>RECEBIDO</span><span>${html(formatCurrency(sale.total_amount))}</span></div>
</div>
<div style="clear:both"></div>
<div class="payment"><span class="label">Formas de pagamento</span>${payments}</div>
${sale.notes ? '<div class="note"><strong>Observações:</strong> ' + html(sale.notes) + '</div>' : ""}
<div class="disclaimer"><strong>DOCUMENTO NÃO FISCAL.</strong> Este recibo comprova o recebimento do valor referente à venda identificada. Não substitui NFC-e, NF-e ou outro documento fiscal exigido pela legislação. A indicação de produto usado não exclui a garantia legal nem os direitos do consumidor.</div>
<div class="signature">${html(companyName)}${organizationDocument ? " · " + html(organizationDocument) : ""}</div>
<script>window.addEventListener("load", function () { setTimeout(function () { window.focus(); window.print(); }, 250); });<\/script>
</body></html>`);
  popup.document.close();
}
