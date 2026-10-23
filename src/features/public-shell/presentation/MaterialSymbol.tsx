import { useEffect, useState } from "react";
import { Shapes } from "lucide-react";

export type MaterialSymbolStyle = "outlined" | "rounded" | "sharp";
export type MaterialSymbolWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700;

const fontNames: Record<MaterialSymbolStyle, string> = {
  outlined: "Material Symbols Outlined",
  rounded: "Material Symbols Rounded",
  sharp: "Material Symbols Sharp",
};

// The optimized icon_names endpoint currently omits Unicode private-use glyphs
// from its declared unicode-range. Using those subsets made remote_gen render as
// a square; using ligatures could expose raw text instead. A complete font per
// style fixes both issues and is cached by the browser across page visits.
const fontLoaders = new Map<MaterialSymbolStyle, Promise<boolean>>();

function loadFont(style: MaterialSymbolStyle, sample: string): Promise<boolean> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve(false);
  const cached = fontLoaders.get(style);
  if (cached) return cached;

  const promise = new Promise<boolean>(resolve => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+" +
      (style === "outlined" ? "Outlined" : style === "rounded" ? "Rounded" : "Sharp") +
      ":wght@100..700&display=block";
    link.dataset.artvideoMaterialSymbols = style;

    link.onerror = () => {
      link.remove();
      resolve(false);
    };
    link.onload = () => {
      // A CSS response alone does not mean the font data has downloaded.
      // document.fonts.load uses a real Unicode icon instead of a ligature name.
      void document.fonts.load(`400 24px "${fontNames[style]}"`, sample)
        .then(faces => resolve(faces.some(face => face.status === "loaded")))
        .catch(() => resolve(false));
    };
    document.head.appendChild(link);
  });
  fontLoaders.set(style, promise);
  // A temporary network failure must not permanently poison later visits.
  void promise.then(ok => { if (!ok) fontLoaders.delete(style); });
  return promise;
}

/** Older saved icon strings without a weight remain compatible (weight 400). */
export function parseMaterialIcon(value: unknown): {
  name: string;
  style: MaterialSymbolStyle;
  weight: MaterialSymbolWeight;
} | null {
  if (typeof value !== "string") return null;
  const match = /^material(?:-(outlined|rounded|sharp))?(?:-(100|200|300|400|500|600|700))?:([a-z0-9_]+)$/.exec(value);
  if (!match) return null;
  return {
    name: match[3],
    style: (match[1] as MaterialSymbolStyle | undefined) || "outlined",
    weight: match[2] ? Number(match[2]) as MaterialSymbolWeight : 400,
  };
}

export function materialIconValue(
  name: string,
  style: MaterialSymbolStyle = "outlined",
  weight: MaterialSymbolWeight = 400,
): string {
  return `material-${style}${weight === 400 ? "" : "-" + weight}:${name}`;
}

export function MaterialSymbol({
  icon, size = 24, className = "",
}: {
  icon: string;
  size?: number;
  className?: string;
}) {
  const parsed = parseMaterialIcon(icon);
  const name = parsed?.name;
  const style = parsed?.style;
  const weight = parsed?.weight ?? 400;
  const [glyph, setGlyph] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    setGlyph(null);
    setReady(false);
    if (!style || !name) return;

    // The official Unicode codepoint map is bundled locally and loaded only
    // when the Material Symbols feature is actually used.
    void import("../domain/material-symbols-catalog")
      .then(async ({ materialSymbolGlyph }) => {
        const char = materialSymbolGlyph(name);
        if (!char || !active) return;
        const loaded = await loadFont(style, char);
        if (!active || !loaded) return;
        setGlyph(char);
        setReady(true);
      })
      .catch(() => { if (active) setReady(false); });

    return () => { active = false; };
  }, [style, name]);

  // Do not ever show a raw ligature name or an uninitialized private-use glyph.
  if (!parsed || !glyph || !ready) {
    return <Shapes aria-hidden="true" size={size} className={className} strokeWidth={1.6}/>;
  }

  return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center select-none ${className}`}
    style={{
      fontFamily: `"${fontNames[parsed.style]}"`,
      fontWeight: weight,
      fontStyle: "normal",
      fontSize: size,
      lineHeight: 1,
      letterSpacing: "normal",
      whiteSpace: "nowrap",
      fontVariationSettings: `'FILL' 0, 'wght' ${weight}, 'GRAD' 0, 'opsz' 24`,
    }}>{glyph}</span>;
}
