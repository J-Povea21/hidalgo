/**
 * Builders for the data tests need, with sensible defaults: a test names only what it
 * is about. `anItem({ verdict: approvedAt(1) })` reads as what it is.
 */
import type { Item, Question, RunState, Verdict } from '@shared/contract.ts';
import { RUN_STATUS, VERDICT } from '@shared/values.ts';
import { card } from './fixtures.ts';

export function anItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    kind: 'card',
    rev: 1,
    fields: card('A card'),
    questions: [],
    threadId: 't2',
    ...overrides,
  };
}

export function aRun(overrides: Partial<RunState> = {}): RunState {
  return {
    id: 'r1',
    skill: 'card',
    project: 'Storefront',
    subject: 'CouponExists validator',
    status: RUN_STATUS.open,
    startedAt: '',
    items: [anItem()],
    threads: [],
    messages: [],
    diagrams: [],
    turn: 'claude',
    version: 3,
    eventThreads: {},
    appliedSeq: 0,
    ...overrides,
  };
}

export function anOpenQuestion(id = 'q1', text = 'Card the other validators separately?'): Question {
  return {
    id,
    text,
    evidence: [{ kind: 'verified', text: 'seen in the code' }],
    options: [
      { label: 'Separately', detail: 'one file' },
      { label: 'Here', detail: 'all at once' },
    ],
    recommended: 0,
  };
}

export function anAnsweredQuestion(id = 'q2'): Question {
  return { ...anOpenQuestion(id), answer: { choice: 0, at: '' } };
}

export function approvedAt(rev: number): Verdict {
  return { value: VERDICT.approved, rev, at: '' };
}
export function rejectedAt(rev: number): Verdict {
  return { value: VERDICT.rejected, rev, at: '' };
}
export function leftPendingAt(rev: number): Verdict {
  return { value: VERDICT.pending, rev, at: '' };
}
