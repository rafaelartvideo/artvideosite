// Parse locally: names, phone numbers and the original file never go to logs,
// external spreadsheet services, localStorage or sessionStorage.
export type ContactImportEntry = {name:string;phone:string};
type Cell = string|number|boolean|Date|null|undefined;
export type ContactImportSummary = {
  entries:ContactImportEntry[];
  totalRows:number;
  invalidRows:number;
  unsupportedCountries:number;
  duplicates:number;
  capped:boolean;
  layout:"headed"|"without_header";
};

export const MAX_CONTACT_IMPORT_ROWS=100000;
export const MAX_CONTACT_IMPORT_CONTACTS=50000;
export const CONTACT_IMPORT_BATCH_SIZE=250;

const folded=(value:string)=>value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const nameHeader=(v:string)=>/^(nome|nome completo|nome do contato|contato|cliente|name|full name|contact name|nome fantasia|razao social)$/.test(v);
const codeHeader=(v:string)=>/^(ddi|dd internacional|codigo pais|codigo do pais|cod pais|country code|country calling code|calling code|prefixo internacional|prefixo do pais|cod do pais|pais)$/.test(v);
const phoneHeader=(v:string)=>/^(telefone|tel|fone|celular|whatsapp|whats app|numero|numero celular|mobile|cellphone|phone|phone number|numero de telefone)( [0-9]+| principal| comercial| pessoal| celular| whatsapp)?$/.test(v);
const textCell=(v:Cell)=>v===null||v===undefined||v instanceof Date?"":String(v).trim();
const digits=(v:string)=>v.replace(/\D/g,"");

function normalizePhone(raw:string,ddi?:string){
  if(!raw)return {phone:null as string|null,unsupported:false};
  const country=ddi?digits(ddi):"";
  // The importer currently validates Brazilian telephone numbering.
  // Never concatenate an unknown international prefix as though it were +55.
  if(country && country!=="55"){
    return {phone:null,unsupported:true};
  }
  let number=digits(raw);
  if(number.startsWith("00") && number.length>13)number=number.slice(2);
  if(number.startsWith("55") && number.length>11)number=number.slice(2);
  if(!/^[1-9][0-9][0-9]{8,9}$/.test(number))return {phone:null,unsupported:false};
  return {phone:"55"+number,unsupported:false};
}

export function parseContactTable(
  rows:Cell[][],limit=MAX_CONTACT_IMPORT_CONTACTS,
):ContactImportSummary{
  if(!Array.isArray(rows)||!rows.length)throw Error("A planilha está vazia.");
  if(rows.length>MAX_CONTACT_IMPORT_ROWS+1)
    throw Error("O arquivo ultrapassa o limite de 100.000 linhas. Divida a planilha em partes menores.");
  let headerIndex=-1,nameColumn=-1,ddiColumn=-1,phoneColumns:number[]=[];
  for(let i=0;i<Math.min(rows.length,25);i++){
    const headings=(rows[i]||[]).map(v=>folded(textCell(v)));
    const n=headings.findIndex(nameHeader);
    const phones=headings.flatMap((v,j)=>phoneHeader(v)?[j]:[]);
    if(n>=0 && phones.length){
      headerIndex=i;nameColumn=n;ddiColumn=headings.findIndex(codeHeader);
      phoneColumns=phones;break;
    }
  }
  let layout:ContactImportSummary["layout"]="headed";
  if(headerIndex<0){
    // Files exported with three positional columns and no header:
    // Rafael | 55 | 79988037605. Also support Nome | Telefone.
    const first=rows.findIndex(row=>row?.some(v=>textCell(v)));
    if(first<0)throw Error("A planilha está vazia.");
    const cells=rows[first]||[];
    const isDataName=textCell(cells[0]).length>=2 && !nameHeader(folded(textCell(cells[0])));
    if(!isDataName)throw Error("Não encontrei as colunas Nome, DDI e Número. Confira a planilha.");
    if(cells.length>=3 && /^\+?55$/.test(textCell(cells[1])) &&
        digits(textCell(cells[2])).length>=10){
      nameColumn=0;ddiColumn=1;phoneColumns=[2];
    }else if(cells.length>=2 && digits(textCell(cells[1])).length>=10){
      nameColumn=0;ddiColumn=-1;phoneColumns=[1];
    }else{
      throw Error("Formato não reconhecido. Use Nome | Código do país | Número, ou colunas com cabeçalho.");
    }
    headerIndex=first-1;layout="without_header";
  }
  const unique=new Map<string,ContactImportEntry>();
  let totalRows=0,invalidRows=0,duplicates=0,unsupportedCountries=0;
  for(let i=headerIndex+1;i<rows.length;i++){
    const row=rows[i]||[];
    if(!row.some(v=>textCell(v)))continue;
    totalRows++;
    const name=textCell(row[nameColumn]).replace(/\s+/g," ").slice(0,160);
    const country=ddiColumn>=0?textCell(row[ddiColumn]):"";
    let phone:string|null=null,unsupported=false;
    for(const col of phoneColumns){
      const result=normalizePhone(textCell(row[col]),country);
      unsupported ||= result.unsupported;
      if(result.phone){phone=result.phone;break;}
    }
    if(unsupported && !phone){unsupportedCountries++;continue;}
    if(name.length<2||!phone){invalidRows++;continue;}
    if(unique.has(phone)){duplicates++;continue;}
    if(unique.size<limit)unique.set(phone,{name,phone});
  }
  if(totalRows===0)throw Error("Nenhuma linha com dados foi encontrada.");
  return {
    entries:[...unique.values()],totalRows,invalidRows,duplicates,
    unsupportedCountries,capped:totalRows-invalidRows-unsupportedCountries-duplicates>limit,layout,
  };
}

// RFC 4180 parsing, including quoted separators/newlines and UTF-8 BOM.
export function parseContactsCSV(text:string):string[][]{
  const input=text.replace(/^\uFEFF/,"");
  const first=input.slice(0,8192);
  let sep=";",highest=-1;
  for(const candidate of [";","\t",","]){
    let count=0,quoted=false;
    for(let i=0;i<first.length;i++){
      const ch=first[i];
      if(ch==='"' && first[i+1]==='"' && quoted){i++;continue;}
      if(ch==='"')quoted=!quoted;
      else if(!quoted&&ch===candidate)count++;
      else if(!quoted&&(ch==="\n"||ch==="\r"))break;
    }
    if(count>highest){sep=candidate;highest=count;}
  }
  const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;
  for(let i=0;i<input.length;i++){
    const ch=input[i];
    if(ch==='"'){
      if(quoted&&input[i+1]==='"'){cell+='"';i++;}
      else quoted=!quoted;
    }else if(ch===sep&&!quoted){row.push(cell);cell="";}
    else if((ch==="\r"||ch==="\n")&&!quoted){
      if(ch==="\r"&&input[i+1]==="\n")i++;
      row.push(cell);rows.push(row);row=[];cell="";
      if(rows.length>MAX_CONTACT_IMPORT_ROWS+1)
        throw Error("O arquivo CSV ultrapassa o limite de 100.000 linhas.");
    }else cell+=ch;
  }
  if(quoted)throw Error("O CSV contém aspas não fechadas.");
  if(row.length||cell){row.push(cell);rows.push(row);}
  return rows;
}
