type RequestOptions = { signal?: AbortSignal; timeoutMs?: number };

/** A lost response does not prove that a server-side write failed. */
export function pbxOperationError(_error?: unknown) {
  return { data: null, error: { code: 'PBX_UNCONFIRMED',
    message: 'Operação sem confirmação. Atualize os dados antes de repetir uma alteração.' } };
}

/** Bound both fetch and the UI wait, including transports that ignore abort. */
export function pbxRequest<T>(
  request: (signal: AbortSignal) => PromiseLike<T>,
  stage: string,
  options: RequestOptions = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value as T);
    };
    const abort = () => {
      finish(new DOMException('Solicitação cancelada.', 'AbortError'));
      controller.abort();
    };
    if (options.signal?.aborted) { abort(); return; }
    options.signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => {
      finish(new Error(`${stage}: o servidor não respondeu no tempo esperado. Tente novamente.`));
      controller.abort();
    }, options.timeoutMs ?? 15_000);
    try { Promise.resolve(request(controller.signal)).then(value => finish(null, value), error => finish(error)); }
    catch (error) { finish(error); }
  });
}
