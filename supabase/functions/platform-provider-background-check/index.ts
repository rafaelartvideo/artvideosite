import { createClient } from "npm:@supabase/supabase-js@2.112.3";

type Source = "policia_federal" | "justica_estadual";
type Result = "processing" | "negative" | "review" | "inconclusive" | "error";
type BasicRecord = Record<string, unknown>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const DIRECTDATA_TOKEN = Deno.env.get("DIRECTDATA_API_TOKEN") || "";
const TJ_UFS = new Set(["AC","AM","BA","CE","DF","ES","GO","MT","PA","PB","PE","PI","RN","RR","RS","SE","TO"]);
const allowedSources = new Set<string>(["policia_federal","justica_estadual"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function reply(body: BasicRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const trim = (value: unknown, max = 150) => String(value ?? "").trim().slice(0, max);
function isCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  for (const length of [9,10]) {
    const sum = Array.from(value.slice(0,length),Number).reduce((acc,d,i)=>acc+d*(length+1-i),0);
    const check = (sum * 10) % 11;
    if ((check === 10 ? 0 : check) !== Number(value[length])) return false;
  }
  return true;
}
function sourceStatus(value: unknown) {
  return trim(value,100).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
function flag(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (typeof value === "number" && (value === 0 || value === 1)) return Boolean(value);
  const s = sourceStatus(value);
  if (["NAO","N","FALSE","0","NEGATIVA","NADA CONSTA"].includes(s)) return false;
  if (["SIM","S","TRUE","1","POSITIVA"].includes(s)) return true;
  return null;
}
function dateOnly(value: unknown): string | null {
  const s = trim(value,20);
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  const iso = dmy ? dmy[3] + "-" + dmy[2] + "-" + dmy[1] : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const dt = new Date(iso + "T00:00:00Z");
  return !Number.isNaN(dt.valueOf()) && dt.toISOString().slice(0,10) === iso ? iso : null;
}
function normalizedName(value: unknown) {
  return trim(value,160).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ");
}
function interpretResult(source: Source, body: BasicRecord, cpf: string, name: string, uf: string) {
  const data = body.retorno && typeof body.retorno === "object" && !Array.isArray(body.retorno)
    ? body.retorno as BasicRecord : null;
  if (!data) return {
    result: "inconclusive" as Result, source_status: "Resposta sem certidão conclusiva",
    certificate_number: null, validation_code: null,
    issue_date: null, valid_until: null,
    provider_request_id: trim((body.metaDados as BasicRecord | undefined)?.consultaUid,100) || null,
    error_reason: "Não foi possível confirmar a emissão. Verificar manualmente.",
  };
  const returnedDoc = digits(source === "policia_federal" ? data.cpf : data.documentoConsultado);
  const returnedName = normalizedName(source === "policia_federal" ? data.nome : data.nomeEntidade);
  const status = sourceStatus(data.status);
  const hasRecord = flag(source === "policia_federal" ? data.possuiAntecedentesCriminais : data.possuiOcorrencia);
  const stateReturned = sourceStatus(data.uf);
  let result: Result = "inconclusive";
  if (returnedDoc && returnedDoc !== cpf) result = "review";
  else if (source === "policia_federal" && returnedName && returnedName !== normalizedName(name)) result = "review";
  else if (source === "justica_estadual" && stateReturned && stateReturned !== uf) result = "review";
  else if (hasRecord === true || /POSITIV|CONSTA/.test(status) && !/NADA CONSTA|NAO CONSTA/.test(status)) result = "review";
  else if (hasRecord === false && /NEGATIV|NADA CONSTA|NAO CONSTA/.test(status)) result = "negative";
  else if (hasRecord === false && trim(data.numeroCertidao) && !/PENDENT|ERRO|INVALID/.test(status)) result = "negative";
  return {
    result,
    source_status: status || "Não informado",
    certificate_number: trim(data.numeroCertidao,100) || null,
    validation_code: trim(data.codigoValidacao,100) || null,
    issue_date: dateOnly(data.dataEmissao),
    valid_until: dateOnly(data.dataValidade),
    provider_request_id: trim((body.metaDados as BasicRecord | undefined)?.consultaUid,100) || null,
    error_reason: result === "inconclusive" ? "A fonte não retornou resultado conclusivo; conferir a certidão." : null,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "Método não permitido." },405);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) return reply({ error: "Servidor indisponível." },503);
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!bearer) return reply({ error: "Acesso não autenticado." },401);

  const authClient = createClient(SUPABASE_URL,ANON_KEY,{ auth:{persistSession:false,autoRefreshToken:false} });
  const {data:authData,error:authError} = await authClient.auth.getUser(bearer);
  if (authError || !authData.user) return reply({ error: "Sessão inválida." },401);

  const actingClient = createClient(SUPABASE_URL,ANON_KEY,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{ headers:{ Authorization: "Bearer " + bearer } },
  });
  const {data:organizationId,error:orgError} = await actingClient.rpc("platform_operator_organization_id");
  if (orgError || !organizationId) return reply({ error: "Organização Union indisponível." },503);
  const {data:permissions,error:permError} = await actingClient.rpc("my_organization_permissions",{
    p_organization_id: organizationId,
  });
  if (permError || !Array.isArray(permissions) ||
    !permissions.some((row:BasicRecord)=>row.permission_key==="platform.providers.check")) {
    return reply({ error: "Você não possui permissão para consultar antecedentes." },403);
  }

  let payload: BasicRecord;
  try { payload = await request.json() as BasicRecord; }
  catch { return reply({ error: "Solicitação inválida." },400); }

  const providerId = trim(payload.providerId,40);
  const source = trim(payload.source,30) as Source;
  const purpose = trim(payload.purpose,300);
  if (!uuidPattern.test(providerId) || !allowedSources.has(source)) {
    return reply({ error: "Prestador ou fonte inválidos." },400);
  }
  if (payload.informedDeclaration !== true || purpose.length < 10) {
    return reply({ error: "Confirme a informação ao prestador e registre a finalidade legítima." },400);
  }
  if (!DIRECTDATA_TOKEN) {
    return reply({ error: "A integração Direct Data ainda não foi configurada no Supabase." },503);
  }
  const motherName = trim(payload.motherName,160);
  const fatherName = trim(payload.fatherName,160);
  const rg = trim(payload.rg,35);
  const birthDate = trim(payload.birthDate,10);
  if (birthDate && !dateOnly(birthDate)) return reply({ error: "Data de nascimento inválida." },400);

  const admin = createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:provider,error:providerError} = await admin
    .from("platform_service_providers").select("id,organization_id,name,document,state")
    .eq("id",providerId).eq("organization_id",organizationId).maybeSingle();
  if (providerError || !provider) return reply({ error: "Prestador não encontrado." },404);
  const cpf = digits(provider.document);
  if (!isCpf(cpf)) return reply({ error: "Cadastre um CPF válido no prestador antes de consultar." },422);
  const name = trim(provider.name,160);
  if (name.split(/\s+/).length < 2) return reply({ error: "Informe o nome completo do prestador." },422);
  const uf = source === "justica_estadual" ? trim(provider.state,2).toUpperCase() : "";
  if (source === "justica_estadual" && !TJ_UFS.has(uf)) {
    return reply({ error: "A certidão criminal do TJ desta UF não está confirmada neste provedor." },422);
  }
  const {data:recent,error:recentError} = await admin.from("platform_provider_background_checks")
    .select("id,result,request_date").eq("provider_id",providerId).eq("source",source).eq("uf",uf)
    .gte("request_date",new Date(Date.now()-10*60*1000).toISOString())
    .order("request_date",{ascending:false}).limit(1);
  if (recentError) return reply({ error: "Não foi possível validar consultas recentes." },503);
  if ((recent||[]).length > 0) {
    return reply({ error: "Já houve uma tentativa nesta fonte nos últimos dez minutos. Consulte o histórico para evitar cobranças duplicadas." },409);
  }

  const {data:check,error:checkError} = await admin.from("platform_provider_background_checks").insert({
    organization_id:organizationId,provider_id:providerId,source,uf,result:"processing",
    requested_by:authData.user.id,purpose,informed_declaration:true,
  }).select("id").single();
  if (checkError || !check) return reply({error:"Já existe consulta em andamento ou não foi possível registrar auditoria."},409);

  try {
    const endpoint = source === "policia_federal"
      ? "https://apiv3.directd.com.br/api/PoliciaFederalAntecedentesCriminais"
      : "https://apiv3.directd.com.br/api/TJCertidaoCivelCriminalFiscal";
    const url = new URL(endpoint);
    url.searchParams.set("Cpf",cpf);
    url.searchParams.set("Nome",name);
    if (motherName) url.searchParams.set("NomeMae",motherName);
    if (fatherName) url.searchParams.set("NomePai",fatherName);
    if (birthDate) url.searchParams.set("DataNascimento",birthDate);
    if (source === "justica_estadual") {
      url.searchParams.set("UF",uf);
      url.searchParams.set("Tipo","Criminal");
      if (rg) url.searchParams.set("RG",rg);
    }
    const remote = await fetch(url.toString(),{
      method:"GET",headers:{Authorization:"Bearer "+DIRECTDATA_TOKEN,Accept:"application/json"},
      signal:AbortSignal.timeout(25000),
    });
    if (!remote.ok) throw new Error("Provider HTTP " + remote.status);
    const data = await remote.json() as BasicRecord;
    const parsed = interpretResult(source,data,cpf,name,uf);
    const {error:updateError} = await admin.from("platform_provider_background_checks")
      .update({...parsed, completed_at:new Date().toISOString()}).eq("id",check.id);
    if (updateError) throw new Error("Unable to record verification result");
    return reply({success:true,checkId:check.id,result:parsed.result,source_status:parsed.source_status,
      certificate_number:parsed.certificate_number,valid_until:parsed.valid_until});
  } catch {
    await admin.from("platform_provider_background_checks")
      .update({result:"error",error_reason:"Falha na consulta ou gravação; verificar antes de repetir.",
        completed_at:new Date().toISOString()}).eq("id",check.id);
    return reply({ error: "A consulta não pôde ser concluída. Confira o histórico antes de repetir; a fonte pode ter registrado cobrança." },502);
  }
});
