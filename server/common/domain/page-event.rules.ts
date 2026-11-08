/**
 * Applying what the user did on the page to a run. Used when the event arrives and when
 * logged events are replayed after a crash, so both paths agree. In common/ because a
 * resume (runs/) replays them as well as page-events/ applying them.
 */
import type { RecordedEvent, RunState, UnsequencedEvent } from '@shared/contract.ts';
import { PARTY } from '@shared/values.ts';
import { addMessage, rememberEventThread, threadOfItem } from './conversation.rules.ts';
import { applyAnswers, applyEdit, applyVerdict } from './item.rules.ts';

/** The thread an event belongs to, or undefined for events that have none (a diagram failure). */
export function threadOfEvent(run: RunState, ev: RecordedEvent): string | undefined {
  switch (ev.type) {
    case 'message':
      return ev.threadId;
    case 'diagram-failed':
      return undefined;
    default:
      return threadOfItem(run, ev.itemId);
  }
}

/** An event with its place in the log. */
export function sequenced(event: UnsequencedEvent, seq: number): RecordedEvent {
  return { ...event, seq };
}

/** Throws a HidalgoError when the event can't apply (stale revision, open questions, unknown thread). */
export function applyEvent(run: RunState, ev: RecordedEvent): RunState {
  let next: RunState;
  switch (ev.type) {
    case 'answers':
      next = applyAnswers(run, ev.itemId, ev.answers, ev.at);
      break;
    case 'verdict':
      next = applyVerdict(run, ev.itemId, ev.rev, ev.value, ev.at);
      break;
    case 'edit':
      next = applyEdit(run, ev.itemId, ev.path, ev.text);
      break;
    case 'message':
      next = addMessage(run, {
        text: ev.text,
        from: PARTY.user,
        now: ev.at,
        id: `u${ev.seq}`,
        threadId: ev.threadId,
        images: ev.images,
      }).run;
      break;
    case 'diagram-failed':
      next = run;
      break;
  }
  const thread = threadOfEvent(run, ev);
  if (thread) {
    next = rememberEventThread(next, ev.seq, thread);
  }
  return { ...next, appliedSeq: Math.max(next.appliedSeq, ev.seq) };
}

/** Replays logged events the saved state hasn't absorbed yet; skips ones that no longer apply. */
export function replay(run: RunState, events: RecordedEvent[]): RunState {
  let next = run;
  for (const ev of events) {
    if (ev.seq <= next.appliedSeq) {
      continue;
    }
    try {
      next = applyEvent(next, ev);
    } catch {
      next = { ...next, appliedSeq: ev.seq };
    }
  }
  return next;
}
