export function linkAbortSignals(signals: Array<AbortSignal | undefined>) {
  const controller = new AbortController();
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));

  const abort = (signal: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abort(signal);
      break;
    }
    signal.addEventListener('abort', () => abort(signal), { once: true });
  }

  return controller;
}
