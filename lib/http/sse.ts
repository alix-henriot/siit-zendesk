export type SseSend = (event: string, data: unknown) => void;

type SseOptions = {
  /** Aborts the stream, typically `request.signal`. */
  signal: AbortSignal;
  /** Proxies and load balancers commonly drop connections idle for 30-60s. */
  heartbeatMs: number;
  /**
   * Runs once the stream is open. Returns a teardown called exactly once when
   * the stream ends, whichever side closes it.
   */
  setup: (send: SseSend) => () => void;
};

/**
 * `send` is called from foreign event emitters, so it never throws: a failed
 * write (client gone) closes the stream instead.
 */
export function sseResponse({ signal, heartbeatMs, setup }: SseOptions): Response {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let teardown: (() => void) | undefined;
  let closed = false;
  let onAbort = () => {};

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    signal.removeEventListener("abort", onAbort);
    teardown?.();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send: SseSend = (event, data) =>
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      onAbort = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // Already closed or errored by the runtime.
        }
      };

      teardown = setup(send);
      // A write inside setup may have closed the stream before teardown existed.
      if (closed) teardown();

      heartbeat = setInterval(() => write(": ping\n\n"), heartbeatMs);
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    },
    cancel: cleanup,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disables response buffering in nginx-based proxies.
      "X-Accel-Buffering": "no",
    },
  });
}
