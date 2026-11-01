import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const BUCKET = "sac-digital-attachments";

const baseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "range, content-type",
  "Cache-Control": "private, max-age=300",
};

function textResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: baseHeaders });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return textResponse("Método não permitido.", 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return textResponse("Indisponível.", 503);

  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const slugIndex = parts.lastIndexOf("sac-digital-media");
  const organizationId = slugIndex >= 0 ? decodeURIComponent(parts[slugIndex + 1] || "") : "";
  const mediaParts = slugIndex >= 0 ? parts.slice(slugIndex + 2).map(part => decodeURIComponent(part)) : [];
  // Retrocompatível com /<uuid>-nome.pdf e novo /<uuid>/<nome.pdf>.
  // UUID identifica o objeto privado, mas nunca é exposto no nome enviado.
  const hasDisplayName = mediaParts.length === 2;
  const objectId = hasDisplayName ? mediaParts[0] : "";
  const originalFileName = hasDisplayName ? mediaParts[1] : mediaParts[0] || "";
  const fileName = hasDisplayName ? `${objectId}-${originalFileName}` : originalFileName;
  const displayName = hasDisplayName ? originalFileName
    : fileName.replace(/^[0-9a-f]{8}-[0-9a-f-]{27}-/i, "");

  if (!isUuid(organizationId)) return textResponse("Empresa inválida.", 400);
  if (
    ![1, 2].includes(mediaParts.length)
    || (hasDisplayName && !isUuid(objectId))
    || !originalFileName
    || originalFileName.length > 120
    || originalFileName.includes("/")
    || originalFileName.includes("\\")
    || originalFileName.includes("..")
    || !/^[A-Za-z0-9._-]+$/.test(originalFileName)
    || fileName.length > 220
    || !/^[0-9a-f-]{36}-[A-Za-z0-9._-]+$/i.test(fileName)
  ) {
    return textResponse("Arquivo inválido.", 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const storagePath = `${organizationId}/${fileName}`;
  const { data, error } = await admin.storage.from(BUCKET).download(storagePath);

  if (error || !data) {
    return textResponse("Arquivo não encontrado.", 404);
  }

  const headers = new Headers(baseHeaders);
  headers.set("Content-Type", data.type || "application/octet-stream");
  headers.set("Content-Length", String(data.size));
  headers.set("Content-Disposition", `inline; filename="${displayName.replace(/"/g, "")}"`);

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  return new Response(data, { status: 200, headers });
});
