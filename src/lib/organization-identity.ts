import { supabase } from "./supabase";

let artvideoOrganizationIdPromise: Promise<string> | null = null;
let platformOperatorOrganizationIdPromise: Promise<string> | null = null;

function resolveOrganizationId(
  rpc: "artvideo_organization_id" | "platform_operator_organization_id",
  label: string,
  current: Promise<string> | null,
  assign: (value: Promise<string> | null) => void,
) {
  if (current) return current;

  const promise = (async () => {
    const { data, error } = await supabase.rpc(rpc);
    if (error) throw error;
    if (!data) throw new Error(`${label} não configurada.`);
    return String(data);
  })().catch(error => {
    assign(null);
    throw error;
  });

  assign(promise);
  return promise;
}

export function getArtVideoOrganizationId() {
  return resolveOrganizationId(
    "artvideo_organization_id",
    "Empresa ArtVideo",
    artvideoOrganizationIdPromise,
    value => { artvideoOrganizationIdPromise = value; },
  );
}

export function getPlatformOperatorOrganizationId() {
  return resolveOrganizationId(
    "platform_operator_organization_id",
    "Operadora Union World",
    platformOperatorOrganizationIdPromise,
    value => { platformOperatorOrganizationIdPromise = value; },
  );
}

export async function isArtVideoOrganizationId(organizationId?: string | null) {
  if (!organizationId) return false;
  return organizationId === await getArtVideoOrganizationId();
}

export async function isPlatformOperatorOrganizationId(organizationId?: string | null) {
  if (!organizationId) return false;
  return organizationId === await getPlatformOperatorOrganizationId();
}
