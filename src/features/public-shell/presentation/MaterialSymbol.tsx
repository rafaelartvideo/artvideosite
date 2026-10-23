import { useEffect, useState } from "react";
import { Shapes } from "lucide-react";

export type MaterialSymbolStyle = "outlined" | "rounded" | "sharp";

const fontNames: Record<MaterialSymbolStyle, string> = {
  outlined: "Material Symbols Outlined",
  rounded: "Material Symbols Rounded",
  sharp: "Material Symbols Sharp",
};

type Listener = { name: string; notify: (loaded: boolean) => void };
type FontState = {
  subscribers: Set<Listener>;
  readyNames: Set<string>;
  allReady: boolean;
  link: HTMLLinkElement | null;
  timer: ReturnType<typeof setTimeout> | null;
  requestNumber: number;
  failedKey: string;
};
const states = new Map<MaterialSymbolStyle, FontState>();

function stateFor(style: MaterialSymbolStyle): FontState {
  let state = states.get(style);
  if (!state) {
    state = { subscribers: new Set(), readyNames: new Set(), allReady: false,
      link: null, timer: null, requestNumber: 0, failedKey: "" };
    states.set(style, state);
  }
  return state;
}

function isReady(state: FontState, name: string): boolean {
  return state.allReady || state.readyNames.has(name);
}

function broadcast(state: FontState) {
  state.subscribers.forEach(subscriber => subscriber.notify(isReady(state, subscriber.name)));
}

/**
 * Request ONE Google Fonts stylesheet for the currently visible symbols, not one
 * request per icon. The documented icon_names parameter downloads a glyph subset,
 * rather than the entire Material Symbols font.
 */
function loadVisibleSymbols(style: MaterialSymbolStyle, state: FontState) {
  if (typeof document === "undefined") return;
  const names = [...new Set([...state.subscribers].map(sub => sub.name))].sort();
  if (!names.length || names.every(name => isReady(state, name))) return;
  const fullFont = names.length > 400;
  const key = fullFont ? "full" : names.join(",");
  if (state.failedKey === key) return;

  const requestNumber = ++state.requestNumber;
  // Avoid leaving stale requests active when a user searches or changes style.
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "https://fonts.googleapis.com/css2?family=" +
    "Material+Symbols+" + (style === "outlined" ? "Outlined" : style === "rounded" ? "Rounded" : "Sharp") +
    (fullFont ? "" : "&icon_names=" + names.join(",")) + "&display=block";
  stylesheet.dataset.artvideoMaterialSymbols = style;

  stylesheet.onload = () => {
    if (state.requestNumber !== requestNumber) { stylesheet.remove(); return; }
    state.link?.remove();
    state.link = stylesheet;
    state.allReady = fullFont;
    state.readyNames = new Set(names);
    state.failedKey = "";
    broadcast(state);
    // New symbols might have arrived while the request was in flight.
    scheduleLoad(style, state);
  };
  stylesheet.onerror = () => {
    stylesheet.remove();
    if (state.requestNumber !== requestNumber) return;
    state.failedKey = key;
    broadcast(state); // Keep a safe Lucide placeholder if Google Fonts is unavailable.
  };
  document.head.appendChild(stylesheet);
}

function scheduleLoad(style: MaterialSymbolStyle, state: FontState) {
  if (state.timer) clearTimeout(state.timer);
  if (state.allReady || [...state.subscribers].every(sub => isReady(state, sub.name))) return;
  // Batch the icons mounted together and debounce filtering in the admin picker.
  state.timer = setTimeout(() => {
    state.timer = null;
    loadVisibleSymbols(style, state);
  }, 180);
}

function subscribe(style: MaterialSymbolStyle, name: string, notify: (loaded: boolean) => void) {
  const state = stateFor(style);
  const listener = { name, notify };
  state.subscribers.add(listener);
  notify(isReady(state, name));
  scheduleLoad(style, state);
  return () => {
    state.subscribers.delete(listener);
    // No request on removal: the existing subset is reused until new icons appear.
  };
}

/** Prefix keeps previously saved Lucide icon values fully compatible. */
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
  const style = parsed?.style;
  const name = parsed?.name;
  const [loaded, setLoaded] = useState(() => Boolean(style && name && isReady(stateFor(style), name)));

  useEffect(() => {
    setLoaded(false);
    if (!style || !name) return;
    return subscribe(style, name, setLoaded);
  }, [style, name]);

  if (!style || !name || !loaded) {
    return <Shapes aria-hidden="true" size={size} className={className} strokeWidth={1.6}/>;
  }
  return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center select-none ${className}`}
    style={{
      fontFamily: fontNames[style],
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
    }}>{name}</span>;
}
