#!/usr/bin/env node
/**
 * Blocking check for a staging CRM build.
 * It reads build artifacts only; never accesses Supabase or any network.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const productionRef = "wmjmtcjpunmzvonlkjcu";
const stageRef = String(process.env.VITE_UNION_STAGING_PROJECT_ID || "").trim();
if (!/^[a-z0-9]{20}$/.test(stageRef) || stageRef === productionRef) {
  throw Error("Build rejeitado: ref de homologação ausente/inválido ou idêntico à produção.");
}
const dir = resolve(process.argv[2] || "dist-crm-staging");
let examined = 0, foundStaging = 0;
function walk(base) {
  for (const item of readdirSync(base, { withFileTypes: true })) {
    const file=join(base,item.name);
    if (item.isDirectory()) { walk(file); continue; }
    if (!item.isFile() || !/\.(js|html|css|json|map)$/.test(item.name)) continue;
    const body=readFileSync(file,"utf8");
    if (body.includes(productionRef)) throw Error("Build BLOQUEADO: referência ao Supabase real encontrada no artefato "+file);
    if (body.includes(stageRef)) foundStaging++;
    examined++;
  }
}
walk(dir);
if (!foundStaging) throw Error("Build de homologação não aponta para o Supabase de staging.");
console.log("Build de homologação verificado: "+examined+" arquivos, "+foundStaging+" contendo ref de staging, nenhuma ref de produção.");
