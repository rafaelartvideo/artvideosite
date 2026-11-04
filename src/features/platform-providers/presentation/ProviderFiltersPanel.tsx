import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { AdminSearchPanel, AdminSearchClearButton } from "@/shared/ui/admin/AdminSearchPanel";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { cn } from "@/shared/domain/formatters";
import { AdminFilterMultiSelect, type AdminFilterOption } from "@/shared/ui/admin/AdminFilterMultiSelect";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import type { PlatformService, ProviderFilters } from "../infrastructure/platform-providers.repository";

type MobileKey = "name" | "equipment" | "services" | "states" | "cities" | "statuses";
const mobileFields: {value:MobileKey;label:string}[] = [
  {value:"name",label:"Nome"},
  {value:"equipment",label:"Equipamento"},
  {value:"services",label:"Serviço"},
  {value:"states",label:"Estado"},
  {value:"cities",label:"Cidade"},
  {value:"statuses",label:"Situação"},
];
const situations:AdminFilterOption[] = [
  {value:"active",label:"Ativos"},
  {value:"inactive",label:"Inativos"},
];

export function ProviderFiltersPanel({
  filters, searchText, onSearchTextChange, services, locations, onChange, onClear,
}:{
  filters:ProviderFilters;
  searchText:string;
  onSearchTextChange:(value:string)=>void;
  services:PlatformService[];
  locations:{state:string;city:string}[];
  onChange:(patch:Partial<ProviderFilters>)=>void;
  onClear:()=>void;
}) {
  const [mobileField,setMobileField] = useState<MobileKey>("name");
  const serviceOptions=useMemo<AdminFilterOption[]>(()=>services
    .filter(s=>s.is_active||filters.serviceIds.includes(s.id))
    .filter(s=>filters.equipmentNames.length===0 || !s.equipment_name ||
      filters.equipmentNames.includes(s.equipment_name) || filters.serviceIds.includes(s.id))
    .map(s=>({value:s.id,label:[s.profession_name,s.equipment_name,s.name].filter(Boolean).join(" · ")}))
    .sort((a,b)=>a.label.localeCompare(b.label,"pt-BR",{sensitivity:"base"})),
    [services,filters.serviceIds,filters.equipmentNames]);
  const equipmentOptions=useMemo<AdminFilterOption[]>(()=>Array.from(new Set(services
    .map(s=>s.equipment_name).filter((name):name is string=>Boolean(name))))
    .sort((a,b)=>a.localeCompare(b,"pt-BR",{sensitivity:"base"}))
    .map(name=>({value:name,label:name})),[services,filters.equipmentNames]);
  const stateOptions=useMemo<AdminFilterOption[]>(()=>Array.from(new Set(locations.map(l=>l.state)))
    .sort((a,b)=>a.localeCompare(b,"pt-BR"))
    .map(state=>({value:state,label:state})),[locations]);
  const cityOptions=useMemo<AdminFilterOption[]>(()=>{
    const selectedStates=new Set(filters.states);
    const values=Array.from(new Map(locations
      .filter(l=>selectedStates.size===0||selectedStates.has(l.state))
      .map(l=>[l.state+":"+l.city,{value:l.state+":"+l.city,label:l.city+" — "+l.state}])).values());
    return values.sort((a,b)=>a.label.localeCompare(b.label,"pt-BR",{sensitivity:"base"}));
  },[locations,filters.states]);
  const toggle=(field:"serviceIds"|"equipmentNames"|"states"|"cities"|"statuses",value:string)=>{
    const current=filters[field] as string[];
    const next=current.includes(value)?current.filter(v=>v!==value):[...current,value];
    if(field==="states"){
      const states=new Set(next);
      onChange({states:next,cities:filters.cities.filter(city=>states.size===0||states.has(city.split(":")[0]))});
    }else if(field==="statuses") {
      onChange({statuses:next as ProviderFilters["statuses"]});
    }else if(field==="serviceIds") {
      onChange({serviceIds:next});
    }else if(field==="equipmentNames") {
      onChange({equipmentNames:next});
    }else{
      onChange({cities:next});
    }
  };
  const hasFilters=Boolean(searchText.trim()||filters.search||filters.serviceIds.length||filters.equipmentNames.length||
    filters.states.length||filters.cities.length||filters.statuses.length);
  const field = (key:MobileKey) => {
    switch(key){
      case "name":
        return <div className="min-w-0">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:mb-1">
            Nome
          </label>
          <div className="relative min-w-0">
            <Search size={15} aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input type="search" value={searchText} onChange={event => onSearchTextChange(event.target.value)}
              aria-label="Buscar por nome" placeholder="Nome"
              className={cn(INPUT, "h-[42px] w-full min-w-0 pl-9 pr-2 text-xs md:h-9 md:py-1.5")}/>
          </div>
        </div>;
      case "equipment":
        return <AdminFilterMultiSelect label="Equipamento" options={equipmentOptions}
          selectedValues={filters.equipmentNames} onToggle={v=>toggle("equipmentNames",v)}
          placeholder="Todos os equipamentos"/>;
      case "services":
        return <AdminFilterMultiSelect label="Serviço" options={serviceOptions}
          selectedValues={filters.serviceIds} onToggle={v=>toggle("serviceIds",v)}
          placeholder="Todos os serviços"/>;
      case "states":
        return <AdminFilterMultiSelect label="Estado" options={stateOptions}
          selectedValues={filters.states} onToggle={v=>toggle("states",v)}
          placeholder="Todos os estados"/>;
      case "cities":
        return <AdminFilterMultiSelect label="Cidade" options={cityOptions}
          selectedValues={filters.cities} onToggle={v=>toggle("cities",v)}
          placeholder="Todas as cidades"/>;
      case "statuses":
        return <AdminFilterMultiSelect label="Situação" options={situations}
          selectedValues={filters.statuses} onToggle={v=>toggle("statuses",v)}
          placeholder="Todas as situações"/>;
    }
  };
  return <AdminSearchPanel title="Buscar prestadores"
    headerActions={hasFilters?<AdminSearchClearButton onClick={onClear}/>:undefined}>
    <div className="space-y-3 md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Selecionar campo de busca"
            className="flex h-[42px] w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-left text-xs font-bold text-foreground focus-visible:ring-2 focus-visible:ring-primary/30">
            <span className="min-w-0 truncate">
              <span className="font-medium text-muted-foreground">Buscar por: </span>
              {mobileFields.find(x=>x.value===mobileField)?.label}
            </span>
            <ChevronDown size={15} className="shrink-0 text-muted-foreground"/>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[220px]">
          {mobileFields.map(item=><DropdownMenuItem key={item.value}
            onSelect={()=>setMobileField(item.value)}
            className={mobileField===item.value?"bg-primary/10 font-bold text-primary":""}>
            <Search size={14}/><span>{item.label}</span>
            {mobileField===item.value&&<Check size={14} className="ml-auto text-primary"/>}
          </DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="min-w-0">{field(mobileField)}</div>
    </div>
    <div className="hidden grid-cols-2 gap-3 md:grid xl:grid-cols-3">
      {field("name")}
      {field("equipment")}
      {field("services")}
      {field("states")}
      {field("cities")}
      {field("statuses")}
    </div>
  </AdminSearchPanel>;
}
