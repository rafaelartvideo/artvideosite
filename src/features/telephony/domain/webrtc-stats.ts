export type AudioStats = {
  jitterMs: number | null;
  roundTripMs: number | null;
  packetsLost: number | null;
  packetsReceived: number | null;
  playbackBufferMs: number | null;
  codec: string | null;
};

export function summarizeAudioStats(report: RTCStatsReport): AudioStats {
  const entries: any[] = [];
  report.forEach(item => entries.push(item));
  const inbound = entries.find(item => item.type === 'inbound-rtp' &&
    (item.kind === 'audio' || item.mediaType === 'audio'));
  const selected = entries.find(item => item.type === 'transport' && item.selectedCandidatePairId);
  const pair = selected ? report.get(selected.selectedCandidatePairId) : undefined;
  const codec = inbound?.codecId ? report.get(inbound.codecId) : undefined;
  const finite = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  const milliseconds = (value: unknown) => {
    const seconds = finite(value);
    return seconds !== null && seconds >= 0 ? seconds * 1000 : null;
  };
  const delay = finite(inbound?.jitterBufferDelay);
  const samples = finite(inbound?.jitterBufferEmittedCount);
  return {
    jitterMs: milliseconds(inbound?.jitter),
    roundTripMs: milliseconds(pair?.currentRoundTripTime),
    packetsLost: finite(inbound?.packetsLost),
    packetsReceived: finite(inbound?.packetsReceived),
    playbackBufferMs: delay !== null && delay >= 0 && samples !== null && samples > 0
      ? delay / samples * 1000 : null,
    codec: typeof codec?.mimeType === 'string' ? codec.mimeType.replace(/^audio\//i, '') : null,
  };
}
