type MediaSession = {
  connection?: RTCPeerConnection;
  on: (event: string, handler: (...args: any[]) => void) => void;
};
type AudioBinding = {
  isCurrent: () => boolean;
  getAudio: () => HTMLAudioElement | null;
  onBlocked: (blocked: boolean) => void;
};

export function bindRemoteAudio(session: MediaSession, binding: AudioBinding) {
  let disposed = false;
  const peers = new Map<RTCPeerConnection, (event: RTCTrackEvent) => void>();
  const current = () => !disposed && binding.isCurrent();
  const play = (stream: MediaStream) => {
    if (!current()) return;
    const audio = binding.getAudio();
    if (!audio) return;
    audio.srcObject = stream;
    void audio.play().then(() => {
      if (current() && audio.srcObject === stream) binding.onBlocked(false);
    }).catch(() => {
      if (current() && audio.srcObject === stream) binding.onBlocked(true);
    });
  };
  const bindPeer = (peer: RTCPeerConnection) => {
    if (!current() || peers.has(peer)) return;
    const listener = (event: RTCTrackEvent) => {
      if (!current() || event.track.kind !== 'audio') return;
      play(event.streams[0] || new MediaStream([event.track]));
    };
    peers.set(peer, listener);
    peer.addEventListener('track', listener);
    // A peer can already contain its audio receiver when JsSIP exposes it.
    const tracks = peer.getReceivers().map(receiver => receiver.track)
      .filter(track => track?.kind === 'audio' && track.readyState !== 'ended');
    if (tracks.length) play(new MediaStream(tracks));
  };
  const dispose = () => {
    disposed = true;
    for (const [peer, listener] of peers) peer.removeEventListener('track', listener);
    peers.clear();
  };
  session.on('peerconnection', ({ peerconnection }: { peerconnection?: RTCPeerConnection }) => {
    if (peerconnection) bindPeer(peerconnection);
  });
  session.on('ended', dispose);
  session.on('failed', dispose);
  if (session.connection) bindPeer(session.connection);
  return dispose;
}
