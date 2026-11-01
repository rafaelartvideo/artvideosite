/** Nome legível de arquivos GERADOS pelo sistema. Não usar em chaves de Storage
 * nem para renomear anexos originais enviados por clientes. */
export function generatedFileName(
  title: string,
  reference?: string | number | null,
  extension = "pdf",
): string {
  const humanize = (value: string) => String(value || "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_]+/g, " ")
    .replace(/\s*[-–—]\s*/g, " - ")
    .replace(/[^\p{L}\p{N}\s().-]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .trim();
  const main = humanize(title) || "Documento";
  const suffix = reference == null ? "" : humanize(String(reference));
  const safeExtension = String(extension || "pdf").replace(/[^a-z0-9]/gi, "").toLowerCase() || "pdf";
  return `${main}${suffix ? " - " + suffix : ""}.${safeExtension}`;
}
