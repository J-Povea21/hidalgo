/**
 * Claude's message in a thread. A reply names the event it answers and the
 * domain derives the thread from it; only a new message names a thread.
 */
import type { Clock, Ids } from '@server/domain/ports.ts';
import { addMessage } from '@server/domain/run.ts';
import { changeRun, type RunDeps } from '@server/domain/unit-of-work.ts';
import { PARTY } from '@shared/values.ts';

export interface SendMessageInput {
  runId: string;
  text: string;
  replyTo?: number | undefined;
  threadId?: string | undefined;
}

export function sendMessage(deps: RunDeps & { ids: Ids; clock: Clock }, input: SendMessageInput) {
  return changeRun(deps, input.runId, (run) => {
    const id = deps.ids.next('m');
    const next = addMessage(run, {
      text: input.text,
      from: PARTY.claude,
      now: deps.clock.now(),
      id,
      replyTo: input.replyTo,
      threadId: input.threadId,
    });
    return { run: next, result: { messageId: id, threadId: next.messages.at(-1)!.threadId } };
  });
}
