/**
 * Builders for the data tests need, with sensible defaults: a test names only what it
 * is about. `anItem({ verdict: approvedAt(1) })` reads as what it is.
 */
import type { Item, Question, RunState, Verdict } from '@shared/contract.ts';
import { RUN_STATUS, VERDICT } from '@shared/values.ts';
import { card } from './fixtures.ts';

export const anItem = (overrides: Partial<Item> = {}): Item => ({
  id: 'i1',
  kind: 'card',
  rev: 1,
  fields: card('A card'),
  questions: [],
  threadId: 't2',
  ...overrides,
});

export const aRun = (overrides: Partial<RunState> = {}): RunState => ({
  id: 'r1',
  skill: 'card',
  project: 'MiPlan',
  subject: 'OfficesExist validator',
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
});

export const anOpenQuestion = (id = 'q1', text = 'Card the other validators separately?'): Question => ({
  id,
  text,
  evidence: [{ kind: 'verified', text: 'seen in the code' }],
  options: [
    { label: 'Separately', detail: 'one file' },
    { label: 'Here', detail: 'all at once' },
  ],
  recommended: 0,
});

export const anAnsweredQuestion = (id = 'q2'): Question => ({ ...anOpenQuestion(id), answer: { choice: 0, at: '' } });

export const approvedAt = (rev: number): Verdict => ({ value: VERDICT.approved, rev, at: '' });
export const rejectedAt = (rev: number): Verdict => ({ value: VERDICT.rejected, rev, at: '' });
export const leftPendingAt = (rev: number): Verdict => ({ value: VERDICT.pending, rev, at: '' });
