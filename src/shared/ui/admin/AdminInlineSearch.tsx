import { Search, X } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { cn } from "@/shared/domain/formatters";
import { INPUT } from "./AdminFormControls";

/** Busca compacta para acompanhar cabeçalhos e abas de listagens administrativas. */
export function AdminInlineSearch({
  value,
  onChange,
  placeholder = "Buscar...",
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={twMerge("relative w-full min-w-0 sm:w-[280px] sm:max-w-[38vw]", className)}>
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary dark:text-primary-light" />
      <input
        type="search"
        aria-label={ariaLabel}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(INPUT, "h-[42px] pl-9 pr-9")}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Limpar busca"
          aria-label="Limpar busca"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:text-primary-light"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

/** Remove acentos e diferenças de caixa sem alterar o texto original exibido. */
export function matchesAdminSearch(value: string | null | undefined, search: string) {
  const normalize = (input: string) => input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  return normalize(String(value ?? "")).includes(normalize(search.trim()));
}
