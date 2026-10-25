import { describe, expect, it } from 'vitest';
import type { LiveEntry, PageEvent } from '@shared/contract.ts';
import { SendPageEventUseCase } from '@client/common/application/use-cases/send-page-event.use-case.ts';
import { ApiError } from '@client/common/domain/errors.ts';
import type { SentEvent, WorkbenchServer } from '@client/common/ports/workbench-server.port.ts';

const MESSAGE: PageEvent = { type: 'message', threadId: 't1', text: 'hello', images: [] };

/** A server whose answer to sendEvent the test decides. */
class ServerAnswering implements WorkbenchServer {
  constructor(private readonly answer: () => Promise<SentEvent>) {}
  sendEvent(): Promise<SentEvent> {
    return this.answer();
  }
  async liveRuns(): Promise<LiveEntry[]> {
    return [];
  }
  async imageBlob(): Promise<string> {
    return '';
  }
  follow(): () => void {
    return () => undefined;
  }
}

describe('sending what the user did to Claude', () => {
  it('tells the user it was sent', async () => {
    const send = new SendPageEventUseCase(new ServerAnswering(async () => ({ seq: 1 })));

    const result = await send.execute({ event: MESSAGE, sentNotice: 'Sent to Claude' });

    expect(result).toEqual({ sent: true, notice: 'Sent to Claude' });
  });

  it('tells the user the run is close to its image limit instead, when the server warns', async () => {
    const warning = 'This run is close to its image limit.';
    const send = new SendPageEventUseCase(new ServerAnswering(async () => ({ seq: 1, imageWarning: warning })));

    const result = await send.execute({ event: MESSAGE, sentNotice: 'Sent to Claude' });

    expect(result).toEqual({ sent: true, notice: warning });
  });

  it("gives the server's reason when it refuses", async () => {
    const refusal = new ApiError(409, 'This item changed; review the new revision.', 'stale-revision');
    const send = new SendPageEventUseCase(new ServerAnswering(() => Promise.reject(refusal)));

    const result = await send.execute({ event: MESSAGE, sentNotice: 'Sent to Claude' });

    expect(result).toEqual({ sent: false, notice: refusal.message });
  });

  it('says the session is unreachable, and that the text is kept, when the request never arrives', async () => {
    const send = new SendPageEventUseCase(new ServerAnswering(() => Promise.reject(new TypeError('Failed to fetch'))));

    const result = await send.execute({ event: MESSAGE, sentNotice: 'Sent to Claude' });

    expect(result).toEqual({ sent: false, notice: "Not sent: Claude's session is unreachable. Your text is kept." });
  });
});
