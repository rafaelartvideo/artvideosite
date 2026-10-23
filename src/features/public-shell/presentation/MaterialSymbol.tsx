import { useEffect, useState } from "react";
import { Shapes } from "lucide-react";

export type MaterialSymbolStyle = "outlined" | "rounded" | "sharp";

const fontNames: Record<MaterialSymbolStyle, string> = {
  outlined: "Material Symbols Outlined",
  rounded: "Material Symbols Rounded",
  sharp: "Material Symbols Sharp",
};

const loadedStyles = new Map<MaterialSymbolStyle, Promise<boolean>>();

function ensureMaterialFont(style: MaterialSymbolStyle): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  const cached = loadedStyles.get(style);
  if (cached) return cached;
  const promise = new Promise<boolean>((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+" +
      (style === "outlined" ? "Outlined" : style === "rounded" ? "Rounded" : "Sharp") +
      "&display=block";
    link.dataset.artvideoMaterialSymbols = style;
    link.onload = () => resolve(true);
    link.onerror = () => resolve(false);
    document.head.appendChild(link);
  });
  loadedStyles.set(style, promise);
  return promise;
}

/** Material Symbols are stored with a prefix so existing Lucide category icons remain compatible. */
export function parseMaterialIcon(value: unknown): { name: string; style: MaterialSymbolStyle } | null {
  if (typeof value !== "string") return null;
  const match = /^material(?:-(outlined|rounded|sharp))?:([a-z0-9_]+)$/.exec(value);
  if (!match) return null;
  return { name: match[2], style: (match[1] as MaterialSymbolStyle | undefined) || "outlined" };
}

export function materialIconValue(name: string, style: MaterialSymbolStyle = "outlined"): string {
  return `material-${style}:${name}`;
}

export function MaterialSymbol({
  icon, size = 24, className = "",
}: {
  icon: string;
  size?: number;
  className?: string;
}) {
  const parsed = parseMaterialIcon(icon);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
    if (!parsed) return;
    let active = true;
    void ensureMaterialFont(parsed.style).then(ok => { if (active) setLoaded(ok); });
    return () => { active = false; };
  }, [parsed?.style]);
  if (!parsed || !loaded) return <Shapes aria-hidden="true" size={size} className={className} strokeWidth={1.6}/>;
  return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center select-none ${className}`}
    style={{
      fontFamily: fontNames[parsed.style],
      fontWeight: "normal",
      fontStyle: "normal",
      fontSize: size,
      lineHeight: 1,
      letterSpacing: "normal",
      textTransform: "none",
      whiteSpace: "nowrap",
      direction: "ltr",
      fontFeatureSettings: "'liga'",
      fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
    }}>{parsed.name}</span>;
}
