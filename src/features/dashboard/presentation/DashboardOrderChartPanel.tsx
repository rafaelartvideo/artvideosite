import type { ElementType } from "react";
import { AlignLeft, BarChart3, LineChart as LineChartIcon, PieChart } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import {
  DashboardBarChart, DashboardDonutChart, DashboardLineChart, DashboardPanel,
  DashboardSlaDistributionChart,
  type DashboardChartPoint, type DashboardSlaChartPoint, type DashboardSlaState,
} from "./DashboardUi";

export type DashboardOrderChartMode = "pie" | "vertical" | "horizontal" | "line";
const modes = [
  { value:"pie", label:"Gráfico de pizza", Icon:PieChart },
  { value:"vertical", label:"Barras verticais", Icon:BarChart3 },
  { value:"horizontal", label:"Barras horizontais", Icon:AlignLeft },
  { value:"line", label:"Gráfico de linha", Icon:LineChartIcon },
] as const;

export function DashboardOrderChartPanel({
  title,subtitle,icon,data,mode,onModeChange,selectedKey,onSelect,slaData,selectedState,onSlaSelect,
}: {
  title:string;
  subtitle:string;
  icon?:ElementType;
  data:DashboardChartPoint[];
  mode:DashboardOrderChartMode;
  onModeChange:(next:DashboardOrderChartMode)=>void;
  selectedKey?:string|null;
  onSelect?:(point:DashboardChartPoint)=>void;
  slaData?:DashboardSlaChartPoint[];
  selectedState?:DashboardSlaState|null;
  onSlaSelect?:(point:DashboardSlaChartPoint,state:DashboardSlaState,value:number)=>void;
}) {
  const controls=<div className="inline-flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5">
    {modes.map(({value,label,Icon})=><button key={value} type="button" title={label}
      aria-label={`${label} · ${title}`} aria-pressed={mode===value}
      onClick={()=>onModeChange(value)}
      className={cn("flex size-7 items-center justify-center rounded-md transition-colors",
        mode===value?"bg-card text-primary shadow-sm":"text-muted-foreground hover:bg-card/70 hover:text-foreground")}>
      <Icon size={14}/>
    </button>)}
  </div>;
  const height=238;
  return <DashboardPanel title={title} subtitle={subtitle} icon={icon} headerAside={controls}
    className="h-[370px] w-full max-w-[465px]">
    <div className="h-full min-h-0 min-w-0 overflow-hidden">
      {slaData && mode!=="line" ? <DashboardSlaDistributionChart
        data={slaData} mode={mode} minHeight={height} fixedHeight={height} hideLegend={mode==="pie"}
        selectedKey={selectedKey} selectedState={selectedState} onSelect={onSlaSelect}/>
      : mode==="pie" ? <DashboardDonutChart
        data={data} selectedKey={selectedKey} onSelect={onSelect} fixedHeight={height}
        minHeight={height} innerRadius={0}/>
      : mode==="line" ? <DashboardLineChart data={data} fixedHeight={height} onSelect={onSelect}/>
      : <DashboardBarChart data={data} selectedKey={selectedKey} onSelect={onSelect}
        fixedHeight={height} minHeight={height} layout={mode==="horizontal"?"vertical":"horizontal"}/>}
    </div>
  </DashboardPanel>;
}
