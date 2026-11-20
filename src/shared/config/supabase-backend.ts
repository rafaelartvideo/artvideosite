/**
 * Seleção de backend por BUILD.
 *
 * Produção continua lendo o arquivo autogerado original.
 * Homologação exige projeto e chave próprios; não há fallback para produção.
 * Não expor service_role aqui.
 */
import { projectId as productionProjectId, publicAnonKey as productionPublicAnonKey } from "../../../utils/supabase/info";

const isStaging = import.meta.env.MODE === "crm-staging";
const stageProjectId = String(import.meta.env.VITE_UNION_STAGING_PROJECT_ID || "").trim();
const stagePublicAnonKey = String(import.meta.env.VITE_UNION_STAGING_PUBLIC_ANON_KEY || "").trim();
if (isStaging && (!/^[a-z0-9]{20}$/.test(stageProjectId)
  || stageProjectId === productionProjectId
  || stagePublicAnonKey.length < 20)) {
  throw new Error("Build de homologação sem backend isolado: configure credenciais publicáveis STAGING.");
}

export const projectId = isStaging ? stageProjectId : productionProjectId;
export const publicAnonKey = isStaging ? stagePublicAnonKey : productionPublicAnonKey;
export const isHomologation = isStaging;
