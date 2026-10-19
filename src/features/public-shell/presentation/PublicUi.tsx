import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/primitives/select";

const EMPTY_PUBLIC_SELECT_VALUE = "__public_select_empty__";

export function PublicButton({ children, variant = "primary", className = "", ...props }: {
  children: ReactNode;
  variant?: "primary" | "outline" | "ghost" | "whatsapp";
  className?: string;
  [key: string]: unknown;
}) {
  const base = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-bold transition-all duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60";
  const variants = {
    primary: "bg-[var(--art-primary)] text-white shadow-sm hover:-translate-y-0.5 hover:brightness-110 hover:shadow-lg hover:shadow-blue-500/20",
    outline: "border border-[var(--art-primary)] text-[var(--art-primary)] hover:-translate-y-0.5 hover:bg-[var(--art-primary)] hover:text-white hover:shadow-md",
    ghost: "text-[var(--art-primary)] px-0 hover:gap-3 hover:text-blue-700",
    whatsapp: "bg-[#25d366] text-white hover:-translate-y-0.5 hover:bg-[#1db954] hover:shadow-md",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

export function SectionLabel({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <span className={`mb-2 block text-[11px] font-bold uppercase tracking-[.12em] ${light ? "text-[#75beff]" : "text-[var(--art-primary)]"}`}>{children}</span>;
}

export function PublicHeading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-[25px] font-extrabold leading-[1.18] tracking-[-.035em] text-[var(--art-dark)] sm:text-[31px] ${className}`} style={{ fontFamily: "'Poppins', 'Inter', sans-serif" }}>{children}</h2>;
}

export function PublicSelect({ value, onValueChange, options, required = false, ariaLabel, className = "" }: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const toSelectValue = (optionValue: string) => optionValue === "" ? EMPTY_PUBLIC_SELECT_VALUE : optionValue;
  return <Select value={toSelectValue(value)} onValueChange={nextValue => onValueChange(nextValue === EMPTY_PUBLIC_SELECT_VALUE ? "" : nextValue)} required={required}>
    <SelectTrigger className={`h-auto min-h-12 w-full cursor-pointer rounded-md border border-[#0d1b2e]/15 bg-[#f5f7fa] px-4 py-3 text-left text-sm text-[#0d1b2e] outline-none transition-all focus:ring-2 focus:ring-[var(--art-primary)] ${className}`} aria-label={ariaLabel}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent className="border-[#0d1b2e]/10 bg-white text-[#0d1b2e] shadow-xl">
      {options.map(option => <SelectItem key={option.value || EMPTY_PUBLIC_SELECT_VALUE} value={toSelectValue(option.value)} className="cursor-pointer focus:bg-[#eef5ff] focus:text-[#0057e7]">{option.label}</SelectItem>)}
    </SelectContent>
  </Select>;
}
