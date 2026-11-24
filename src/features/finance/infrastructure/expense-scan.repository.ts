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
export async function scanExpenseDocument(org:string,file:File,categories:string[]):Promise<ExpenseScan>{
  if(file.size>25*1024*1024)throw new Error("Selecione um documento de até 25 MB.");
  if(/\.xml$/i.test(file.name)||file.type==="application/xml"||file.type==="text/xml"){
    if(file.size>2_000_000)throw new Error("XML de até 2 MB.");
    return readInvoiceXml(await file.text());
  }
  const isPdf=file.type==="application/pdf"||/\.pdf$/i.test(file.name);
  const normalized=isPdf?(file.type==="application/pdf"?file:new File([file],file.name,{type:"application/pdf"})):await prepareImageForUpload(file,"document-image",2_000_000);
  if(normalized.size>2_000_000||!["image/jpeg","image/png","image/webp","application/pdf"].includes(normalized.type))throw new Error("Selecione uma foto JPG, PNG, WEBP ou PDF de até 2 MB.");
  const {data,error}=await supabase.functions.invoke("union-ai-expense",{body:{organization_id:org,document:await readDataUrl(normalized),categories}});
  if(error){
    const detail=await (error as {context?:Response}).context?.clone().json().catch(()=>null);
    throw new Error(detail?.error||"Não foi possível digitalizar o documento.");
  }
  if(!data||data.error)throw new Error(data?.error||"Leitura indisponível.");
  return data as ExpenseScan;
}
