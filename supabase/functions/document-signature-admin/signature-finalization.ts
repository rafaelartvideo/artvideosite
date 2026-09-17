function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function publicBaseUrl(request: Request) {
  const configured = text(Deno.env.get("SIGNATURE_PUBLIC_BASE_URL") || Deno.env.get("SITE_URL") || Deno.env.get("APP_URL"), 500);
  const fallback = text(request.headers.get("origin"), 500);
  const value = (configured || fallback).replace(/\/+$/, "");
  return /^https?:\/\//i.test(value) ? value : null;
}

export async function finalizeEmployeeOnlyRequest(request: Request, requestId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) throw new Error("Supabase da finalização de assinatura não configurado.");
  const origin = publicBaseUrl(request);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${serviceRole}`,
    apikey: serviceRole,
    "Content-Type": "application/json",
  };
  if (origin) headers.Origin = origin;
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/document-signature-public`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "finalize_internal", request_id: requestId }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) {
    throw new Error(String(result?.error || "Não foi possível gerar o PDF final do documento."));
  }
  return result;
}

export async function createAdminSignedDocumentAccess(adminClient: any, request: Request, row: any) {
  if (row?.status !== "signed" || !row?.final_pdf_storage_path || !row?.final_pdf_hash) {
    throw new Error("O PDF final deste documento ainda não está disponível.");
  }
  const { data, error } = await adminClient.storage.from("signed-documents").createSignedUrl(row.final_pdf_storage_path, 10 * 60);
  if (error || !data?.signedUrl) throw error || new Error("Não foi possível preparar o PDF assinado.");
  const base = publicBaseUrl(request);
  const verificationPath = `/verificar-documento/${encodeURIComponent(String(row.verification_code || ""))}`;
  return {
    download_url: data.signedUrl,
    verification_url: base ? `${base}${verificationPath}` : verificationPath,
    verification_code: row.verification_code,
    final_pdf_hash: row.final_pdf_hash,
    snapshot_hash: row.snapshot_hash,
    signed_at: row.signed_at,
  };
}
