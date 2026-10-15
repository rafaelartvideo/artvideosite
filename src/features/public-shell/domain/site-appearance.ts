import {
  Cable, Camera, ClipboardList, Cpu, Fan, Gamepad2, Headphones, Laptop,
  Monitor, Package, Plug, Search, Settings, ShieldCheck, ShoppingCart,
  Smartphone, Speaker, Tv, WashingMachine, Wifi, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";

export const PUBLIC_ICON_OPTIONS: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: "wrench", label: "Manutenção", Icon: Wrench },
  { value: "tv", label: "TV", Icon: Tv },
  { value: "monitor", label: "Monitor", Icon: Monitor },
  { value: "laptop", label: "Notebook", Icon: Laptop },
  { value: "cpu", label: "Eletrônicos", Icon: Cpu },
  { value: "shopping-cart", label: "Carrinho", Icon: ShoppingCart },
  { value: "clipboard-list", label: "Acompanhamento", Icon: ClipboardList },
  { value: "search", label: "Busca / Diagnóstico", Icon: Search },
  { value: "washing-machine", label: "Eletrodomésticos", Icon: WashingMachine },
  { value: "gamepad-2", label: "Videogames", Icon: Gamepad2 },
  { value: "wifi", label: "Redes", Icon: Wifi },
  { value: "camera", label: "Câmeras", Icon: Camera },
  { value: "shield-check", label: "Segurança", Icon: ShieldCheck },
  { value: "plug", label: "Instalação", Icon: Plug },
  { value: "settings", label: "Configuração", Icon: Settings },
  { value: "smartphone", label: "Celulares", Icon: Smartphone },
  { value: "package", label: "Produtos", Icon: Package },
  { value: "headphones", label: "Fones", Icon: Headphones },
  { value: "speaker", label: "Áudio", Icon: Speaker },
  { value: "fan", label: "Climatização", Icon: Fan },
  { value: "cable", label: "Cabos", Icon: Cable },
  { value: "zap", label: "Energia", Icon: Zap },
];

const iconMap = Object.fromEntries(PUBLIC_ICON_OPTIONS.map(({ value, Icon }) => [value, Icon])) as Record<string, LucideIcon>;
export function publicIcon(name: unknown): LucideIcon {
  return typeof name === "string" && iconMap[name] ? iconMap[name] : Wrench;
}

/** Default icon when a service does not yet have an icon selected in the CRM. */
export function inferredServiceIcon(title: unknown): string {
  const name = String(title || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/camera|cftv|rede|wi.?fi|internet|roteador/.test(name)) return "wifi";
  if (/tv|televisor|televisao|monitor|suporte/.test(name)) return "monitor";
  if (/notebook|computador|desktop|pc\b/.test(name)) return "laptop";
  if (/geladeira|lavadora|lava.?seca|eletrodomestico|maquina de lavar/.test(name)) return "washing-machine";
  if (/videogame|console|playstation|xbox/.test(name)) return "gamepad-2";
  if (/celular|smartphone|tablet/.test(name)) return "smartphone";
  if (/instalacao|configuracao|montagem/.test(name)) return "settings";
  if (/placa|componente|solda|eletronico/.test(name)) return "cpu";
  if (/manutencao|revisao|preventiva|limpeza/.test(name)) return "settings";
  return "wrench";
}

export function siteText(settings: Record<string, unknown>, key: string, fallback: string): string {
  const raw = settings[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
}

export type HomeServiceDisplay = Record<string, { icon?: string; media_id?: string }>;
export function homeServiceDisplay(value: unknown): HomeServiceDisplay {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as HomeServiceDisplay;
}

export type HomeCategory = { title: string; icon: string };
export const DEFAULT_HOME_CATEGORIES: HomeCategory[] = [
  { title: "TVs", icon: "tv" },
  { title: "Computadores", icon: "laptop" },
  { title: "Eletrodomésticos", icon: "washing-machine" },
  { title: "Videogames", icon: "gamepad-2" },
  { title: "Eletrônicos", icon: "cpu" },
];
export function homeCategories(value: unknown): HomeCategory[] {
  if (!Array.isArray(value)) return DEFAULT_HOME_CATEGORIES;
  return value.filter((item): item is HomeCategory =>
    item && typeof item.title === "string" && typeof item.icon === "string");
}
