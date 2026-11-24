import { Children, cloneElement, isValidElement, useId, useMemo, useState, useSyncExternalStore, type HTMLInputTypeAttribute, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/shared/ui/primitives/dropdown-menu";
import { AdminCard } from "./AdminLayout";
import { AdminFieldLabel, INPUT } from "./AdminFormControls";
import { AdminMobileSearchSwitch } from "./AdminMobileSearchSwitch";
import { COMPACT_SEARCH_MEDIA, searchPanelPreferenceKey, readSearchPanelExpanded, writeSearchPanelExpanded } from "./search-panel-preference";

function subscribeCompactSearch(callback: () => void) {
  const media = window.matchMedia(COMPACT_SEARCH_MEDIA);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function getCompactSearch() {
  return typeof window !== "undefined" && window.matchMedia(COMPACT_SEARCH_MEDIA).matches;
}
const getServerCompactSearch = () => false;

type SearchChildProps = { className?: string; children?: ReactNode; mobileOnly?: boolean; label?: ReactNode; ariaLabel?: string };

// A grade antiga continua disponível, inclusive em telas estreitas, sem duplicar inputs.
function showExpandedSearch(node: ReactNode): ReactNode {
  if (!isValidElement<SearchChildProps>(node) || typeof node.type !== "string") return node;
  const className = node.props.className || "";
  const classes = className.split(/\s+/);
  const display = classes.includes("md:grid") ? "grid" : classes.includes("md:block") ? "block" : classes.includes("md:flex") ? "flex" : null;
  const nextClass = display && classes.includes("hidden") ? classes.filter(item => item !== "hidden").concat(display).join(" ") : className;
  return cloneElement(node, { className: nextClass || undefined },
    node.props.children == null ? node.props.children : Children.map(node.props.children, showExpandedSearch));
}

export type AdminSearchField = { value: string; label: string; content: ReactNode };

export function AdminSearchPanel({ title, children, fields, headerActions, allowOverflow = false }: { title: string; children?: ReactNode; fields?: AdminSearchField[]; headerActions?: ReactNode; allowOverflow?: boolean }) {
  const panelId = useId();
  const compactViewport = useSyncExternalStore(subscribeCompactSearch, getCompactSearch, getServerCompactSearch);
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const preferenceKey = searchPanelPreferenceKey(pathname, title, compactViewport);
  const storedExpanded = useMemo(() => readSearchPanelExpanded(preferenceKey, compactViewport), [preferenceKey, compactViewport]);
  const [preference, setPreference] = useState<{ key: string; expanded: boolean } | null>(null);
  const expanded = preference?.key === preferenceKey ? preference.expanded : storedExpanded;
  const toggleExpanded = () => {
    const next = !expanded;
    writeSearchPanelExpanded(preferenceKey, next);
    setPreference({ key: preferenceKey, expanded: next });
  };
  const content = Children.toArray(children);
  const compactIndex = content.findIndex(child => isValidElement(child) && child.type === AdminMobileSearchSwitch);
  const compact = compactIndex >= 0 ? content[compactIndex] : null;
  const hasExistingCompact = isValidElement<SearchChildProps>(compact);
  const hasFields = Boolean(fields?.length);
  const hasCompact = hasExistingCompact || hasFields;
  const [fieldValue, setFieldValue] = useState("");
  const selectedField = fields?.find(field => field.value === fieldValue) || fields?.[0];
  // Compact mode retains the single-field selector where available.
  // Single-field panels without a selector collapse their content instead.
  const isExpanded = expanded;
  const toggleLabel = hasCompact ? (expanded ? "Recolher filtros" : "Expandir filtros") : (expanded ? "Recolher busca" : "Expandir busca");
  return <AdminCard square className={cn("admin-search-panel p-0", allowOverflow ? "overflow-visible" : "overflow-hidden")}>
    <div className="flex h-12 items-center justify-between gap-3 border-b border-primary-active/35 admin-primary-bar px-4 text-white md:h-11">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.08]"><Search size={14} className="shrink-0 text-white/90" /></span>
        <span className="min-w-0 truncate text-xs font-bold uppercase tracking-[0.08em]">{title}</span>
        <button type="button" aria-label={toggleLabel} title={toggleLabel} aria-expanded={isExpanded} aria-controls={panelId}
          className="inline-flex h-7 w-5 shrink-0 items-center justify-center self-center border-0 bg-transparent p-0 leading-none text-white shadow-none hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={toggleExpanded}>
          <ChevronDown size={16} aria-hidden="true" className={cn("block shrink-0 transition-transform", isExpanded && "rotate-180")} />
        </button>
      </div>
      {headerActions && <div className="ml-auto flex shrink-0 items-center justify-end gap-2">{headerActions}</div>}
    </div>
    <div id={panelId} className={cn("admin-search-panel-content min-w-0", !hasCompact && !expanded ? "hidden" : "p-4 md:p-3")}>
      {hasFields && selectedField && (expanded
        ? <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{fields?.map(field => <div key={field.value} className="min-w-0">{field.content}</div>)}</div>
        : <AdminMobileSearchSwitch mobileOnly={false} value={selectedField.value} options={fields || []} onChange={setFieldValue}>{selectedField.content}</AdminMobileSearchSwitch>)}
      {hasExistingCompact ? content.map((child, index) => index === compactIndex
        ? (!expanded ? cloneElement(compact, { mobileOnly: false }) : null)
        : index === compactIndex + 1 && isValidElement<SearchChildProps>(child) && /(?:^|\s)hidden(?:\s|$)/.test(child.props.className || "")
          ? (expanded ? showExpandedSearch(child) : null)
          : child) : children}
    </div>
  </AdminCard>;
}

/** Campo de busca compacto padronizado para painéis administrativos. */
export function AdminSearchTextField({ label, value, onChange, placeholder, inputMode, id, className, inputClassName, type = "search", ariaLabel, onKeyDown }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode?: "numeric" | "text" | "tel" | "email" | "search";
  id?: string;
  className?: string;
  inputClassName?: string;
  type?: HTMLInputTypeAttribute;
  ariaLabel?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  return <div className={cn("min-w-0", className)}>
    {label && <AdminFieldLabel label={label} htmlFor={inputId} />}
    <div className="relative min-w-0">
      <Search size={15} aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input id={inputId} type={type} inputMode={inputMode} value={value} onChange={event => onChange(event.target.value)} onKeyDown={onKeyDown}
        placeholder={placeholder} aria-label={ariaLabel || (label ? `Buscar por ${label.toLowerCase()}` : "Pesquisar")}
        className={cn(INPUT, "h-[42px] min-h-[42px] w-full min-w-0 pl-9 pr-2 text-sm md:h-9 md:min-h-9 md:py-1.5 md:text-xs", inputClassName)} />
    </div>
  </div>;
}

/** O mesmo botão de ícone Material 3 nos painéis de busca e em superfícies claras. */
type SearchActionVariant = "header" | "surface";
const searchActionButtonClass = (variant: SearchActionVariant) => cn(
  "inline-flex shrink-0 items-center justify-center rounded-none border-0 bg-transparent p-0 shadow-none transition-opacity duration-150 hover:opacity-75 active:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
  variant === "header"
    ? "h-9 w-9 text-white md:h-10 md:w-10"
    : "h-11 w-11 text-foreground",
);

/** Google Material Symbols: delete_sweep (outlined, peso 400). */
export function AdminSearchClearIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
    <path d="M15 18.25v-1.5h3.625v1.5H15Zm0-9.2v-1.5h7v1.5H15Zm0 4.6v-1.5h5.875v1.5H15ZM3.125 7.125H2v-1.5h4.25V4.5h3.375v1.125h4.25v1.5H12.75V17.5q0 .6-.45 1.05t-1.05 .45H4.625q-.6 0-1.05-.45t-.45-1.05V7.125Zm1.5 0V17.5h6.625V7.125H4.625Z" />
  </svg>;
}

/** Ícone de ordenação enviado para o CRM; não muda de desenho com o sentido. */
export function AdminSearchSortIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
    <path d="M3,18V16H9v2H3Zm0-5V11H15v2H3ZM3,8V6H21V8H3Z" />
  </svg>;
}

export function AdminSearchClearButton({ onClick, label = "Limpar todos os filtros", variant = "header" }: {
  onClick: () => void;
  label?: string;
  variant?: SearchActionVariant;
}) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className={searchActionButtonClass(variant)}>
    <AdminSearchClearIcon />
  </button>;
}

export type AdminSearchSortOption<T extends string> = { value: T; label: string };

export function AdminSearchSortMenu<T extends string>({
  value, onChange, options, label = "Ordenação", variant = "header",
}: {
  value: T;
  onChange: (value: T) => void;
  options: AdminSearchSortOption<T>[];
  label?: string;
  variant?: SearchActionVariant;
}) {
  const current = options.find(option => option.value === value);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" title={`${label}: ${current?.label || "Padrão"}`}
        aria-label={`${label} atual: ${current?.label || "Padrão"}`}
        className={searchActionButtonClass(variant)}>
        <AdminSearchSortIcon />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-[190px]">
      {options.map(option => {
        const selected = option.value === value;
        return <DropdownMenuItem key={option.value || "default"} onSelect={() => onChange(option.value)}
          className={cn("cursor-pointer", selected && "bg-primary/10 font-bold text-primary")}>
          <span>{option.label}</span>{selected && <Check size={16} className="ml-auto text-primary" />}
        </DropdownMenuItem>;
      })}
    </DropdownMenuContent>
  </DropdownMenu>;
}
