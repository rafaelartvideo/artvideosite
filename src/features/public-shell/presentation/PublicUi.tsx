import type { ReactNode } from "react";

export function PublicButton({ children, variant = "primary", className = "", ...props }: {
  children: ReactNode;
  variant?: "primary" | "outline" | "ghost" | "whatsapp";
  className?: string;
  [key: string]: unknown;
}) {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-md px-5 py-2.5 text-sm transition-all duration-200 cursor-pointer";
  const variants = {
    primary: "bg-[#0057e7] text-white hover:bg-[#0046c0] active:scale-[0.98]",
    outline: "border-2 border-[#0057e7] text-[#0057e7] hover:bg-[#0057e7] hover:text-white active:scale-[0.98]",
    ghost: "text-[#0057e7] hover:underline underline-offset-2 px-0",
    whatsapp: "bg-[#25d366] text-white hover:bg-[#1db954] active:scale-[0.98]",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

export function SectionLabel({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <span className={`text-xs font-bold tracking-widest uppercase block mb-3 ${light ? "text-[#00b4ff]" : "text-[#0057e7]"}`}>{children}</span>;
}

export function PublicHeading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-3xl sm:text-4xl font-black text-[#0d1b2e] ${className}`} style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{children}</h2>;
}
