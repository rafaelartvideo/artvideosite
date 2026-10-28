import { FileClock, Globe, Megaphone } from "lucide-react";
import type { ManagementRecord } from "../infrastructure/management.repository";

/** Resumo compacto da Central: sem subseções, altura fixa ou painéis adicionais. */
export function ManagementWorkspaceTools({ records }: { records: ManagementRecord[] }) {
  const active = records.filter(record => !record.deleted_at);
  const metrics = [
    { label: "Registros ativos", value: active.length, Icon: FileClock },
    { label: "Sites e domínios", value: active.filter(record => record.kind === "website").length, Icon: Globe },
    { label: "Campanhas", value: active.filter(record => record.kind === "campaign").length, Icon: Megaphone },
  ];

  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Indicadores da Central de Gestão">
    {metrics.map(({ label, value, Icon }) => <div key={label}
      className="flex min-h-24 items-center justify-between gap-3 border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
      <Icon size={23} className="shrink-0 text-primary" aria-hidden="true"/>
    </div>)}
  </div>;
}
