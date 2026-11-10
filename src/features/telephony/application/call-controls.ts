export type CallControlSession = {
  isEstablished: () => boolean;
  isReadyToReOffer: () => boolean;
  isOnHold?: () => { local: boolean; remote: boolean };
  hold: (options: Record<string, unknown>, done: () => void) => boolean;
  unhold: (options: Record<string, unknown>, done: () => void) => boolean;
  refer: (target: string, options: { eventHandlers: Record<string, () => void> }) => unknown;
};

type OperationOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (stage: 'processing' | 'ringing') => void;
};

function operation(
  options: OperationOptions,
  begin: (done: () => void, fail: (error: Error) => void, pending: () => boolean) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(new DOMException('Operação cancelada.', 'AbortError'));
    if (options.signal?.aborted) { abort(); return; }
    options.signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => {
      const error = new Error('O PABX não confirmou a operação no tempo esperado. Confira o estado da chamada.');
      error.name = 'CallControlTimeoutError';
      finish(error);
    }, options.timeoutMs ?? 35_000);
    try { begin(() => finish(), finish, () => !settled); }
    catch { finish(new Error('Não foi possível enviar o comando ao PABX.')); }
  });
}

export function holdCall(session: CallControlSession, held: boolean, options: OperationOptions = {}) {
  if (!session.isEstablished()) return Promise.reject(new Error('Não há chamada ativa para colocar em espera.'));
  if (!session.isReadyToReOffer()) return Promise.reject(new Error('Aguarde a negociação de áudio em andamento.'));
  return operation(options, (done, fail) => {
    const accepted = held ? session.hold({}, done) : session.unhold({}, done);
    if (!accepted) fail(new Error('Aguarde: o PABX não iniciou a negociação de espera.'));
  });
}

export function transferCall(
  session: CallControlSession,
  destination: string,
  allowedExtensions: ReadonlySet<string>,
  options: OperationOptions = {},
) {
  if (!session.isEstablished()) return Promise.reject(new Error('Não há chamada ativa para transferir.'));
  if (!/^[1-9]\d{2,3}$/.test(destination) || !allowedExtensions.has(destination)) {
    return Promise.reject(new Error('Selecione um ramal interno disponível na sua empresa.'));
  }
  return operation(options, (done, fail, pending) => {
    const failed = () => fail(new Error('A transferência não foi concluída pelo PABX ou pelo ramal de destino.'));
    const result = session.refer(`sip:${destination}@pbx.unionworld.com.br`, {
      eventHandlers: {
        // A 2xx response to REFER confirms processing, not a completed handover.
        requestSucceeded: () => { if (pending()) options.onProgress?.('processing'); },
        trying: () => { if (pending()) options.onProgress?.('processing'); },
        progress: () => { if (pending()) options.onProgress?.('ringing'); },
        accepted: done,
        failed,
        requestFailed: failed,
      },
    });
    if (result === false) failed();
  });
}
