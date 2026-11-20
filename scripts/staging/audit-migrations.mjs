#!/usr/bin/env node
/**
 * Read-only inventory of migration drift.
 * Usage: node scripts/staging/audit-migrations.mjs [snapshot.json] [directory]
 * NEVER treats matching names as proof that SQL was executed.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function analyzeMigrations(files, remoteMigrations) {
  const names = files.filter(name => name.endsWith(".sql")).sort();
  const canonical = names.map(file => {
    const match = /^(\d{14})_(.+)\.sql$/.exec(file);
    return { file, version: match?.[1] ?? null, name: match?.[2] ?? null };
  });
  const valid = canonical.filter(x => x.version);
  const legacy = canonical.filter(x => !x.version);
  const versions = new Map();
  for (const row of valid) versions.set(row.version, [...(versions.get(row.version) ?? []), row.file]);
  const duplicateVersions = [...versions].filter(([, list]) => list.length > 1)
    .map(([version, list]) => ({ version, files: list }));
  const remoteByVersion = new Map(remoteMigrations.map(row => [String(row.version), String(row.name)]));
  const remoteByName = new Map();
  for (const row of remoteMigrations) remoteByName.set(String(row.name), String(row.version));
  const localByName = new Set(canonical.map(x => x.name ?? x.file.replace(/^\d+_/, "").replace(/\.sql$/, "")));
  const exactVersion = valid.filter(x => remoteByVersion.has(x.version));
  const sameNameDifferentVersion = valid.filter(x => remoteByName.has(x.name) && remoteByName.get(x.name) !== x.version);
  const localWithoutRemoteName = canonical.filter(x => !remoteByName.has(x.name ?? x.file.replace(/^\d+_/, "").replace(/\.sql$/, "")));
  const remoteWithoutLocalName = remoteMigrations.filter(x => !localByName.has(String(x.name)));
  const versionNameConflicts = exactVersion.filter(x => remoteByVersion.get(x.version) !== x.name);
  return {
    note: "Inventário comparativo, não prova de aplicação ou equivalência de SQL.",
    remote_applied: remoteMigrations.length,
    repository_sql: names.length,
    canonical_14_digits: valid.length,
    noncanonical_sql: legacy.length,
    same_version_count: exactVersion.length,
    same_name_different_version: sameNameDifferentVersion.length,
    names_only_in_repo: localWithoutRemoteName.length,
    names_only_in_remote: remoteWithoutLocalName.length,
    duplicate_version_identifiers: duplicateVersions.length,
    version_name_conflicts: versionNameConflicts.length,
    examples: {
      noncanonical: legacy.slice(0, 15).map(x => x.file),
      duplicate_versions: duplicateVersions.slice(0, 25),
      same_name_different_version: sameNameDifferentVersion.slice(0, 15).map(x => ({
        file: x.file, remote_version: remoteByName.get(x.name)
      })),
      name_only_in_repo: localWithoutRemoteName.slice(0, 15).map(x => x.file),
      name_only_in_remote: remoteWithoutLocalName.slice(0, 15).map(x => ({
        version: x.version, name: x.name
      }))
    }
  };
}

function main() {
  const snapshotPath = process.argv[2] ?? "docs/homologacao/producao-migrations-2026-11-20.json";
  const migrationsDir = process.argv[3] ?? "supabase/migrations";
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  if (!Array.isArray(snapshot.migrations)) throw new Error("Snapshot sem migrations[]");
  const files = readdirSync(migrationsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".sql")).map(entry => entry.name);
  const result = analyzeMigrations(files, snapshot.migrations);
  console.log(JSON.stringify(result, null, 2));
  if (result.noncanonical_sql || result.duplicate_version_identifiers
      || result.same_name_different_version || result.names_only_in_repo
      || result.names_only_in_remote || result.version_name_conflicts) {
    console.error("DRIFT DETECTADO: não executar db push/reset --remote nem migration repair em massa.");
    process.exitCode = 2;
  }
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1].replace(/\\/g, "/")).href) {
  main();
}
