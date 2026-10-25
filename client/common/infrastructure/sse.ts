const EVENT_END = '\n\n';
const DEFAULT_EVENT = 'message';

/**
 * Reads server-sent events from a fetch body. The page can't use EventSource, which can't
 * send the token header.
 */
export async function readSse(body: ReadableStream<Uint8Array>, onEvent: (event: string, data: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      return;
    }
    pending += decoder.decode(value, { stream: true });
    let end = pending.indexOf(EVENT_END);
    while (end >= 0) {
      const { event, data } = parseBlock(pending.slice(0, end));
      if (data) {
        onEvent(event, data);
      }
      pending = pending.slice(end + EVENT_END.length);
      end = pending.indexOf(EVENT_END);
    }
  }
}

/** One event: its `event:` name (or the default) and its `data:` lines joined. */
function parseBlock(block: string): { event: string; data: string } {
  let event = DEFAULT_EVENT;
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      data += line.slice('data:'.length).trim();
    }
  }
  return { event, data };
}
