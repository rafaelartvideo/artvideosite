import type { CompatibleDeviceModel } from "../infrastructure/product-compatible-models.repository";

export function CompatibleDeviceModelsList({
  models,
  compact = false,
  hideHeading = false,
}: {
  models: CompatibleDeviceModel[];
  compact?: boolean;
  hideHeading?: boolean;
}) {
  if (!models.length) return null;
  const groupLabel = (item: CompatibleDeviceModel) =>
    [item.brand, item.model].filter(Boolean).join(" ");
  const sortedModels = [...models].sort((a,b) => a.model.localeCompare(b.model,"pt-BR",{numeric:true,sensitivity:"base"}) || groupLabel(a).localeCompare(groupLabel(b),"pt-BR",{numeric:true,sensitivity:"base"}));
  if (compact) {
    const names = sortedModels.slice(0, 2).map(groupLabel).join(" · ");
    return <details className="group min-w-0 text-xs text-muted-foreground">
      <summary className="cursor-pointer list-none break-words text-left leading-5 marker:hidden hover:text-primary">
        <span className="font-semibold text-foreground">Modelos compatíveis: </span>
        {names}{models.length > 2 ? " · +" + (models.length - 2) : ""}
        <span className="ml-1 text-primary group-open:hidden">Ver todos</span>
      </summary>
      <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
        {sortedModels.map((item, i) => <span key={i} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-xs">
          <span className="truncate font-semibold text-foreground">{groupLabel(item)}</span>
          <span className="text-muted-foreground">· {item.device_type}</span>
        </span>)}
      </div>
    </details>;
  }
  return <div className="min-w-0 space-y-2" aria-label="Modelos de aparelhos compatíveis">
    {!hideHeading && <div className="flex flex-wrap items-center gap-2">
      <h4 className="text-sm font-semibold text-foreground">Modelos de aparelhos compatíveis</h4>
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary">{models.length}</span>
    </div>}

    <div className="flex max-h-44 flex-wrap content-start gap-1.5 overflow-y-auto">
      {sortedModels.map((item, index) =>
        <span key={index} className="max-w-full break-all rounded-full border border-border bg-muted/30 px-2 py-1 text-xs">
          <span className="font-semibold text-foreground">{groupLabel(item)}</span>
          <span className="ml-1 text-muted-foreground">· {item.device_type}</span>
        </span>)}
    </div>
    {models.some(model => model.inherited_from_parent) &&
      <p className="text-[11px] text-muted-foreground">Alguns modelos foram herdados do produto principal.</p>}
  </div>;
}
