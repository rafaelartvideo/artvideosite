import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const entry = readFileSync("src/main.tsx", "utf8");
const policy = readFileSync("src/shared/ui/admin/crm-autofill-policy.ts", "utf8");

test("CRM installs the browser autofill policy before rendering React", () => {
  const install = entry.indexOf("installCrmAutofillPolicy();");
  const render = entry.indexOf("createRoot(");
  assert.ok(install >= 0 && render > install);
});

test("autofill protection covers new modal inputs and restores suggestions on interaction", () => {
  assert.match(policy, /CRM_ROUTE =/);
  assert.match(policy, /attributeFilter: \["autocomplete"\]/);
  assert.match(policy, /MutationObserver\(/);
  assert.match(policy, /record\.addedNodes/);
  assert.match(policy, /setAttribute\("autocomplete", "off"\)/);
  assert.match(policy, /setAttribute\("autocomplete", suggestionHint\)/);
  assert.match(policy, /addEventListener\("pointerdown"/);
  assert.match(policy, /addEventListener\("focusout"/);
  assert.match(policy, /keyboardTabDown/);
  assert.doesNotMatch(policy, /control\.value\s*=/);
});

test("autofill policy leaves file uploads and non-CRM routes alone", () => {
  assert.match(policy, /"file", "hidden"/);
  assert.match(policy, /if \(!inCrm\(\)\)/);
});
