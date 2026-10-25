/**
 * Claude's message in a thread. A reply names the event it answers and the
 * domain derives the thread from it; only a new message names a thread.
 */
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { addMessage } from '@server/common/domain/run.ts';
import type { Clock } from '@server/common/ports/clock.port.ts';
import type { Ids } from '@server/common/ports/ids.port.ts';
import { PARTY } from '@shared/values.ts';

export interface SendMessageInput {
  runId: string;
  text: string;
  replyTo?: number | undefined;
  threadId?: string | undefined;
}

export class SendMessageUseCase {
  constructor(
    private readonly runs: RunChanges,
    private readonly ids: Ids,
    private readonly clock: Clock,
  ) {}

  execute(input: SendMessageInput) {
    return this.runs.change(input.runId, (run) => {
      const id = this.ids.next('m');
      const next = addMessage(run, {
        text: input.text,
        from: PARTY.claude,
        now: this.clock.now(),
        id,
        replyTo: input.replyTo,
        threadId: input.threadId,
      });
      return { run: next, result: { messageId: id, threadId: next.messages.at(-1)!.threadId } };
    });
  }
}
