// Small, dependency-free validation shared by Excel and CSV contact imports.
// Files are parsed in the browser and only name/phone pairs reach the server.

export type ContactImportEntry = {name:string;phone:string};
type Cell = string|number|boolean|Date|null|undefined;
export type ContactImportSummary = {
  entries:ContactImportEntry[];
  totalRows:number;
  invalidRows:number;
  duplicates:number;
  capped:boolean;
};

const folded=(value:string)=>value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

const nameHeader=(value:string)=>/^(nome|nome completo|nome do contato|contato|cliente|name|full name|contact name|nome fantasia|razao social)$/.test(value);
const phoneHeader=(value:string)=>/^(telefone|tel|fone|celular|whatsapp|whats app|numero|numero celular|mobile|cellphone|phone|phone number|numero de telefone)( [0-9]+| principal| comercial| pessoal| celular| whatsapp)?$/.test(value);

function textCell(value:Cell){
  if(value===null||value===undefined||value instanceof Date)return "";
  return String(value).trim();
}

function normalizeBrazilPhone(input:string){
  let digits=input.replace(/\D/g,"");
  if(digits.startsWith("00") && digits.length>13)digits=digits.slice(2);
  if(digits.startsWith("55") && digits.length>11)digits=digits.slice(2);
  // A Brazilian DDD (2 digits) followed by an 8 or 9 digit number.
  if(!/^[1-9][0-9][0-9]{8,9}$/.test(digits))return null;
  return "55"+digits;
}

export function parseContactTable(rows:Cell[][],limit=2000):ContactImportSummary{
  if(!Array.isArray(rows)||!rows.length)throw Error("A planilha está vazia.");
  let headerIndex=-1;
  let nameColumn=-1;
  let phoneColumns:number[]=[];
  for(let index=0;index<Math.min(rows.length,15);index++){
    const headings=(rows[index]||[]).map(cell=>folded(textCell(cell)));
    const name=headings.findIndex(nameHeader);
    const phones=headings.flatMap((item,column)=>phoneHeader(item)?[column]:[]);
    if(name>=0 && phones.length){
      headerIndex=index;nameColumn=name;phoneColumns=phones;break;
    }
  }
  if(headerIndex<0)throw Error("Não encontrei as colunas Nome e Telefone/Celular/WhatsApp. Confira o cabeçalho da planilha.");
  const normalized=new Map<string,ContactImportEntry>();
  let totalRows=0,invalidRows=0,duplicates=0;
  for(const row of rows.slice(headerIndex+1,10001)){
    if(!row||!row.some(cell=>textCell(cell)))continue;
    totalRows++;
    const name=textCell(row[nameColumn]).replace(/\s+/g," ").slice(0,160);
    const phone=phoneColumns.map(column=>normalizeBrazilPhone(textCell(row[column])))
      .find(Boolean);
    if(name.length<2 || !phone){invalidRows++;continue;}
    if(normalized.has(phone)){duplicates++;continue;}
    normalized.set(phone,{name,phone});
  }
  return {
    entries:[...normalized.values()].slice(0,limit),
    totalRows,invalidRows,duplicates,
    capped:normalized.size>limit || rows.length>10001,
  };
}

// RFC4180-style CSV, including quoted semicolons, commas and line breaks.
// Automatic separator selection supports Brazilian Excel exports (semicolon).
export function parseContactsCSV(text:string):string[][]{
  const sample=text.replace(/^\uFEFF/,"").slice(0,4096);
  let sep=";",max=-1;
  for(const candidate of [";","\t",","]){
    let count=0,quoted=false;
    for(const char of sample){
      if(char==='"')quoted=!quoted;
      else if(!quoted && char===candidate)count++;
      else if(!quoted && (char==="\n"||char==="\r"))break;
    }
    if(count>max){max=count;sep=candidate;}
  }
  const rows:string[][]=[];let row:string[]=[];let cell="";let quoted=false;
  const input=text.replace(/^\uFEFF/,"");
  for(let i=0;i<input.length;i++){
    const char=input[i];
    if(char==='"'){
      if(quoted && input[i+1]==='"'){cell+='"';i++;}
      else quoted=!quoted;
    }else if(char===sep && !quoted){row.push(cell);cell="";}
    else if((char==="\n"||char==="\r")&&!quoted){
      if(char==="\r"&&input[i+1]==="\n")i++;
      row.push(cell);rows.push(row);row=[];cell="";
      if(rows.length>10000)break;
    }else cell+=char;
  }
  if(quoted)throw Error("O CSV contém aspas não fechadas.");
  if(row.length || cell){row.push(cell);rows.push(row);}
  return rows;
}
