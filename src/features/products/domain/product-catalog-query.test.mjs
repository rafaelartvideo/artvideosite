import test from "node:test";
import assert from "node:assert/strict";
import { isValidGtin, isInvalidUpcResponse } from "../../../../supabase/functions/product-lookup/lookup-helpers.mjs";

test("GTIN com dígito verificador válido usa busca exata", () => {
  assert.equal(isValidGtin("4006381333931"), true); // EAN-13
  assert.equal(isValidGtin("036000291452"), true); // UPC-A
});
test("MPN misto não deve ser convertido em código de barras", () => {
  assert.equal(isValidGtin("AKB75675304"), false);
  assert.equal(isValidGtin("AAA77376402"), false);
  assert.equal(isValidGtin("AKB 75675304"), false);
});
test("referências numéricas e GTIN com checksum errado não disparam lookup UPC", () => {
  assert.equal(isValidGtin("75675304"), false);
  assert.equal(isValidGtin("4006381333932"), false);
  assert.equal(isValidGtin("123"), false);
});
test("erro INVALID_UPC conhecido é ausência de resultado, não erro 500", () => {
  assert.equal(isInvalidUpcResponse(400, { code: "INVALID_UPC", message: "Not a valid UPC code." }), true);
  assert.equal(isInvalidUpcResponse(400, { message: "Not a valid UPC code." }), true);
  assert.equal(isInvalidUpcResponse(429, { code: "EXCEED_LIMIT" }), false);
  assert.equal(isInvalidUpcResponse(500, { code: "SERVER_ERR" }), false);
});
