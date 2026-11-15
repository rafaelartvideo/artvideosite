/** One bounded post-answer re-INVITE for external calls.
 * The SIP dialog remains established; no hold, ICE restart or track replacement.
 * This compensates for trunks whose first 200 OK leaves one-way media until
 * the caller manually places the call on hold and resumes it.
 */
type OutboundSession = {
  isEstablished: () => boolean;
  isReadyToReOffer: () => boolean;
  isOnHold?: () => { local: boolean; remote: boolean };
  isMuted?: () => { audio: boolean };
  renegotiate?: (options: { useUpdate: boolean }, done: () => void) => boolean;
  connection?: {
    signalingState?: string;
    iceConnectionState?: string;
    getSenders?: () => { track?: { kind: string; enabled: boolean; readyState: string } | null }[];
  };
  on: (event: string, callback: () => void) => void;
};

export function bindExternalAudioStabilization(
  session: OutboundSession,
  hooks: { isCurrent: () => boolean; onMissingMicrophone?: () => void; delayMs?: number } ,
) {
  let stopped = false;
  let started = false;
  let retries = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const current = () => !stopped && hooks.isCurrent();
  const dispose = () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const postpone = (milliseconds: number) => {
    if (!current() || started || retries >= 3) return;
    retries += 1;
    timer = setTimeout(refresh, milliseconds);
  };
  const refresh = () => {
    timer = undefined;
    if (!current() || started || !session.isEstablished()) return;
    // Never renegotiate when the operator has put the call on hold,
    // explicitly muted it, or another re-INVITE is already in flight.
    const hold = session.isOnHold?.();
    if (hold?.local || hold?.remote || session.isMuted?.().audio) return;
    const peer = session.connection;
    if (!peer || peer.iceConnectionState === 'failed' ||
        peer.iceConnectionState === 'closed') return;
    if (peer.signalingState && peer.signalingState !== 'stable') {
      postpone(1_000);
      return;
    }
    const senders = peer.getSenders?.() || [];
    const outgoing = senders.find(sender => sender.track?.kind === 'audio')?.track;
    if (!outgoing || outgoing.readyState !== 'live') {
      hooks.onMissingMicrophone?.();
      return;
    }
    if (!outgoing.enabled) return;
    if (!session.isReadyToReOffer() || !session.renegotiate) {
      postpone(1_000);
      return;
    }
    // A single in-dialog re-INVITE refreshes the media direction without
    // muting the person being called or changing the call to hold.
    try {
      const accepted = session.renegotiate({ useUpdate: false }, () => {});
      if (accepted === false) postpone(1_000);
      else started = true;
    } catch {
      // Transient SIP glare: do not create an uncontrolled negotiation loop.
      postpone(1_000);
    }
  };
  session.on('confirmed', () => {
    if (!current() || timer !== undefined || started) return;
    timer = setTimeout(refresh, hooks.delayMs ?? 1_800);
  });
  session.on('failed', dispose);
  session.on('ended', dispose);
  return dispose;
}
