import { describe, expect, it } from 'vitest';
import type { Item, RunState } from '../../shared/contract.ts';
import { itemStatus, tabTitle, turn, waitingCount } from './selectors.ts';
import { initialState, reduce } from './state.ts';

const item = (over: Partial<Item> = {}): Item => ({ id: 'i1', kind: 'card', rev: 1, fields: { title: 'A card' }, questions: [], threadId: 't2', ...over });
const run = (over: Partial<RunState> = {}): RunState => ({
  id: 'r1', skill: 'card', project: 'MiPlan', subject: 'OfficesExist validator', status: 'open', startedAt: '', items: [item()],
  threads: [], messages: [], diagrams: [], turn: 'claude', version: 3, eventThreads: {}, appliedSeq: 0, ...over,
});
const q = (answered: boolean) => ({ id: 'q', text: 't', evidence: [], options: [{ label: 'a', detail: '' }, { label: 'b', detail: '' }], recommended: 0, ...(answered ? { answer: { choice: 0, at: '' } } : {}) });

describe('reducer', () => {
  it('takes newer state and never goes back to an older one', () => {
    const s1 = reduce(initialState, { type: 'state', run: run({ version: 5 }), waiting: false });
    const s2 = reduce(s1, { type: 'state', run: run({ version: 4, subject: 'old' }), waiting: true });
    expect(s2.run!.version).toBe(5);
    expect(s2.waiting).toBe(true);
  });

  it('a goodbye sticks until a fresh state arrives', () => {
    const ended = reduce(initialState, { type: 'connection', connection: { kind: 'ended', reason: 'bye' } });
    expect(reduce(ended, { type: 'connection', connection: { kind: 'reconnecting', since: 0 } }).connection.kind).toBe('ended');
    expect(reduce(ended, { type: 'connection', connection: { kind: 'live' } }).connection.kind).toBe('live');
  });

  it('state clears the sending counter', () => {
    const sent = reduce(reduce(initialState, { type: 'sent' }), { type: 'sent' });
    expect(sent.sending).toBe(2);
    expect(reduce(sent, { type: 'state', run: run(), waiting: true }).sending).toBe(0);
  });
});

describe('selectors', () => {
  it('an item is ready, or approved only at its current revision', () => {
    expect(itemStatus(item())).toBe('ready');
    expect(itemStatus(item({ verdict: { value: 'approved', rev: 1, at: '' } }))).toBe('approved');
    expect(itemStatus(item({ rev: 2, verdict: { value: 'approved', rev: 1, at: '' } }))).toBe('ready');
    expect(itemStatus(item({ questions: [q(false)] }))).toBe('questions');
    expect(itemStatus(item({ verdict: { value: 'approved', rev: 1, at: '' }, done: { at: '', note: 'x' } }))).toBe('done');
  });

  it('counts open questions plus items ready for a verdict', () => {
    expect(waitingCount(run({ items: [item({ questions: [q(false), q(true)] }), item({ id: 'i2' })] }))).toBe(2);
  });

  it('the tab title leads with whose turn it is', () => {
    const s = reduce(initialState, { type: 'state', run: run(), waiting: true });
    expect(tabTitle(s)).toBe('(1) MiPlan · card · OfficesExist validator');
    expect(tabTitle({ ...s, waiting: false })).toBe('… MiPlan · card · OfficesExist validator');
    expect(tabTitle({ ...s, run: run({ status: 'closed' }) })).toBe('✓ MiPlan · card · OfficesExist validator');
    expect(tabTitle(s, '14:02')).toBe('(1) MiPlan · card · OfficesExist validator · 14:02');
  });

  it('cuts the title at 60 characters', () => {
    const s = reduce(initialState, { type: 'state', run: run({ subject: 'x'.repeat(80) }), waiting: true });
    expect(tabTitle(s)).toHaveLength(60);
    expect(tabTitle(s).endsWith('…')).toBe(true);
  });

  it('turn is offline once the session ended', () => {
    const s = reduce(reduce(initialState, { type: 'state', run: run(), waiting: true }), { type: 'connection', connection: { kind: 'ended', reason: 'x' } });
    expect(turn(s)).toBe('offline');
  });
});
