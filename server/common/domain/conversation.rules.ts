/**
 * The run's conversations: where a message goes, which thread a page event belongs to, and
 * the diagrams messages embed. In common/ because both Claude (conversation/) and the user
 * (page-events/) post messages, and modules can't import each other.
 */
import type { Diagram, Message, RunState } from '@shared/contract.ts';
import { WorkbenchError } from './errors.ts';
import { assertOpen, clone, findItem, touch } from './run.rules.ts';

/**
 * Where a message goes. A reply is addressed by the event it answers, never by
 * a thread the caller names; a caller that names both must agree with the event.
 */
export function addMessage(
  run: RunState,
  message: {
    text: string;
    from: Message['from'];
    now: string;
    id: string;
    replyTo?: number | undefined;
    threadId?: string | undefined;
    images?: string[] | undefined;
  },
): { run: RunState; message: Message } {
  let threadId = message.threadId;
  if (message.replyTo !== undefined) {
    const fromEvent = run.eventThreads[message.replyTo];
    if (!fromEvent) {
      throw new WorkbenchError('not-found', `no recorded event #${message.replyTo} in run ${run.id}`);
    }
    if (threadId !== undefined && threadId !== fromEvent) {
      throw new WorkbenchError(
        'thread-mismatch',
        `event #${message.replyTo} came from thread ${fromEvent}, not ${threadId}; nothing was posted`,
      );
    }
    threadId = fromEvent;
  }
  assertOpen(run);
  if (threadId === undefined) {
    throw new WorkbenchError('invalid', 'a message needs replyTo or threadId');
  }
  if (!run.threads.some((thread) => thread.id === threadId)) {
    throw new WorkbenchError('not-found', `no thread ${threadId} in run ${run.id}`);
  }
  const posted: Message = {
    id: message.id,
    threadId,
    from: message.from,
    at: message.now,
    text: message.text,
    ...(message.images?.length ? { images: message.images } : {}),
    ...(message.replyTo !== undefined ? { replyTo: message.replyTo } : {}),
  };
  const next = clone(run);
  next.messages.push(posted);
  return { run: touch(next), message: posted };
}

/** The thread a page event belongs to; used to record it and to check the thread is in this run. */
export function threadOfItem(run: RunState, itemId: string): string {
  return findItem(run, itemId).threadId;
}

export function rememberEventThread(run: RunState, seq: number, threadId: string): RunState {
  if (!run.threads.some((thread) => thread.id === threadId)) {
    throw new WorkbenchError('not-found', `no thread ${threadId} in run ${run.id}`);
  }
  return { ...run, eventThreads: { ...run.eventThreads, [seq]: threadId } };
}

/** Adds a diagram the run's messages and items can embed. */
export function addDiagram(run: RunState, diagram: Diagram): RunState {
  assertOpen(run);
  return touch({ ...clone(run), diagrams: [...run.diagrams, diagram] });
}
