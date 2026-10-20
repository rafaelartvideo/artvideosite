import { supabase } from "@/lib/supabase";
import { getCompanyPrintContext } from "@/features/settings/infrastructure/company-settings.repository";

export type WarrantyOption = { id:string; organization_id:string; equipment_type_id:string; label:string; warranty_days:number; is_default:boolean; sort_order:number };
export type WarrantyDraft = { label:string; warranty_days:number; is_default:boolean };
export type WarrantyCertificate = { id:string; organization_id:string; service_order_id:string; certificate_number:number; warranty_option_label:string; warranty_days:number; starts_at:string; expires_at:string; issued_at:string; snapshot:Record<string,string|null> };

export async function listWarrantyOptions(org:string):Promise<WarrantyOption[]> {
 const {data,error}=await supabase.from("equipment_warranty_options").select("*").eq("organization_id",org).order("sort_order");
 if(error)throw error;return data||[];
}
export async function saveWarrantyOptions(org:string,typeId:string,options:WarrantyDraft[]) {
 const {error}=await supabase.rpc("save_equipment_warranty_options_v1",{p_organization_id:org,p_equipment_type_id:typeId,p_options:options});if(error)throw error;
}
export async function loadWarrantyCertificate(org:string,orderId:string):Promise<WarrantyCertificate|null> {
 const {data,error}=await supabase.from("service_order_warranty_certificates").select("*").eq("organization_id",org).eq("service_order_id",orderId).maybeSingle();
 if(error)throw error;return data as WarrantyCertificate|null;
}
export async function issueWarrantyCertificate(org:string,orderId:string,optionId:string|null) {
 const {data,error}=await supabase.rpc("issue_service_order_warranty_v1",{p_organization_id:org,p_service_order_id:orderId,p_warranty_option_id:optionId});
 if(error)throw error;return data as WarrantyCertificate;
}
const esc=(v:unknown)=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const br=(s:string|null|undefined)=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s||"");return m?m[3]+"/"+m[2]+"/"+m[1]:"—";};
const field=(key:string,value:unknown)=>'<div class="field"><span>'+esc(key)+'</span><b>'+esc(value||"—")+'</b></div>';

/** Modelo A4 HTML/CSS: impressão e Salvar em PDF pelo navegador; sem QR Code nem dependências externas. */
export async function printWarrantyCertificate(cert:WarrantyCertificate,popup?:Window|null) {
 const win=popup||window.open("","_blank","width=960,height=830");
 if(!win)throw new Error("Permita janelas de impressão no navegador.");
 try{
  const company=await getCompanyPrintContext(cert.organization_id),d=cert.snapshot||{};
  const code="CG-"+cert.starts_at.slice(0,4)+"-"+String(cert.certificate_number).padStart(6,"0");
  const logo=company.logoUrl?'<img class="logo" src="'+esc(company.logoUrl)+'" alt="'+esc(company.name)+'">':'<div class="logo-text">'+esc(company.name||d.organization_name)+'</div>';
  const info=(label:string,value:string)=>'<div><small>'+esc(label)+'</small><b>'+esc(value)+'</b></div>';
  const panel=(title:string,body:string)=>'<section><h3>'+esc(title)+'</h3><div class="content">'+body+'</div></section>';
  const service=esc(d.solution||"Serviço executado conforme descrito na Ordem de Serviço vinculada.");
  const client=field("Cliente",d.customer_name)+field("CPF/CNPJ",d.customer_document)+field("Telefone",d.customer_phone)+field("Cidade/UF",[d.customer_city,d.customer_state].filter(Boolean).join("/"));
  const equipment=field("Equipamento",d.equipment_name)+field("Marca",d.equipment_brand)+field("Modelo",d.equipment_model)+field("Nº de série",d.serial_number)+field("Acessórios",d.accessories);
  const warranty='<div class="w-row"><span>'+esc(cert.warranty_option_label)+'</span><b>'+cert.warranty_days+' dias</b></div><div class="w-row"><span>Início da garantia</span><b>'+br(cert.starts_at)+'</b></div><div class="w-row"><span>Validade até</span><b>'+br(cert.expires_at)+'</b></div><div class="highlight"><span>Garantia aplicada neste atendimento</span><strong>'+cert.warranty_days+' dias</strong></div>';
  const covered='<ul><li>Falhas relacionadas diretamente ao serviço realizado e às peças expressamente discriminadas na OS, quando houver.</li><li>O defeito reclamado será submetido à avaliação técnica no período indicado.</li><li>A identificação da OS permite consultar o histórico do atendimento.</li></ul>';
  const exclusions='<ul><li>Danos novos não relacionados ao reparo, como mau uso, quedas, umidade, surtos elétricos ou desgaste natural, não integram a garantia contratual.</li><li>Intervenção de terceiros será avaliada quanto à relação com o defeito reclamado.</li><li>Os direitos previstos na legislação consumerista e as garantias legais permanecem preservados.</li></ul>';
  const body='<header>'+logo+'<div class="seal"><span>✦</span><b>GARANTIA</b><small>DO SERVIÇO</small><span>★ ★ ★</span></div></header>'+
   '<h1>CERTIFICADO DE GARANTIA</h1><p class="subtitle">Emitido após a conclusão da Ordem de Serviço</p>'+
   '<div class="summary">'+info("Certificado",code)+info("OS vinculada",String(d.os_number||"—"))+info("Início",br(cert.starts_at))+info("Validade",br(cert.expires_at))+'</div>'+
   '<div class="columns">'+panel("DADOS DO CLIENTE",client)+panel("DADOS DO EQUIPAMENTO",equipment)+'</div>'+
   panel("SERVIÇO EXECUTADO",'<p class="description">'+service+'</p>')+
   panel("MODALIDADE E PRAZO DA GARANTIA",warranty)+
   '<div class="columns lower">'+panel("COBERTURA DA GARANTIA",covered)+panel("CONDIÇÕES E EXCLUSÕES",exclusions)+'</div>'+
   '<div class="signatures"><div>Responsável técnico</div><div>Assinatura do cliente</div><div>Carimbo da assistência</div></div>'+
   '<footer><span>'+esc(company.name)+'</span><span>'+esc([company.phone,company.email].filter(Boolean).join(" · "))+'</span></footer>'+
   '<div class="disclaimer">Documento não fiscal. Este certificado não limita nem substitui a garantia legal ou outros direitos previstos na legislação. Reimpressão do certificado '+esc(code)+'.</div>';
  const css='@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#e8eef5;color:#19324d;font-family:Arial,Helvetica,sans-serif}.page{width:210mm;min-height:297mm;padding:13mm 12mm 11mm;margin:auto;background:#fff;border:1.1mm solid #0e3a6e;box-shadow:0 8px 24px #1234}header{display:flex;justify-content:space-between;align-items:center;height:30mm}.logo{max-height:26mm;max-width:92mm;object-fit:contain}.logo-text{font-size:22pt;font-weight:800;color:#123b69}.seal{width:28mm;height:28mm;background:#11355d;border:2mm double #cba255;border-radius:50%;color:#f4dc99;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Georgia,serif;line-height:1.2;outline:.45mm solid #cba255}.seal b{font-size:8pt}.seal small{font-size:6pt;color:#fff}.seal span{font-size:10pt}h1{font:700 24pt Georgia,serif;text-align:center;color:#0b3769;margin:3mm 0 1mm}.subtitle{text-align:center;font-size:9pt;color:#63748b;margin:0 0 6mm}.summary{display:grid;grid-template-columns:repeat(4,1fr);padding:3mm 2mm;border:1px solid #bcd0e5;border-radius:2mm}.summary div{padding:0 2mm;border-right:1px solid #cad9e8}.summary div:last-child{border:0}.summary small{font-size:7pt;color:#647590;display:block;margin-bottom:1mm}.summary b{font-size:10pt;color:#123968}.columns{display:grid;grid-template-columns:1fr 1fr;gap:5mm}section{margin:4mm 0 0;break-inside:avoid}h3{font:700 9.2pt Georgia,serif;color:white;background:linear-gradient(90deg,#0b3667,#2073ae);padding:2.6mm 3mm;margin:0;border-radius:2mm 2mm 0 0}.content{padding:3mm 3.5mm;border:1px solid #c4d8eb;border-top:0;border-radius:0 0 2mm 2mm}.field{display:flex;gap:3mm;font-size:8pt;line-height:1.55}.field span{width:35%;flex-shrink:0;color:#60728a}.field b{overflow-wrap:anywhere}.description{font-size:8.6pt;line-height:1.55;margin:0;white-space:pre-wrap;min-height:13mm}.w-row{display:flex;justify-content:space-between;gap:6mm;font-size:8.4pt;border-bottom:1px solid #dee8f1;padding:2mm 0}.highlight{margin-top:2.5mm;background:#e9f4ff;border-radius:1.5mm;padding:3mm;display:flex;justify-content:space-between;align-items:center;font-size:9pt;color:#15416d;font-weight:700}.highlight strong{font-size:15pt}.lower .content{min-height:38mm}.content ul{padding-left:5mm;font-size:7.6pt;line-height:1.45;margin:0}.content li{margin-bottom:2mm}.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;margin-top:17mm}.signatures div{border-top:1px solid #71869d;text-align:center;padding-top:2mm;font-size:7.5pt;color:#536981}footer{border-top:1px solid #dce6f0;margin-top:8mm;padding-top:3mm;display:flex;justify-content:space-between;font-size:8pt;color:#546984;gap:4mm}.disclaimer{text-align:center;font-size:7pt;line-height:1.5;color:#6d7b8c;margin-top:3mm}@media screen{body{padding:12px}}@media print{body{background:white}.page{min-height:297mm;height:297mm;box-shadow:none}}';
  win.document.open();win.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Garantia '+esc(code)+'</title><style>'+css+'</style></head><body><article class="page">'+body+'</article><script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print()},450)});</script></body></html>');win.document.close();
 }catch(e){win.close();throw e;}
}
