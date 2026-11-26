import React, { useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { Popover, PopoverAnchor, PopoverContent } from "@/shared/ui/primitives/popover";

export type CatalogOption = {
  id: string;
  name: string;
  meta?: string;
};

export function normalizeCatalogValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function cleanCatalogValue(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}


export function findExactCatalogOption(options: CatalogOption[], value: string) {
  const normalized = normalizeCatalogValue(value);
  if (!normalized) return null;
  return options.find(option => normalizeCatalogValue(option.name) === normalized) || null;
}

export function CatalogCombobox({
  label,
  value,
  selectedId,
  options,
  onChange,
  onSelect,
  placeholder,
  disabled = false,
  required = false,
  allowCreate = true,
  createLabel = "Novo cadastro",
  emptyText = "Nenhum cadastro encontrado.",
  helperText,
  selectionOnly = false,
  allowClear = true,
  showLabel = true,
  error,
}: {
  label: string;
  value: string;
  selectedId: string;
  options: CatalogOption[];
  onChange: (value: string) => void;
  onSelect: (option: CatalogOption | null) => void;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  allowCreate?: boolean;
  createLabel?: string;
  emptyText?: string;
  helperText?: string;
  /** Search existing records without changing the saved selection until confirmed. */
  selectionOnly?: boolean;
  allowClear?: boolean;
  showLabel?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputValue = selectionOnly ? searchDraft ?? value : value;
  const query = normalizeCatalogValue(selectionOnly ? searchDraft ?? "" : value);
  const selectedOption = options.find(option => option.id === selectedId) || null;
  const exactOption = findExactCatalogOption(options, inputValue);
  const duplicateOption = !selectionOnly && exactOption && exactOption.id !== selectedId ? exactOption : null;

  React.useEffect(() => {
    if (disabled) { setOpen(false); setSearchDraft(null); }
  }, [disabled]);

  const filteredOptions = useMemo(() => {
    const sorted = [...options].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
    if (!query) return sorted;
    return sorted.filter(option => normalizeCatalogValue(option.name).includes(query) || normalizeCatalogValue(option.meta).includes(query));
  }, [options, query]);

  const closeOptions = () => { setOpen(false); setSearchDraft(null); };
  const selectOption = (option: CatalogOption) => {
    onSelect(option);
    onChange(option.name);
    closeOptions();
  };

  return <div className="min-w-0">
    {showLabel && <label className="mb-1.5 flex min-w-0 items-baseline gap-1 break-words text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      {label}{required && <span className="text-red-600 dark:text-red-400">*</span>}
    </label>}
    <Popover open={open && !disabled} onOpenChange={(nextOpen) => { if (!disabled) { if (nextOpen) setOpen(true); else closeOptions(); } }}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="relative">
          <input
            value={inputValue}
            aria-label={label}
            aria-expanded={open && !disabled}
            aria-required={required}
            aria-invalid={Boolean(error) || undefined}
            disabled={disabled}
            autoComplete="off"
            placeholder={placeholder}
            onFocus={event => { setOpen(true); if (selectionOnly) event.currentTarget.select(); }}
            onPointerDown={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") { if (open) event.stopPropagation(); closeOptions(); }
              if (event.key === "Enter" && (exactOption || (selectionOnly && open))) {
                event.preventDefault();
                const match = exactOption || (filteredOptions.length === 1 ? filteredOptions[0] : null);
                if (match) selectOption(match);
              }
            }}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (selectionOnly) setSearchDraft(nextValue);
              else {
                onChange(nextValue);
                if (selectedId && normalizeCatalogValue(selectedOption?.name) !== normalizeCatalogValue(nextValue)) onSelect(null);
              }
              setOpen(true);
            }}
            className={cn(
              INPUT,
              "h-[42px] pr-9",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500/40",
              disabled && "disabled:cursor-default disabled:bg-muted/60 disabled:text-muted-foreground disabled:opacity-70 disabled:focus:ring-0",
              duplicateOption && "border-amber-400 focus:border-amber-500 focus:ring-amber-400/30",
              selectedId && !selectionOnly && "border-emerald-500/40 bg-emerald-500/5",
            )}
          />
          <ChevronDown size={15} className={cn("pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={{ top: 12, right: 12, bottom: 84, left: 12 }}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          const target = event.target as Node | null;
          if (target && anchorRef.current?.contains(target)) event.preventDefault();
        }}
        className="z-[220] w-[var(--radix-popover-trigger-width)] min-w-[220px] overflow-hidden rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground">
          <Search size={13} className="shrink-0" />
          <span>{query ? "Resultados encontrados" : selectionOnly ? "Selecionar cadastro" : "Cadastros recentes"}</span>
        </div>
        <div
          className="max-h-40 overflow-y-auto overscroll-contain p-1.5 [scrollbar-gutter:stable]"
          onWheelCapture={(event) => event.stopPropagation()}
          onTouchMoveCapture={(event) => event.stopPropagation()}
        >
          {selectionOnly && allowClear && selectedId && <button type="button" onMouseDown={event => event.preventDefault()}
            onClick={() => { onSelect(null); onChange(""); closeOptions(); }}
            className="mb-1 block w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted">Limpar seleção</button>}
          {filteredOptions.length > 0 ? filteredOptions.map(option => {
            const selected = selectedId === option.id;
            return <button
              key={option.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-primary-soft focus-visible:bg-primary-soft focus-visible:outline-none",
                selected && "bg-primary-soft",
              )}
            >
              <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary bg-primary text-white" : "border-border text-transparent")}><Check size={11} /></span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-xs font-bold", selected ? "text-[var(--primary-light)] font-bold" : "text-popover-foreground")}>{option.name}</span>
                {option.meta && <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{option.meta}</span>}
              </span>
            </button>;
          }) : <p className="px-2.5 py-3 text-xs text-muted-foreground">{emptyText}</p>}
        </div>
        {!selectionOnly && allowCreate && cleanCatalogValue(value) && !exactOption && (
          <div className="border-t border-border bg-muted px-3 py-2 text-[10px] text-muted-foreground">
            <span className="font-bold text-primary">{createLabel}:</span> {cleanCatalogValue(value)}
          </div>
        )}
      </PopoverContent>
    </Popover>

    {error && <p role="alert" className="mt-1 text-[10px] font-semibold text-red-600 dark:text-red-400">{error}</p>}
    {duplicateOption ? (
      <div className="mt-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-[var(--admin-warning-text)]">
        <div className="flex min-w-0 items-start gap-1.5 text-[10px] font-semibold leading-4">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">“{duplicateOption.name}” já está cadastrado.</span>
        </div>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectOption(duplicateOption)}
          className="mt-1.5 inline-flex min-h-6 items-center rounded-md border border-primary/20 bg-popover px-2 py-1 text-[9px] font-bold leading-none text-primary transition-colors hover:bg-primary-soft"
        >
          Usar cadastro
        </button>
      </div>
    ) : !selectionOnly && selectedId && selectedOption ? (
      <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-[var(--admin-success-text)]"><Check size={11} /> Cadastro existente selecionado.</p>
    ) : helperText ? (
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{helperText}</p>
    ) : null}
  </div>;
}


/** Select an existing record with the same local search as Nova OS. */
export function CatalogSearchSelect({label,ariaLabel,value,options,onValueChange,disabled,required,error,placeholder}:{
  label?:string; ariaLabel?:string; value:string|number;
  options:ReadonlyArray<{value:string|number;label:string}>;
  onValueChange:(value:string)=>void; disabled?:boolean; required?:boolean;error?:string;placeholder?:string;
}){
  const selectedId=String(value??"");
  const empty=options.find(option=>String(option.value)==="");
  const records=options.filter(option=>String(option.value)!=="").map(option=>({id:String(option.value),name:option.label}));
  const selected=records.find(option=>option.id===selectedId);
  return <CatalogCombobox label={label||ariaLabel||"Selecionar cadastro"} showLabel={Boolean(label)}
    selectionOnly allowCreate={false} allowClear={Boolean(empty)&&!required}
    selectedId={selectedId} value={selected?.name||""} options={records}
    disabled={disabled} required={required} error={error}
    placeholder={placeholder||empty?.label||"Digite ou selecione..."}
    onChange={()=>{}} onSelect={option=>onValueChange(option?.id||"")}/>;
}
