import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMigrations } from "./audit-migrations.mjs";

test("detecta duplicidade, arquivos legados e IDs remotos divergentes sem escrever banco", () => {
  const repo = [
    "20261120100000_orders_a.sql",
    "20261120100000_orders_b.sql",
    "20261120110000_customers.sql",
    "20261119_legacy.sql",
    "20261120120000_only_local.sql",
  ];
  const remote = [
    {version:"20261120100000", name:"orders_a"},
    {version:"20261120110111", name:"customers"},
    {version:"20261120130000", name:"only_remote"},
  ];
  const result = analyzeMigrations(repo, remote);
  assert.equal(result.repository_sql,5);
  assert.equal(result.remote_applied,3);
  assert.equal(result.canonical_14_digits,4);
  assert.equal(result.noncanonical_sql,1);
  assert.equal(result.duplicate_version_identifiers,1);
  assert.equal(result.same_name_different_version,1);
  assert.equal(result.names_only_in_repo,3);
  assert.equal(result.names_only_in_remote,1);
  assert.equal(result.same_version_count,2);
});
