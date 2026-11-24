// Independent worker and management gateway. Run under a dedicated OS user.
// Bind to loopback only; place HTTPS reverse proxy in front of /history-import.
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { openArchiveStore,makeReader } from "./archive-store.mjs";
const env=process.env;
const store=openArchiveStore(env.UNION_HISTORY_DB||"/var/lib/union-history/index.sqlite",
  makeReader({rclone:env.UNION_HISTORY_RCLONE||"rclone",config:env.UNION_HISTORY_RCLONE_CONFIG}));
if(process.argv[2]==="worker"){
  // A single systemd instance is required; never start multiple workers.
  let stop=false;process.on("SIGTERM",()=>{stop=true});process.on("SIGINT",()=>{stop=true});
  while(!stop){
    try{const worked=store.tick();await new Promise(r=>setTimeout(r,worked?1500:5000))}
    catch{console.error("Falha no ciclo de importação; índice preservado.");await new Promise(r=>setTimeout(r,15000))}
  }
  store.close();
}else if(process.argv[2]==="gateway"){
  const secret=env.UNION_HISTORY_GATEWAY_SECRET||"";
  if(secret.length<32)throw Error("Chave de gateway ausente.");
  const nonces=new Map();
  const respond=(res,status,value)=>{
    res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
    res.end(JSON.stringify(value));
  };
  const server=createServer(async(req,res)=>{
    if(req.method!=="POST"||req.url!=="/history-import")return respond(res,404,{success:false});
    try{
      let length=0;const chunks=[];
      for await(const chunk of req){length+=chunk.length;if(length>16384){respond(res,413,{success:false});req.destroy();return}chunks.push(chunk)}
      const raw=Buffer.concat(chunks).toString("utf8");
      const ts=req.headers["x-union-timestamp"],nonce=req.headers["x-union-nonce"],sig=req.headers["x-union-signature"];
      const time=Date.now();
      for(const [key,expires] of nonces)if(expires<time)nonces.delete(key);
      if(typeof ts!=="string"||!/^\d{13}$/.test(ts)||Math.abs(time-Number(ts))>30000||typeof nonce!=="string"||!/^[a-f0-9-]{36}$/i.test(nonce)||nonces.has(nonce)||nonces.size>=10000||typeof sig!=="string"||!/^[a-f0-9]{64}$/.test(sig))return respond(res,401,{success:false});
      const expected=createHmac("sha256",secret).update(ts+"."+nonce+"."+raw).digest();
      if(!timingSafeEqual(expected,Buffer.from(sig,"hex")))return respond(res,401,{success:false});
      nonces.set(nonce,time+60000);
      const b=JSON.parse(raw);let result;
      switch(b.action){
        case "list":result=store.list(b.organizationId);break;
        case "grant":store.grantPackage(b.packageId,b.organizationId,b.actor);result={granted:true};break;
        case "prepare":result={id:store.prepare(b)};break;
        case "control":result={state:store.control({...b,action:b.command})};break;
        case "status":result=store.status(b.id,b.organizationId);break;
        case "events":result=store.events(b.id,b.organizationId);break;
        default:return respond(res,400,{success:false,error:"Operação inválida."});
      }
      return respond(res,200,{success:true,result});
    }catch{ return respond(res,409,{success:false,error:"Operação bloqueada ou indisponível. Confira o estado da importação."}); }
  });
  server.requestTimeout=30000;server.headersTimeout=10000;
  server.listen(Number(env.UNION_HISTORY_PORT||19091),"127.0.0.1");
}else throw Error("Escolha gateway ou worker.");
