import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const section = readFileSync("src/features/orders/presentation/OrderProductsServicesSection.tsx", "utf8");

test("listas de catálogo ficam sobrepostas às seções e têm rolagem própria", () => {
  assert.match(section, /absolute inset-x-0 top-\[calc\(100%\+4px\)\] z-50/);
  assert.match(section, /!overflow-visible/);
  assert.match(section, /fourRows \? "max-h-\[224px\]"/);
  assert.match(section, /fourRows \? "h-14 items-center py-2"/);
  assert.match(section, /open=\{serviceSearchOpen && !selectedService\}\s+fourRows/);
});
test("busca de serviço mostra spinner padrão em vez da mensagem Buscando", () => {
  assert.match(section, /import \{ LoadingSpinner \} from/);
  assert.match(section, /aria-label="Carregando resultados"/);
  assert.doesNotMatch(section, />Buscando\.\.\.<\/div>/);
  assert.match(section, /setServiceSearching\(true\)/);
});
test("quantidade, preço e Adicionar alinham sem hint dentro da linha", () => {
  assert.match(section, /grid-cols-\[84px_minmax\(0,1fr\)_auto\] items-end/);
  assert.match(section, /className="h-\[42px\] self-end px-2 sm:px-3"/);
  assert.match(section, /\{selectedService && <p className="text-\[10px\]/);
});
