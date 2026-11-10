import { supabase } from "@/lib/supabase";
import { pbxRequest } from "./pbx-request";

export type ManagedPbxExtension = {
  number: number;
  endpoint_name: string;
  display_name: string;
  provisioning_status: "pending" | "applied" | "failed" | "manual";
};

const MANAGED_ENDPOINT = /^uw-[a-f0-9]{32}$/;

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i=0;i<view.length;i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}
function fromBase64(data: string): Uint8Array {
  const binary = atob(data);
  return Uint8Array.from(binary, ch=>ch.charCodeAt(0));
}

export async function findMyManagedPbxExtension(organizationId: string, signal?: AbortSignal) {
  const {data,error}=await pbxRequest(requestSignal => supabase.rpc("pbx_my_assigned_extension", {
    p_organization_id:organizationId,
  }).abortSignal(requestSignal), 'Consulta do ramal vinculado', { signal });
  if(error) throw new Error("Não foi possível consultar o ramal vinculado.");
  const extension=(Array.isArray(data)?data[0]:null) as ManagedPbxExtension | undefined;
  if(!extension || !MANAGED_ENDPOINT.test(extension.endpoint_name)) return null;
  return extension;
}

export async function acquireManagedPbxCredentials(
  organizationId: string,
  cancelled: () => boolean,
  progress: (message: string) => void,
  signal?: AbortSignal,
): Promise<{username: string; password: string}> {
  if (!window.isSecureContext || !window.crypto?.subtle) {
    throw new Error("A conexão automática requer HTTPS e criptografia do navegador.");
  }

  // 2048-bit RSA-OAEP SHA-256: a chave privada nunca sai desta aba.
  // O agente da VPS possui somente a chave pública e entrega apenas ciphertext.
  const deadline = Date.now() + 115_000;
  const requestTimeout = () => Math.max(1, Math.min(15_000, deadline - Date.now()));
  const keys = await pbxRequest(() => window.crypto.subtle.generateKey({
    name:"RSA-OAEP",
    modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]),
    hash:"SHA-256",
  },false,["encrypt","decrypt"]), 'Preparação da criptografia', { signal });

  if(cancelled()) throw new Error("Solicitação cancelada.");
  const publicKey = toBase64(await window.crypto.subtle.exportKey("spki",keys.publicKey));
  const {data:requestId,error}=await pbxRequest(requestSignal => supabase.rpc("pbx_request_browser_login",{
    p_organization_id:organizationId,
    p_public_key_base64:publicKey,
  }).abortSignal(requestSignal), 'Solicitação da credencial', { signal, timeoutMs: requestTimeout() });
  if(cancelled()) throw new Error("Solicitação cancelada.");
  if(error||typeof requestId!=="string") {
    throw new Error(error?.message || "Não foi possível solicitar a credencial do ramal.");
  }

  progress("Aguardando a entrega criptografada da VPS...");
  for(let attempt=0;attempt<38;attempt++){
    if(cancelled()) throw new Error("Solicitação cancelada.");
    if (Date.now() >= deadline) break;
    const result=await pbxRequest(requestSignal => supabase.rpc("pbx_take_browser_login", {p_request_id:requestId}).abortSignal(requestSignal),
      'Entrega da credencial pela VPS', { signal, timeoutMs: requestTimeout() });
    if(cancelled()) throw new Error("Solicitação cancelada.");
    if(result.error) throw new Error("Não foi possível validar a autorização do ramal.");
    const item=Array.isArray(result.data)?result.data[0]:null;
    if(item?.status==="ready" && typeof item.encrypted_secret==="string"){
      if(!MANAGED_ENDPOINT.test(String(item.endpoint_name||""))) {
        throw new Error("Identidade SIP inesperada. A conexão foi bloqueada.");
      }
      const ciphertext=fromBase64(item.encrypted_secret);
      const decrypted=await window.crypto.subtle.decrypt({name:"RSA-OAEP"},keys.privateKey,ciphertext as BufferSource);
      const password=new TextDecoder().decode(decrypted);
      if(!/^[A-Za-z0-9_-]{35,100}$/.test(password)) throw new Error("Credencial SIP inválida.");
      return {username:item.endpoint_name,password};
    }
    if(item?.status!=="pending") throw new Error("Solicitação expirada. Verifique o vínculo do funcionário e tente novamente.");
    await new Promise<void>(resolve=>window.setTimeout(resolve,3000));
  }
  throw new Error("A VPS não respondeu ao pedido. Verifique se o agente está executando.");
}
