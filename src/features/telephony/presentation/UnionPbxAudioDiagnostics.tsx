import { useEffect, useState } from 'react';
import { summarizeAudioStats, type AudioStats } from '../domain/webrtc-stats';

export function UnionPbxAudioDiagnostics({ connection }: { connection?: RTCPeerConnection }) {
  const [stats, setStats] = useState<AudioStats | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setStats(null);
    setFailed(false);
    if (!connection) return;
    const sample = async () => {
      try {
        const report = await connection.getStats();
        if (cancelled) return;
        setStats(summarizeAudioStats(report));
        setFailed(false);
      } catch {
        if (cancelled) return;
        setStats(null);
        setFailed(true);
      }
      if (!cancelled) timer = setTimeout(sample, 2000);
    };
    void sample();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [connection]);
  const ms = (value: number | null | undefined) => value == null ? 'Indisponível' : `${value.toFixed(1)} ms`;
  return <section aria-label="Diagnóstico de áudio" className="rounded-lg border border-border bg-muted/30 p-3">
    <h3 className="text-sm font-semibold text-foreground">Diagnóstico de áudio</h3>
    {failed ? <p role="status" className="mt-2 text-xs text-muted-foreground">O navegador não forneceu as métricas. Nova consulta em instantes.</p>
      : !stats ? <p role="status" className="mt-2 text-xs text-muted-foreground">Aguardando métricas da conexão de áudio.</p>
      : <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        {[
          ['Codec recebido', stats.codec || 'Indisponível'],
          ['Jitter recebido', ms(stats.jitterMs)],
          ['RTT da conexão', ms(stats.roundTripMs)],
          ['Pacotes recebidos', stats.packetsReceived ?? 'Indisponível'],
          ['Perda acumulada recebida', stats.packetsLost ?? 'Indisponível'],
          ['Buffer médio de reprodução', ms(stats.playbackBufferMs)],
        ].map(([label, value]) => <div key={String(label)}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold text-foreground">{value}</dd></div>)}
      </dl>}
    <p className="mt-3 text-xs leading-5 text-muted-foreground">Medições deste navegador até o PABX. O buffer é a média desde o início do fluxo; o RTT mede ida e volta da rede. Estes valores não medem o atraso completo entre as pessoas. Nenhum áudio é gravado.</p>
  </section>;
}
