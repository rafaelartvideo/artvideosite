import { createLocalPerformance } from './local-performance.mjs';
import { screenName } from './performance-screen-rules.mjs';

declare const __APP_BUILD_SHA__: string;
export const localPerformance = createLocalPerformance();
const listeners = new Set<() => void>();
export const subscribePerformance = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const aliases = new Map<string,string>();
export function performanceAlias(kind: string, value: string | null | undefined) {
  if (!value) return 'anonymous';
  const key = kind + value;
  if (!aliases.has(key)) {
    if (aliases.size >= 64) { localPerformance.stop(); return 'context-limit'; }
    aliases.set(key, kind + '-' + (aliases.size + 1));
  }
  return aliases.get(key)!;
}
export function networkContext() {
  const connection = (navigator as any).connection;
  return JSON.stringify({ online:navigator.onLine, type:connection?.effectiveType??'unknown',
    rtt:connection?.rtt??null, downlink:connection?.downlink??null, saveData:connection?.saveData??null });
}
const measuredFetch=localPerformance.wrapFetch((input: RequestInfo | URL, init?: RequestInit) => fetch(input,init));
export const performanceFetch: typeof fetch = (input,init) => {
  if(localPerformance.active())localPerformance.context({screen:screenName(window.location.pathname),network:networkContext(),visibility:document.visibilityState});
  return measuredFetch(input,init);
};

if (typeof window !== 'undefined') {
  (window as any).unionPerformance = Object.freeze({
    start(options: { cache?: string } = {}) {
      aliases.clear();
      localPerformance.start({ build:__APP_BUILD_SHA__, session:crypto.randomUUID(),
        network:networkContext(), cache:['cold','warm'].includes(options.cache??'')?options.cache:'uncontrolled',
        visibility:document.visibilityState });
      for (const listener of listeners) listener();
      return 'Coleta local ativa por até oito horas, retenção máxima de 25.000 registros; nenhum envio automático.';
    },
    stop() { localPerformance.stop(); for (const listener of listeners) listener(); },
    report: () => localPerformance.report(),
    export: () => localPerformance.export(),
    download() {
      const url = URL.createObjectURL(new Blob([JSON.stringify(localPerformance.export(),null,2)],{type:'application/json'}));
      const link = document.createElement('a'); link.href=url; link.download='union-performance.json'; link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    },
  });
}
