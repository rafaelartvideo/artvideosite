// Tenant-scoped persistent avatar cache. No public bucket or WuzAPI tokens.
// Image bytes are kept in private Supabase Storage, never in Postgres rows.
const BUCKET = "union-whatsapp-media";
const MAX_BYTES = 200 * 1024;
const IMAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY_TTL_MS = 24 * 60 * 60 * 1000;
const SIGNED_URL_SECONDS = 7200;
type AvatarChannel = { id: string; phone: string };
type AvatarContent = { bytes: Uint8Array; mime: string };

async function bytesFromPhoto(photo: string): Promise<AvatarContent | null> {
  const encoded = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);
  if (encoded) {
    if (encoded[2].length > 270000) return null;
    const decoded = atob(encoded[2]);
    if (!decoded.length || decoded.length > MAX_BYTES) return null;
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    return { bytes, mime: encoded[1] };
  }
  try {
    const url = new URL(photo);
    const host = url.hostname;
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !(host === "pps.whatsapp.net" || host.endsWith(".whatsapp.net") ||
        host === "fbcdn.net" || host.endsWith(".fbcdn.net"))) return null;
    const response = await fetch(url, {redirect: "error", signal: AbortSignal.timeout(7000)});
    const mime = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!response.ok || !["image/jpeg","image/png","image/webp"].includes(mime) ||
      Number(response.headers.get("content-length") || "0") > MAX_BYTES || !response.body) return null;
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_BYTES) {
          await reader.cancel();
          return null;
        }
        parts.push(value);
      }
    } finally {reader.releaseLock();}
    if (!total) return null;
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return { bytes, mime };
  } catch { return null; }
}

export async function cachedWhatsAppAvatar(
  admin: any, organizationId: string, channel: AvatarChannel, jid: string,
  fetchProviderPhoto: () => Promise<string>
): Promise<string | null> {
  const scope = {organization_id:organizationId, channel_id:channel.id,
    account_phone:channel.phone, chat_jid:jid};
  const prefix = organizationId + "/" + channel.id + "/avatars/";
  const {data:cached, error:readError} = await admin.from("union_whatsapp_avatar_cache")
    .select("storage_path,checked_at").eq("organization_id",organizationId)
    .eq("channel_id",channel.id).eq("account_phone",channel.phone)
    .eq("chat_jid",jid).maybeSingle();
  if (readError) throw readError;
  const oldPath = typeof cached?.storage_path === "string" &&
    cached.storage_path.startsWith(prefix) ? cached.storage_path : null;
  const signed = async (path:string|null):Promise<string|null> => {
    if (!path) return null;
    const {data,error} = await admin.storage.from(BUCKET).createSignedUrl(path,SIGNED_URL_SECONDS);
    return error ? null : data?.signedUrl || null;
  };
  const age = Date.now() - Date.parse(String(cached?.checked_at || ""));
  if (cached && Number.isFinite(age) && age >= 0 &&
    age < (oldPath ? IMAGE_TTL_MS : EMPTY_TTL_MS)) return await signed(oldPath);
  const remember = async (path:string|null) => {
    const {error} = await admin.from("union_whatsapp_avatar_cache").upsert(
      {...scope,storage_path:path,checked_at:new Date().toISOString()},
      {onConflict:"organization_id,channel_id,account_phone,chat_jid"});
    if (error) console.warn("whatsapp_avatar_cache_write_failed");
  };
  let photo:string;
  try {photo=await fetchProviderPhoto();}
  catch {
    // A failed/offline provider must not cause requests on every render.
    await remember(oldPath);
    return await signed(oldPath);
  }
  if (!photo) {
    await remember(oldPath);
    return await signed(oldPath);
  }
  const image=await bytesFromPhoto(photo);
  if (image) {
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder()
      .encode(channel.phone + ":" + jid));
    const hash=Array.from(new Uint8Array(digest))
      .map(byte=>byte.toString(16).padStart(2,"0")).join("");
    const path=prefix+hash;
    const {error:uploadError}=await admin.storage.from(BUCKET).upload(path,image.bytes,{
      contentType:image.mime,upsert:true,cacheControl:"86400",
    });
    if (!uploadError) {
      await remember(path);
      return await signed(path);
    }
    console.warn("whatsapp_avatar_cache_upload_failed");
  }
  // The fallback stays ephemeral; no expiring WhatsApp CDN URL is stored.
  return await signed(oldPath) || photo;
}
