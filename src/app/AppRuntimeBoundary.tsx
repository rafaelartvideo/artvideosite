import { Component, type ErrorInfo, type ReactNode } from "react";

const MODULE_RELOAD_KEY = "artvideo:module-reload-attempt";
const MODULE_RELOAD_WINDOW_MS = 30_000;

function errorText(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function isModuleLoadError(error: unknown) {
  const message = errorText(error).toLowerCase();
  return [
    "failed to fetch dynamically imported module",
    "error loading dynamically imported module",
    "importing a module script failed",
    "failed to load module script",
    "chunkloaderror",
    "loading chunk",
    "unable to preload css",
  ].some(pattern => message.includes(pattern));
}

function reloadOnce() {
  if (!import.meta.env.PROD) return false;

  const now = Date.now();
  try {
    const previousAttempt = Number(window.sessionStorage.getItem(MODULE_RELOAD_KEY) || 0);
    if (Number.isFinite(previousAttempt) && now - previousAttempt < MODULE_RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(MODULE_RELOAD_KEY, String(now));
  } catch {
    // sessionStorage can be unavailable in restricted/private browser contexts.
  }

  window.location.reload();
  return true;
}

export function recoverFromModuleLoadError(error: unknown) {
  if (!isModuleLoadError(error)) return false;
  return reloadOnce();
}

export function installModuleLoadRecovery() {
  if (!import.meta.env.PROD || typeof window === "undefined") return;

  window.addEventListener("vite:preloadError", event => {
    // Vite emits this event when a lazy/preloaded hashed asset disappeared after a deploy.
    // A single reload obtains the new no-cache index.html and its current asset hashes.
    if (reloadOnce()) event.preventDefault();
  });

  window.addEventListener("unhandledrejection", event => {
    if (recoverFromModuleLoadError(event.reason)) event.preventDefault();
  });

  window.setTimeout(() => {
    try {
      window.sessionStorage.removeItem(MODULE_RELOAD_KEY);
    } catch {
      // Ignore storage restrictions.
    }
  }, 60_000);
}

type Props = { children: ReactNode };
type State = { error: unknown | null };

export class AppRuntimeBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[APP] Erro não tratado na interface:", error, info.componentStack);
    recoverFromModuleLoadError(error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          background: "#f5f7fa",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: 460,
            border: "1px solid #d9e1ec",
            borderRadius: 16,
            background: "white",
            padding: 24,
            boxShadow: "0 14px 40px rgba(13,27,46,.10)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              margin: "0 auto",
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#e8eef8",
              color: "#0057e7",
              fontSize: 22,
              fontWeight: 900,
            }}
          >
            !
          </div>
          <h1 style={{ margin: "16px 0 0", color: "#0d1b2e", fontSize: 20 }}>
            Não foi possível carregar esta tela
          </h1>
          <p style={{ margin: "10px 0 0", color: "#5a6a82", fontSize: 14, lineHeight: 1.55 }}>
            A página pode ter sido atualizada enquanto estava aberta ou ocorreu um erro inesperado. Atualize para continuar.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              width: "100%",
              minHeight: 44,
              marginTop: 20,
              border: 0,
              borderRadius: 12,
              background: "#0057e7",
              color: "white",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Atualizar página
          </button>
          <details style={{ marginTop: 14, color: "#7a8799", fontSize: 11, textAlign: "left" }}>
            <summary style={{ cursor: "pointer", textAlign: "center" }}>Detalhes técnicos</summary>
            <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{errorText(this.state.error)}</pre>
          </details>
        </section>
      </main>
    );
  }
}
