import { useEffect, useState } from "react";
import { Shapes } from "lucide-react";

export type MaterialSymbolStyle = "outlined" | "rounded" | "sharp";
export type MaterialSymbolWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700;

const fontNames: Record<MaterialSymbolStyle, string> = {
  outlined: "Material Symbols Outlined",
  rounded: "Material Symbols Rounded",
  sharp: "Material Symbols Sharp",
};

type Listener = { name: string; glyph: string; notify: (ready: boolean) => void };
type FontState = {
  listeners: Set<Listener>;
  loadedNames: Set<string>;
  fullFont: boolean;
  stylesheet: HTMLLinkElement | null;
  timer: ReturnType<typeof setTimeout> | null;
  pending: boolean;
  lastFailedKey: string | null;
};
const styles = new Map<MaterialSymbolStyle, FontState>();

function getState(style: MaterialSymbolStyle): FontState {
  let state = styles.get(style);
  if (!state) {
    state = { listeners: new Set(), loadedNames: new Set(), fullFont: false,
      stylesheet: null, timer: null, pending: false, lastFailedKey: null };
    styles.set(style, state);
  }
  return state;
}

function isReady(state: FontState, name: string): boolean {
  return state.fullFont || state.loadedNames.has(name);
}

function inform(state: FontState) {
  state.listeners.forEach(item => item.notify(isReady(state, item.name)));
}

function planFontLoad(style: MaterialSymbolStyle, state: FontState) {
  if (state.timer) clearTimeout(state.timer);
  if (state.pending || state.fullFont ||
      [...state.listeners].every(item => isReady(state, item.name))) return;
  // One debounced stylesheet per visible group, never one request per icon.
  state.timer = setTimeout(() => {
    state.timer = null;
    void loadFont(style, state);
  }, 200);
}

async function loadFont(style: MaterialSymbolStyle, state: FontState) {
  if (typeof document === "undefined" || !("fonts" in document) || state.pending) return;
  const required = [...state.listeners].filter(item => !isReady(state, item.name));
  if (!required.length) return;
  const names = [...new Set([...state.loadedNames, ...[...state.listeners].map(item => item.name)])].sort();
  const useFullFont = names.length > 350;
  const key = useFullFont ? "*" : names.join(",");
  if (key === state.lastFailedKey) return;

  state.pending = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  const family = "Material+Symbols+" + (style === "outlined" ? "Outlined" : style === "rounded" ? "Rounded" : "Sharp");
  // The wght range supports the thickness slider without another font download.
  link.href = "https://fonts.googleapis.com/css2?family=" + family +
    ":wght@100..700" + (useFullFont ? "" : "&icon_names=" + names.join(",")) +
    "&display=block";
  link.dataset.artvideoMaterialSymbols = style;

  const onFailure = () => {
    link.remove();
    state.pending = false;
    state.lastFailedKey = key;
    inform(state); // Display safe Lucide fallback, never clipped icon names.
  };

  link.onerror = onFailure;
  link.onload = () => {
    // Loading a stylesheet is not equivalent to loading its font file.
    // Check the actual glyph before making Material Symbols visible.
    void document.fonts.load(`400 24px "${fontNames[style]}"`, required[0].glyph)
      .then(faces => {
        if (!faces.some(face => face.status === "loaded")) {
          onFailure();
          return;
        }
        state.stylesheet?.remove();
        state.stylesheet = link;
        state.fullFont = useFullFont;
        state.loadedNames = new Set(names);
        state.pending = false;
        state.lastFailedKey = null;
        inform(state);
        planFontLoad(style, state); // Newly mounted icons are batched next.
      })
      .catch(onFailure);
  };
  document.head.appendChild(link);
}

/**
 * Existing values such as material-rounded:tv remain compatible (weight 400).
 * Non-default weights persist inside the same icon string, without a DB migration.
 */
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
    let mounted = true;
    let unsubscribe: (() => void) | null = null;
    setReady(false);
    setGlyph(null);
    if (!style || !name) return;

    // The glyph map is lazy-loaded only when a Material Symbol is actually used.
    void import("../domain/material-symbols-catalog").then(({ materialSymbolGlyph }) => {
      if (!mounted) return;
      const char = materialSymbolGlyph(name);
      if (!char) return;
      setGlyph(char);
      const state = getState(style);
      const listener: Listener = { name, glyph: char, notify: setReady };
      state.listeners.add(listener);
      setReady(isReady(state, name));
      planFontLoad(style, state);
      unsubscribe = () => state.listeners.delete(listener);
    }).catch(() => { if (mounted) setReady(false); });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [style, name]);

  if (!parsed || !glyph || !ready) {
    return <Shapes aria-hidden="true" size={size} className={className} strokeWidth={1.6}/>;
  }

  return <span aria-hidden="true"
    className={`inline-flex shrink-0 items-center justify-center select-none ${className}`}
    style={{
      fontFamily: `"${fontNames[style!]}"`,
      fontWeight: weight,
      fontStyle: "normal",
      fontSize: size,
      lineHeight: 1,
      letterSpacing: "normal",
      whiteSpace: "nowrap",
      fontVariationSettings: `'FILL' 0, 'wght' ${weight}, 'GRAD' 0, 'opsz' 24`,
    }}>{glyph}</span>;
}
