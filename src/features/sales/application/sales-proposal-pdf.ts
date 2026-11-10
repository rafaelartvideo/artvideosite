import { getCompanyPrintContext } from "@/features/settings/infrastructure/company-settings.repository";
import { formatCurrency } from "@/shared/domain/formatters";
import { formatSalesDate, formatSalesDueDate } from "../domain/sales-order-display";
import type { SalesProposalDetail } from "../infrastructure/sales-proposals.repository";

const esc = (value: unknown): string => String(value ?? "")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/'/g,"&#39;");

/** Gera PDF com o snapshot aprovado, não com preços atualizados do Estoque. */
export async function downloadSalesProposalPdf(org: string, proposal: SalesProposalDetail): Promise<void> {
  const company=await getCompanyPrintContext(org).catch(()=>({
    name:"Empresa",subtitle:"",logoUrl:"",document:"",phone:"",email:"",address:"",
  }));
  const css=[
    ".proposal{font-family:Arial,sans-serif;color:#202938;width:188mm;background:#fff;box-sizing:border-box;padding:3mm;font-size:10pt}",
    ".proposal *{box-sizing:border-box}",
    ".proposal header{display:flex;gap:15px;align-items:center;border-bottom:2px solid #202938;padding-bottom:12px}",
    ".proposal .logo{max-height:58px;max-width:108px;object-fit:contain}",
    ".proposal h1{font-size:18pt;margin:0 0 4px}",
    ".proposal h2{font-size:12pt;margin:20px 0 8px}",
    ".proposal .muted{color:#697586;font-size:8pt;line-height:1.5}",
    ".proposal .meta{display:flex;gap:22px;justify-content:space-between;padding:16px 0;border-bottom:1px solid #e5e7eb}",
    ".proposal .meta strong{display:block;margin-top:4px}",
    ".proposal table{width:100%;border-collapse:collapse;margin-top:8px}",
    ".proposal th{background:#f3f4f6;text-align:left;font-size:8pt;padding:9px 5px}",
    ".proposal td{padding:9px 5px;border-bottom:1px solid #e5e7eb;vertical-align:top;overflow-wrap:anywhere}",
    ".proposal .right{text-align:right;white-space:nowrap}",
    ".proposal .total{margin:18px 0 0 auto;width:75mm;padding:12px;background:#f3f4f6}",
    ".proposal .total div{display:flex;justify-content:space-between;margin:7px 0}",
    ".proposal .total .grand{border-top:1px solid #d1d5db;font-weight:700;font-size:13pt;padding-top:9px}",
    ".proposal footer{border-top:1px solid #e5e7eb;margin-top:28px;padding-top:10px;color:#697586;font-size:8pt}",
    ".proposal .notes{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}",
    ".proposal .avoid{break-inside:avoid;page-break-inside:avoid}",
  ].join("");
  const issuer=[company.subtitle,company.document,company.address,company.phone,company.email]
    .filter(Boolean).map(row=>"<div>"+esc(row)+"</div>").join("");
  const rows=proposal.items.map((item,index)=>
    "<tr><td>"+esc(index+1)+"</td><td><strong>"+esc(item.name)+"</strong>"+
    (item.sku?"<br><small class='muted'>SKU "+esc(item.sku)+"</small>":"")+
    "</td><td class='right'>"+esc(item.quantity)+"</td><td class='right'>"+
    esc(formatCurrency(item.unit_price))+"</td><td class='right'><strong>"+
    esc(formatCurrency(item.line_total))+"</strong></td></tr>"
  ).join("");
  const html="<div class='proposal'><style>"+css+"</style>"+
    "<header>"+(company.logoUrl?"<img class='logo' crossorigin='anonymous' src='"+esc(company.logoUrl)+"' alt='Logo'>":"")+
    "<div><h1>"+esc(company.name)+"</h1><div class='muted'>"+issuer+"</div></div></header>"+
    "<div class='meta'><div><span class='muted'>PROPOSTA COMERCIAL</span><strong>Nº "+
    esc(proposal.proposal_number)+"</strong></div><div><span class='muted'>EMISSÃO</span><strong>"+
    esc(formatSalesDate(proposal.created_at,false))+"</strong></div><div><span class='muted'>VÁLIDA ATÉ</span><strong>"+
    esc(formatSalesDueDate(proposal.valid_until))+"</strong></div></div>"+
    "<div class='meta'><div><span class='muted'>CLIENTE</span><strong>"+
    esc(proposal.customer_name_snapshot)+"</strong><div class='muted'>"+
    esc(proposal.customer_document_snapshot)+"</div></div></div>"+
    "<h2>Itens da proposta</h2><table><thead><tr><th>Item</th><th>Descrição</th>"+
    "<th class='right'>Qtd.</th><th class='right'>Preço un.</th><th class='right'>Total</th>"+
    "</tr></thead><tbody>"+rows+"</tbody></table>"+
    "<section class='total avoid'>"+
    "<div><span>Subtotal</span><strong>"+esc(formatCurrency(proposal.subtotal))+"</strong></div>"+
    "<div><span>Desconto</span><strong>"+esc(formatCurrency(proposal.discount_amount))+"</strong></div>"+
    "<div class='grand'><span>Total</span><strong>"+esc(formatCurrency(proposal.total_amount))+"</strong></div></section>"+
    (proposal.notes?"<section class='avoid'><h2>Condições comerciais</h2><p class='notes'>"+
      esc(proposal.notes)+"</p></section>":"")+
    "<footer>Esta proposta não constitui nota fiscal, comprovante de pagamento nem reserva de estoque. "+
    "A confirmação do cliente e a disponibilidade serão verificadas antes de gerar o pedido.</footer></div>";
  const root=document.createElement("div");
  root.innerHTML=html;
  const html2pdf=(await import("html2pdf.js")).default;
  const filename="Proposta Comercial "+String(proposal.proposal_number).replace(/[^0-9]/g,"")+".pdf";
  const blob=await html2pdf().set({
    margin:8,filename,
    html2canvas:{scale:1.5,useCORS:true,logging:false},
    jsPDF:{unit:"mm",format:"a4",orientation:"portrait"},
    pagebreak:{mode:["css","legacy"]},
  }).from(root).outputPdf("blob") as Blob;
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;link.download=filename;
  document.body.appendChild(link);
  try { link.click(); }
  finally {
    link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
}
