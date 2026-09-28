import { supabase } from "./supabase";

let artvideoOrganizationIdPromise: Promise<string> | null = null;
let platformOperatorOrganizationIdPromise: Promise<string> | null = null;

function resolveOrganizationId(
  rpcName: "artvideo_organization_id" | "platform_operator_organization_id",
  current: Promise<string> | null,
  reset: () => void,
) {
  if (current) return current;

  const request = (async () => {
    const { data, error } = await supabase.rpc(rpcName);
    if (error) throw error;
    if (!data) throw new Error(
      rpcName === "artvideo_organization_id"
        ? "Tenant ArtVideo não configurado."
        : "Operadora Union World não configurada.",
    );
    return String(data);
  })().catch(error => {
    reset();
    throw error;
  });

  return request;
}

export function getArtVideoOrganizationId() {
  artvideoOrganizationIdPromise = resolveOrganizationId(
    "artvideo_organization_id",
    artvideoOrganizationIdPromise,
    () => { artvideoOrganizationIdPromise = null; },
  );
  return artvideoOrganizationIdPromise;
}

export function getPlatformOperatorOrganizationId() {
  platformOperatorOrganizationIdPromise = resolveOrganizationId(
    "platform_operator_organization_id",
    platformOperatorOrganizationIdPromise,
    () => { platformOperatorOrganizationIdPromise = null; },
  );
  return platformOperatorOrganizationIdPromise;
}
