import {supabase} from "@/lib/supabase";
import {prepareImageForUpload} from "@/shared/application/upload-file-optimizer";
import type {FinancialAttachmentType} from "../domain/finance.types";

export type ExpenseScan = {
  description:string; amount:number|null; issue_date:string|null; due_date:string|null;
  supplier:string; document:string; category:string; kind:string; paid:boolean|null;
  payment:string; reference:string; warning:string;
};
export type ExpenseSource = {file:File; attachmentType:FinancialAttachmentType; openSettlement:boolean};
const normalize=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
export function expenseAttachmentType(kind:string):FinancialAttachmentType {
  return kind==="invoice"?"invoice":kind==="boleto"?"boleto":kind==="receipt"?"receipt":kind==="payment_proof"?"proof":"other";
}
export function suggestedPaymentType(value:string){
  const name=normalize(value);
  if(name.includes("pix"))return "pix";
  if(name.includes("boleto"))return "boleto";
  if(name.includes("dinheiro"))return "cash";
  if(name.includes("debito"))return "debit_card";
  if(name.includes("credito"))return "credit_card";
  if(name.includes("transferencia"))return "transfer";
  return "";
}
function readDataUrl(file:File):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result));
    reader.onerror=()=>reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}
function readInvoiceXml(xml:string):ExpenseScan{
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error("XML não suportado.");
  const doc=new DOMParser().parseFromString(xml,"application/xml");
  const get=(root:Document|Element|null,key:string)=>root?.getElementsByTagNameNS("*",key)[0]||null;
  const value=(root:Document|Element|null,key:string)=>get(root,key)?.textContent?.trim()||"";
  const info=get(doc,"infNFe");
  if(doc.querySelector("parsererror")||!info)throw new Error("Selecione um XML de NF-e ou NFC-e válido.");
  const emit=get(info,"emit"),ide=get(info,"ide"),total=get(info,"ICMSTot");
  const sum=Number(value(total,"vNF"));
  const issue=(value(ide,"dhEmi")||value(ide,"dEmi")).slice(0,10);
  const items=Array.from(info.getElementsByTagNameNS("*","det"));
  const desc=items.length===1?value(items[0],"xProd"):"Compra de mercadorias";
  const dup=Array.from(info.getElementsByTagNameNS("*","dup"));
  return {description:desc||"Compra de mercadorias",amount:Number.isFinite(sum)&&sum>0?sum:null,issue_date:/^\d{4}-\d{2}-\d{2}$/.test(issue)?issue:null,due_date:dup.length===1?value(dup[0],"dVenc")||null:null,supplier:value(emit,"xNome"),document:value(emit,"CNPJ")||value(emit,"CPF"),category:"",kind:"invoice",paid:null,payment:"",reference:info.getAttribute("Id")?.replace(/^NFe/,"")||value(ide,"nNF"),warning:dup.length>1?"A nota possui várias duplicatas. Confira o parcelamento.":""};
}
/** Validate an ordinary Brazilian bank boleto. Never infer a due date from the reset factor. */
export function readBoletoCode(value:string):{barcode:string;amount:number|null}|null {
  const digits=value.replace(/\D/g,"");
  const mod10=(part:string)=>{let sum=0,weight=2;for(let i=part.length-1;i>=0;i--){const v=Number(part[i])*weight;sum+=v>9?v-9:v;weight=weight===2?1:2;}return (10-sum%10)%10;};
  let code=digits;
  if(digits.length===47){
    if(mod10(digits.slice(0,9))!==Number(digits[9])||mod10(digits.slice(10,20))!==Number(digits[20])||mod10(digits.slice(21,31))!==Number(digits[31]))return null;
    code=digits.slice(0,4)+digits[32]+digits.slice(33)+digits.slice(4,9)+digits.slice(10,20)+digits.slice(21,31);
  }
  if(code.length!==44||code[0]==="8"||code[3]!=="9")return null;
  let sum=0,weight=2;
  for(let i=43;i>=0;i--){if(i===4)continue;sum+=Number(code[i])*weight;weight=weight===9?2:weight+1;}
  const raw=11-sum%11,check=raw===0||raw===10||raw===11?1:raw;
  if(Number(code[4])!==check)return null;
  const amount=Number(code.slice(9,19))/100;
  return {barcode:code,amount:amount>0?amount:null};
}
async function detectBoletoImage(file:File){
  if(!file.type.startsWith("image/"))return null;
  const url=URL.createObjectURL(file);
  try{
    const {BrowserMultiFormatReader}=await import("@zxing/browser");
    const result=await new BrowserMultiFormatReader().decodeFromImageUrl(url);
    return readBoletoCode(result.getText());
  }catch{return null;}finally{URL.revokeObjectURL(url);}
}
export async function scanExpenseDocument(org:string,file:File,categories:string[]):Promise<ExpenseScan>{
  if(file.size>25*1024*1024)throw new Error("Selecione um documento de até 25 MB.");
  if(/\.xml$/i.test(file.name)||file.type==="application/xml"||file.type==="text/xml"){
    if(file.size>2_000_000)throw new Error("XML de até 2 MB.");
    return readInvoiceXml(await file.text());
  }
  const isPdf=file.type==="application/pdf"||/\.pdf$/i.test(file.name);
  const normalized=isPdf?(file.type==="application/pdf"?file:new File([file],file.name,{type:"application/pdf"})):await prepareImageForUpload(file,"document-image",2_000_000);
  if(normalized.size>2_000_000||!["image/jpeg","image/png","image/webp","application/pdf"].includes(normalized.type))throw new Error("Selecione uma foto JPG, PNG, WEBP ou PDF de até 2 MB.");
  const barcode=await detectBoletoImage(normalized);
  const {data,error}=await supabase.functions.invoke("union-ai-expense",{body:{organization_id:org,document:await readDataUrl(normalized),categories}});
  if(error){
    const context=(error as {context?:unknown}).context;
    const detail=context instanceof Response?await context.clone().json().catch(()=>null):null;
    if(barcode)return {description:"Boleto bancário",amount:barcode.amount,issue_date:null,due_date:null,supplier:"",document:"",category:"",kind:"boleto",paid:false,payment:"boleto",reference:barcode.barcode,warning:"Código de barras identificado. Confira o beneficiário e vencimento manualmente."};
    throw new Error(detail?.error||"Não foi possível digitalizar o documento.");
  }
  if(!data||data.error)throw new Error(data?.error||"Leitura indisponível.");
  const scan=data as ExpenseScan;
  const validated=barcode||(scan.kind==="boleto"?readBoletoCode(scan.reference):null);
  if(validated){
    if(validated.amount!=null&&scan.amount!=null&&Math.abs(validated.amount-scan.amount)>0.005)scan.warning=[scan.warning,"Valor do código de barras diverge do texto. Confira o boleto."].filter(Boolean).join(" ");
    else if(validated.amount!=null&&scan.amount==null)scan.amount=validated.amount;
    scan.reference=validated.barcode;scan.kind="boleto";scan.payment="boleto";
  }
  return scan;
}

/** One bounded lookup after a scan, scoped to the company's RLS-protected payables. */
export async function findExpenseScanHints(org:string,scan:ExpenseScan,counterpartId?:string){
  let possibleDuplicate=false, categoryId:string|null=null;
  if(scan.amount!=null&&scan.issue_date&&(scan.document||scan.supplier||scan.reference)){
    const query=await supabase.from("financial_entries").select("description,counterpart_name_snapshot,counterpart_document_snapshot,notes")
      .eq("organization_id",org).eq("entry_type","payable").eq("issue_date",scan.issue_date).eq("original_amount",scan.amount)
      .is("cancelled_at",null).is("reversed_at",null).limit(30);
    const digits=scan.document.replace(/\D/g,""),name=normalize(scan.supplier),ref=scan.reference;
    possibleDuplicate=(query.data||[]).some((row:any)=>
      Boolean((digits&&String(row.counterpart_document_snapshot||"").replace(/\D/g,"")===digits)
      ||(name&&normalize(String(row.counterpart_name_snapshot||""))===name)
      ||(ref&&String(row.notes||"").split("\n").includes("Referência do documento: "+ref))));
  }
  if(counterpartId){
    const recent=await supabase.from("financial_entries").select("id").eq("organization_id",org).eq("entry_type","payable")
      .eq("counterpart_entity_id",counterpartId).is("cancelled_at",null).is("reversed_at",null).order("issue_date",{ascending:false}).limit(5);
    const ids=(recent.data||[]).map((r:any)=>r.id);
    if(ids.length){
      const allocations=await supabase.from("financial_allocations").select("category_id,financial_entry_id")
        .eq("organization_id",org).in("financial_entry_id",ids).limit(30);
      const byEntry=new Map<string,Set<string>>();
      for(const a of allocations.data||[]){const id=String(a.financial_entry_id);const values=byEntry.get(id)||new Set<string>();values.add(String(a.category_id));byEntry.set(id,values);}
      const single=[...byEntry.values()].filter(x=>x.size===1).map(x=>[...x][0]);
      if(single.length&&single.every(x=>x===single[0]))categoryId=single[0];
    }
  }
  return {possibleDuplicate,categoryId};
}
