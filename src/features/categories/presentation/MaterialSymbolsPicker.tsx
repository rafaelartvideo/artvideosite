import { useDeferredValue, useMemo, useState } from "react";
import { MATERIAL_SYMBOL_NAMES } from "./material-symbol-names";
import { Search } from "lucide-react";
import {
  MaterialSymbol, materialIconValue, parseMaterialIcon,
  type MaterialSymbolStyle,
} from "@/features/public-shell/presentation/MaterialSymbol";

// The official Google codepoints catalog is bundled locally; category searches
// never call GitHub, Supabase or an Edge Function.
const FEATURED = [
  "ac_unit", "air_purifier", "tv", "connected_tv", "desktop_windows", "laptop_mac",
  "smartphone", "headphones", "speaker", "videogame_asset", "kitchen",
  "local_laundry_service", "microwave", "oven", "heat_pump", "mode_fan",
  "home_repair_service", "handyman", "build", "construction", "settings",
  "electric_bolt", "electrical_services", "power", "cable", "plumbing",
  "router", "wifi", "security", "videocam", "camera_alt", "devices",
  "memory", "developer_board", "shopping_bag", "inventory_2",
  "storefront", "sell", "category", "grid_view", "auto_awesome",
  "lightbulb", "tools_power_drill", "build_circle", "engineering",
  "computer", "monitor", "headset", "watch", "print", "battery_full",
  "filter_alt", "air", "cleaning_services", "precision_manufacturing",
  "recycling", "support_agent", "verified", "receipt_long", "package_2",
];

const ALIASES: Record<string, string> = {
  ar_condicionado: "ac_unit heat_pump air_purifier mode_fan",
  climatizacao: "ac_unit air heat_pump",
  refrigeracao: "ac_unit kitchen",
  geladeira: "kitchen",
  fogao: "oven microwave",
  ventilador: "mode_fan air",
  limpeza: "cleaning_services",
  manutencao: "home_repair_service build handyman",
  reparo: "handyman build home_repair_service",
  ferramentas: "handyman build construction",
  eletrica: "electrical_services electric_bolt power",
  eletronicos: "devices memory developer_board",
  televisao: "tv connected_tv",
  televisores: "tv",
  computador: "computer desktop_windows",
  notebook: "laptop_mac",
  celular: "smartphone",
  video_game: "videogame_asset",
  videogame: "videogame_asset",
  fone: "headphones headset",
  audio: "speaker headphones",
  seguranca: "security",
  camera: "camera_alt videocam",
  rede: "router wifi",
  produtos: "inventory_2 shopping_bag",
  servicos: "home_repair_service handyman",
  instalacao: "construction build",
};

const normalize = (name: string) => name
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export function MaterialSymbolsPicker({
  value, onChange, disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const selected = parseMaterialIcon(value);
  const style = selected?.style || "outlined";
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(72);
  const deferredSearch = useDeferredValue(search);
  const icons = useMemo(() => {
    const all = MATERIAL_SYMBOL_NAMES;
    const term = normalize(deferredSearch);
    if (!term) {
      const featured = FEATURED.filter(name => all.includes(name));
      return [...new Set([...featured, ...all])];
    }
    const aliasMatches = Object.entries(ALIASES)
      .filter(([alias]) => alias.includes(term) || term.includes(alias))
      .flatMap(([, matches]) => matches.split(" "));
    return [...new Set([...aliasMatches.filter(name => all.includes(name)),
      ...all.filter(name => name.includes(term))])];
  }, [deferredSearch]);
  const chooseStyle = (next: MaterialSymbolStyle) =>
    onChange(materialIconValue(selected?.name || "home_repair_service", next));

  return <div className="space-y-3">
    <div>
      <p className="mb-1.5 text-xs font-semibold text-[#475569]">Estilo dos ícones</p>
      <div className="flex flex-wrap gap-2">
        {([
          ["outlined", "Contorno"],
          ["rounded", "Arredondado"],
          ["sharp", "Reto"],
        ] as const).map(([option, label]) =>
          <button type="button" key={option} disabled={disabled}
            onClick={() => chooseStyle(option)}
            aria-pressed={style === option}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${style === option
              ? "border-[var(--art-primary)] bg-[#edf3ff] text-[var(--art-primary)]"
              : "border-[#d9e2ed] bg-white text-[#526276] hover:bg-[#f7f9fc]"}`}>
            {label}
          </button>)}
      </div>
    </div>
    <label className="relative block">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718096]"/>
      <input type="search" value={search} disabled={disabled}
        onChange={event => { setSearch(event.target.value); setLimit(72); }}
        placeholder="Buscar: ar-condicionado, TV, manutenção..."
        aria-label="Buscar ícone Material Symbols"
        className="h-10 w-full rounded-lg border border-[#dce4ee] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--art-primary)]"/>
    </label>
    <p className="text-[11px] text-[#64748b]">
      {MATERIAL_SYMBOL_NAMES.length} ícones do Google disponíveis localmente · pesquisa sem consultas externas
    </p></p>
    <div className="grid max-h-[280px] grid-cols-4 gap-2 overflow-y-auto rounded-lg border border-[#e2e8f0] p-2 sm:grid-cols-6">
      {icons.slice(0, limit).map(name => {
        const encoded = materialIconValue(name, style);
        const active = encoded === value;
        return <button key={name} type="button" title={name.replace(/_/g, " ")}
          aria-label={`Selecionar ícone ${name.replace(/_/g, " ")}`}
          aria-pressed={active} disabled={disabled}
          onClick={() => onChange(encoded)}
          className={`flex min-h-[67px] min-w-0 flex-col items-center justify-center gap-1 rounded-md border p-1 text-center transition-colors disabled:opacity-50 ${active
            ? "border-[var(--art-primary)] bg-[#edf3ff] text-[var(--art-primary)]"
            : "border-transparent text-[#34465c] hover:bg-[#f1f5f9]"}`}>
          <MaterialSymbol icon={encoded} size={25}/>
          <span className="w-full truncate text-[9px]">{name.replace(/_/g, " ")}</span>
        </button>;
      })}
      {icons.length === 0 && <p className="col-span-full p-5 text-center text-xs text-[#64748b]">Nenhum ícone encontrado.</p>}
    </div>
    {icons.length > limit && <button type="button" disabled={disabled}
      onClick={() => setLimit(current => current + 72)}
      className="text-xs font-semibold text-[var(--art-primary)] hover:underline">Ver mais ícones ({icons.length - limit} restantes)</button>}
    {selected && <div className="flex items-center gap-2 rounded-lg bg-[#f8fafc] p-2 text-xs text-[#475569]">
      <MaterialSymbol icon={value} size={26}/>
      Selecionado: <strong>{selected.name.replace(/_/g, " ")}</strong>
    </div>}
  </div>;
}
