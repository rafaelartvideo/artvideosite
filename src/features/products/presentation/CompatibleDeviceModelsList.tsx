import type { CompatibleDeviceModel } from "../infrastructure/product-compatible-models.repository";

export function CompatibleDeviceModelsList({
  models,
  compact = false,
}: {
  models: CompatibleDeviceModel[];
  compact?: boolean;
}) {
  if (!models.length) return null;
  const groupLabel = (item: CompatibleDeviceModel) =>
    [item.brand, item.model].filter(Boolean).join(" ");
  if (compact) {
    const names = models.slice(0, 2).map(groupLabel).join(" · ");
    return <details className="group min-w-0 text-xs text-muted-foreground">
      <summary className="cursor-pointer list-none break-words text-left leading-5 marker:hidden hover:text-primary">
        <span className="font-semibold text-foreground">Modelos compatíveis: </span>
        {names}{models.length > 2 ? " · +" + (models.length - 2) : ""}
        <span className="ml-1 text-primary group-open:hidden">Ver todos</span>
      </summary>
      <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
        {models.map((item, i) => <span key={i} className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs">
          <span className="truncate font-semibold text-foreground">{groupLabel(item)}</span>
          <span className="text-muted-foreground">· {item.device_type}</span>
        </span>)}
      </div>
    </details>;
  }
  return <div className="min-w-0 space-y-2" aria-label="Modelos de aparelhos compatíveis">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-semibold text-foreground">Modelos de aparelhos compatíveis</h4>
      <span className="text-xs tabular-nums text-muted-foreground">{models.length} {models.length === 1 ? "modelo" : "modelos"}</span>
    </div>
    <p className="text-xs text-muted-foreground">Compatibilidade informada no cadastro do produto.</p>
    <div className="flex max-h-44 flex-wrap content-start gap-1.5 overflow-y-auto">
      {models.map((item, index) =>
        <span key={index} className="max-w-full break-all rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
          <span className="font-semibold text-foreground">{groupLabel(item)}</span>
          <span className="ml-1 text-muted-foreground">· {item.device_type}</span>
        </span>)}
    </div>
    {models.some(model => model.inherited_from_parent) &&
      <p className="text-[11px] text-muted-foreground">Alguns modelos foram herdados do produto principal.</p>}
  </div>;
}
