import type { Message } from '@shared/contract.ts';
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { addMessage } from '@server/common/domain/conversation.rules.ts';
import type { Clock } from '@server/common/ports/clock.port.ts';
import type { Ids } from '@server/common/ports/ids.port.ts';
import { PARTY } from '@shared/values.ts';

export interface SendMessageInput {
  runId: string;
  text: string;
  replyTo?: number | undefined;
  threadId?: string | undefined;
}

/**
 * Claude's message in a thread. A reply names the event it answers and the
 * domain derives the thread from it; only a new message names a thread.
 */
export class SendMessageUseCase {
  constructor(
    private readonly runs: RunChanges,
    private readonly ids: Ids,
    private readonly clock: Clock,
  ) {}

  execute(input: SendMessageInput): Promise<Message> {
    return this.runs.change(input.runId, (run) => {
      const { run: next, message } = addMessage(run, {
        text: input.text,
        from: PARTY.claude,
        now: this.clock.now(),
        id: this.ids.next('m'),
        replyTo: input.replyTo,
        threadId: input.threadId,
      });
      return { run: next, result: message };
    });
  }
}
