type ProgressSession = { direction?: string; on: (name: string, listener: (...args: any[]) => void) => void };
type Tone = { progress: (code: number) => void; stop: () => void };

/** All originating paths share this session, including OS and the floating phone. */
export function bindOutgoingRingback(session: ProgressSession, tone: Tone, current: () => boolean) {
  if (session.direction !== 'outgoing') return;
  let finished = false;
  session.on('progress', ({ response }: { response?: { status_code?: number } } = {}) => {
    if (!finished && current() && (response?.status_code === 180 || response?.status_code === 183)) tone.progress(response.status_code);
  });
  for (const event of ['accepted', 'confirmed', 'ended', 'failed']) session.on(event, () => {
    finished = true;
    tone.stop();
  });
}

/** Brazilian ringback: 425 Hz, one second on, four seconds off. */
export function ringbackWave() {
  const rate = 8000, frames = rate * 5;
  const bytes = new ArrayBuffer(44 + frames * 2), view = new DataView(bytes);
  const text = (offset: number, value: string) => [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, frames * 2, true);
  for (let i = 0; i < rate; i++) {
    const envelope = Math.min(1, i / 40, (rate - i - 1) / 40);
    view.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 425 * i / rate) * 12000 * envelope), true);
  }
  return bytes;
}

export function createCallRingback(options: { getOutput: () => HTMLAudioElement | null; onBlocked: (value: boolean) => void }) {
  const audio = new Audio();
  const url = URL.createObjectURL(new Blob([ringbackWave()], { type: 'audio/wav' }));
  audio.src = url; audio.loop = true; audio.volume = 0;
  let finished = false, ringing = false, audible = false, routed = false, playBlocked = false, routingBlocked = false, analysisBlocked = false;
  let context: AudioContext | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const sources: MediaStreamAudioSourceNode[] = [];
  const streams = new Set<MediaStream>();
  const monitored = new Set<MediaStream>();
  const update = () => { audio.volume = !finished && ringing && !audible && routed && !(streams.size && analysisBlocked) ? 0.55 : 0; };
  const report = () => { if (!finished) options.onBlocked(playBlocked || routingBlocked || analysisBlocked); };
  const retryAnalysis = () => {
    if (finished) return;
    analysisBlocked = !context || context.state !== 'running';
    if (!analysisBlocked) for (const stream of streams) monitor(stream);
    update(); report();
  };
  const prepare = () => {
    if (finished) return;
    // Called synchronously from the click that places the call, before SIP/ICE.
    // Keep the element playing silently so later SIP events retain audio access.
    try {
      try {
        if (!context && typeof AudioContext !== 'undefined') {
          context = new AudioContext();
          context.onstatechange = retryAnalysis;
        }
        retryAnalysis();
        if (context?.state === 'suspended') void context.resume().then(retryAnalysis).catch(() => {
          if (!finished) { analysisBlocked = true; update(); report(); }
        });
      } catch { analysisBlocked = true; update(); report(); }
      const output = options.getOutput() as (HTMLAudioElement & { sinkId?: string }) | null;
      const sink = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      routed = !output?.sinkId;
      routingBlocked = false;
      if (output?.sinkId && sink.setSinkId) void sink.setSinkId(output.sinkId).then(() => {
        if (!finished) { routed = true; report(); update(); }
      }).catch(() => { routingBlocked = true; report(); });
      else if (output?.sinkId) routingBlocked = true;
      void audio.play().then(() => { playBlocked = false; report(); }).catch(() => { playBlocked = true; report(); });
      update();
    } catch { if (!finished) options.onBlocked(true); }
  };
  const stop = () => {
    if (finished) return;
    finished = true; audio.volume = 0; audio.pause(); audio.removeAttribute('src'); audio.load();
    options.onBlocked(false);
    if (timer) clearInterval(timer);
    for (const source of sources) source.disconnect();
    if (context) void context.close().catch(() => {});
    URL.revokeObjectURL(url);
  };
  const monitor = (stream: MediaStream) => {
    if (finished || monitored.has(stream)) return;
    if (!context || context.state !== 'running') { analysisBlocked = true; update(); report(); return; }
    try {
      const source = context.createMediaStreamSource(stream), analyser = context.createAnalyser();
      analyser.fftSize = 512;
      // Analyze remote sound without replaying it: the existing <audio> owns voice.
      const silent = context.createGain(); silent.gain.value = 0;
      source.connect(analyser); analyser.connect(silent); silent.connect(context.destination); sources.push(source);
      monitored.add(stream);
      const samples = new Float32Array(analyser.fftSize);
      let soundFrames = 0;
      const check = () => {
        if (finished || audible) return;
        analyser.getFloatTimeDomainData(samples);
        let energy = 0; for (const sample of samples) energy += sample * sample;
        soundFrames = energy / samples.length > 0.000009 ? soundFrames + 1 : 0;
        if (soundFrames >= 3) {
          // Latch for this call: gaps in an operator's ring cadence must not
          // restart local tone over announcements or a subsequent remote ring.
          audible = true; update();
        }
      };
      if (timer) clearInterval(timer);
      timer = setInterval(check, 50);
    } catch { analysisBlocked = true; update(); report(); }
  };
  const observe = (stream: MediaStream) => {
    if (finished) return;
    streams.add(stream); monitor(stream);
  };
  return { prepare, observe, progress: (_code: number) => { if (!finished) { if (!ringing) audio.currentTime = 0; ringing = true; update(); } }, stop, dispose: stop };
}
