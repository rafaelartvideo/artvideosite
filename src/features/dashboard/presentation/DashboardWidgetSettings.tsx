import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/shared/ui/primitives/dropdown-menu";
import type { DashboardModule } from "../domain/dashboard";
import { DASHBOARD_WIDGET_OPTIONS, toggleDashboardWidget, validVisibleWidgets, widgetDefaults } from "../domain/dashboard-widgets";

type SelectionRecord = { section: DashboardModule; visible_keys: string[] };
type VisibilityMap = Partial<Record<DashboardModule, string[]>>;

export function useDashboardWidgetSettings(organizationId: string | null, userId: string | null) {
  const queryClient = useQueryClient();
  const cacheKey = ["dashboard", "widget-settings", organizationId, userId];
  const [pending, setPending] = useState<VisibilityMap>({});

  const settings = useQuery({
    queryKey: cacheKey,
    enabled: Boolean(organizationId && userId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SelectionRecord[]> => {
      const { data, error } = await supabase.from("dashboard_widget_preferences")
        .select("section,visible_keys")
        .eq("organization_id", organizationId!)
        .eq("user_id", userId!);
      if (error) throw error;
      return (data || []) as SelectionRecord[];
    },
  });
  useEffect(() => { setPending({}); }, [organizationId, userId]);

  const saved = useMemo<VisibilityMap>(() => {
    const result: VisibilityMap = {};
    for (const row of settings.data || []) {
      if (row.section in DASHBOARD_WIDGET_OPTIONS)
        result[row.section] = validVisibleWidgets(row.section, row.visible_keys);
    }
    return result;
  }, [settings.data]);

  const selected = (section: DashboardModule): string[] =>
    validVisibleWidgets(section, pending[section] ?? saved[section] ?? widgetDefaults(section));

  const isVisible = (section: DashboardModule, id: string): boolean => selected(section).includes(id);
  const toggle = (section: DashboardModule, id: string) => {
    setPending(previous => {
      const current = previous[section] ?? saved[section] ?? widgetDefaults(section);
      return { ...previous, [section]: toggleDashboardWidget(section, current, id) };
    });
  };
  const restore = (section: DashboardModule) => {
    setPending(previous => ({ ...previous, [section]: widgetDefaults(section) }));
  };

  useEffect(() => {
    if (!organizationId || !userId || !Object.keys(pending).length) return;
    const id = window.setTimeout(async () => {
      const updates = Object.entries(pending) as Array<[DashboardModule, string[]]>;
      const { error } = await supabase.from("dashboard_widget_preferences").upsert(
        updates.map(([section, visible_keys]) => ({
          organization_id: organizationId,
          user_id: userId,
          section,
          visible_keys,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "organization_id,user_id,section" },
      );
      if (error) {
        notifyAdmin("Não foi possível salvar a personalização do dashboard.", "error");
        return;
      }
      queryClient.setQueryData<SelectionRecord[]>(cacheKey, old => {
        const rows = [...(old || [])];
        for (const [section, visible_keys] of updates) {
          const index = rows.findIndex(row => row.section === section);
          const row = { section, visible_keys };
          if (index >= 0) rows[index] = row;
          else rows.push(row);
        }
        return rows;
      });
      setPending(current => {
        const next = { ...current };
        for (const [section, visible_keys] of updates) {
          if (JSON.stringify(next[section]) === JSON.stringify(visible_keys)) delete next[section];
        }
        return next;
      });
    }, 450);
    return () => window.clearTimeout(id);
  }, [organizationId, userId, pending, queryClient]);

  return { settings, selected, isVisible, toggle, restore };
}

export function DashboardWidgetSettings({
  section, selected, onToggle, onRestore,
}: {
  section: DashboardModule;
  selected: string[];
  onToggle: (id: string) => void;
  onRestore: () => void;
}) {
  const options = DASHBOARD_WIDGET_OPTIONS[section];
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label="Personalizar gráficos desta seção"
        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
        <SlidersHorizontal size={15}/> <span className="hidden sm:inline">Personalizar</span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px]">{selected.length}/{options.length}</span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" collisionPadding={12} className="w-[min(310px,calc(100vw-1.5rem))] max-h-[min(500px,80dvh)] overflow-y-auto p-1.5">
      <DropdownMenuLabel className="text-xs">Exibir nesta seção</DropdownMenuLabel>
      <p className="px-2 pb-2 text-[11px] text-muted-foreground">Escolha os indicadores e gráficos. A preferência fica salva para seu usuário nesta empresa.</p>
      <DropdownMenuSeparator/>
      {options.map(option => <DropdownMenuCheckboxItem key={option.id} checked={selected.includes(option.id)}
        onSelect={event => event.preventDefault()}
        onCheckedChange={() => onToggle(option.id)}>
        {option.label}
      </DropdownMenuCheckboxItem>)}
      <DropdownMenuSeparator/>
      <DropdownMenuItem onSelect={() => onRestore()} className="text-xs font-semibold">
        <RotateCcw size={14}/> Restaurar todos os painéis
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
