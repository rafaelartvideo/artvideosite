import { Search, X } from "lucide-react";

/** Busca compacta para acompanhar cabeçalhos e abas de listagens administrativas. */
export function AdminInlineSearch({
  value,
  onChange,
  placeholder = "Buscar...",
  ariaLabel,
  iconTone = "primary",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  iconTone?: "primary" | "neutral";
}) {
  return (
    <div className="relative w-full min-w-0 sm:w-[280px] sm:max-w-[38vw]">
      <Search size={16} aria-hidden="true" className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${iconTone === "neutral" ? "text-muted-foreground" : "text-[#0057e7]"}`} />
      <input
        type="search"
        aria-label={ariaLabel}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-[42px] w-full rounded-lg border border-[#0057e7]/30 bg-white py-2 pl-9 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#0057e7] focus:ring-2 focus:ring-[#0057e7]/15"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Limpar busca"
          aria-label="Limpar busca"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-[#eef5ff] hover:text-[#0057e7]"
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
