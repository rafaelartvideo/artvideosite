import type { DTMFOptions } from 'jssip/lib/RTCSession';

export type PbxDigitSession = {
  isEstablished: () => boolean;
  sendDTMF: (tones: string, options?: DTMFOptions) => void;
  connection?: {
    getSenders: () => Array<{
      track?: { kind: string } | null;
      dtmf?: { canInsertDTMF: boolean; insertDTMF: (tones: string, duration?: number, interToneGap?: number) => void } | null;
    }>;
  };
};

/** Reuses the established JsSIP session; never creates or terminates a call. */
export function sendPbxDigit(session: PbxDigitSession | null | undefined, digit: string): void {
  if (typeof digit !== 'string' || digit.length !== 1 || !/^[0-9*#]$/.test(digit)) {
    throw new Error('Escolha uma única tecla de 0 a 9, * ou #.');
  }
  if (!session || typeof session.isEstablished !== 'function' || !session.isEstablished()) {
    throw new Error('Não há chamada ativa para enviar a tecla.');
  }
  if (typeof session.sendDTMF !== 'function') {
    throw new Error('O teclado não está disponível nesta chamada.');
  }
  // JsSIP 3.13.9 silently returns when no audio RTP DTMF sender exists. Check the
  // same first audio sender before calling it so the UI can explain that failure.
  // RFC2833 is JsSIP's name for RTP telephone-event, used by Asterisk rfc4733.
  // https://jssip.net/documentation/3.10.x/api/session/#section_sendDTMF
  // https://docs.asterisk.org/Asterisk_22_Documentation/API_Documentation/Module_Configuration/res_pjsip/#dtmf_mode
  let capable = false;
  try {
    const sender = session.connection?.getSenders?.().find(item => item.track?.kind === 'audio');
    capable = Boolean(sender?.dtmf?.canInsertDTMF && typeof sender.dtmf.insertDTMF === 'function');
  } catch { /* Unsupported or closed peer connection. */ }
  if (!capable) throw new Error('Este navegador não permite usar o teclado nesta chamada.');
  try {
    session.sendDTMF(digit, { transportType: 'RFC2833' as DTMFOptions['transportType'] });
  } catch {
    throw new Error('Não foi possível enviar a tecla. Confira se a chamada continua ativa.');
  }
}
