/**
 * Capitalizes only the first letter of a sentence or paragraph.
 * Never lowercases subsequent letters: names, acronyms and intentional casing survive.
 * Example: "tv sem imagem. cliente relata LED queimado" ->
 *          "Tv sem imagem. Cliente relata LED queimado"
 */
export function capitalizeSentenceStarts(value: string): string {
  return String(value ?? "").replace(/(^|[.!?…]|\n)(\s*)(\p{L})/gu,
    (_match, boundary: string, spacing: string, letter: string) =>
      boundary + spacing + letter.toLocaleUpperCase("pt-BR"));
}
