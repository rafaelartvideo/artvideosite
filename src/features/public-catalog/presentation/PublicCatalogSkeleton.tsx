/**
 * Espaços reservados da vitrine pública, proporcionais aos cartões reais.
 * Uma única implementação para produtos e serviços evita transições bruscas.
 */
export function PublicCatalogSkeleton({ kind, count = 8 }: {
  kind: "product" | "service";
  count?: number;
}) {
  const service = kind === "service";
  return (
    <div role="status" aria-busy="true" aria-live="polite"
      aria-label={service ? "Carregando serviços" : "Carregando produtos"}
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} aria-hidden="true"
          className={"min-w-0 overflow-hidden rounded-lg border border-[#e3e8ee] bg-white " + (service ? "" : "p-4")}>
          <div className={service ? "aspect-[16/10] bg-[#e8eef6] motion-safe:animate-pulse"
            : "h-[190px] rounded-md bg-[#e8eef6] motion-safe:animate-pulse"} />
          <div className={service ? "space-y-3 px-5 pb-5 pt-5" : "space-y-3 pt-4"}>
            {service && <div className="h-3 w-1/3 rounded bg-[#e9eef5] motion-safe:animate-pulse" />}
            <div className="h-5 w-4/5 rounded bg-[#e0e8f2] motion-safe:animate-pulse" />
            <div className="h-5 w-2/3 rounded bg-[#e9eef5] motion-safe:animate-pulse" />
            <div className="h-3 w-11/12 rounded bg-[#edf1f7] motion-safe:animate-pulse" />
            {service && <div className="h-3 w-3/4 rounded bg-[#edf1f7] motion-safe:animate-pulse" />}
            <div className={"h-7 w-1/2 rounded bg-[#e0e8f2] motion-safe:animate-pulse " + (service ? "mt-5" : "mt-3")} />
            <div className="h-11 w-full rounded-md bg-[#dfe8f5] motion-safe:animate-pulse" />
            {!service && <div className="h-9 w-full rounded-md bg-[#e9eff7] motion-safe:animate-pulse" />}
          </div>
        </div>
      ))}
      <span className="sr-only">{service ? "Preparando serviços disponíveis." : "Preparando produtos disponíveis."}</span>
    </div>
  );
}
