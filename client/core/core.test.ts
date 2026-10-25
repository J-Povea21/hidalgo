import { describe, expect, it } from 'vitest';
import type { Item, RunState } from '@shared/contract.ts';
import { pendingForUser } from '@shared/rules.ts';
import { card } from '@test/fixtures.ts';
import { itemStatus, tabTitle, turnView } from './selectors.ts';
import { ACTIVE_FOR_MS, initialState, reduce, type Presence } from './state.ts';

const item = (over: Partial<Item> = {}): Item => ({ id: 'i1', kind: 'card', rev: 1, fields: card('A card'), questions: [], threadId: 't2', ...over });
const run = (over: Partial<RunState> = {}): RunState => ({
  id: 'r1', skill: 'card', project: 'MiPlan', subject: 'OfficesExist validator', status: 'open', startedAt: '', items: [item()],
  threads: [], messages: [], diagrams: [], turn: 'claude', version: 3, eventThreads: {}, appliedSeq: 0, ...over,
});
const q = (answered: boolean) => ({ id: 'q', text: 't', evidence: [], options: [{ label: 'a', detail: '' }, { label: 'b', detail: '' }], recommended: 0, ...(answered ? { answer: { choice: 0, at: '' } } : {}) });

const NOW = 1_000_000;
const listening: Presence = { claudeListening: true, claudeActiveAt: NOW };
const working: Presence = { claudeListening: false, claudeActiveAt: NOW - 1000 };
const quiet: Presence = { claudeListening: false, claudeActiveAt: NOW - ACTIVE_FOR_MS - 1 };
const live = (presence: Presence, r = run()) =>
  reduce(reduce(initialState, { type: 'state', run: r, presence }), { type: 'connection', connection: { kind: 'live' } });

describe('reducer', () => {
  it('takes newer state and never goes back to an older one, but keeps the newer presence', () => {
    const s1 = reduce(initialState, { type: 'state', run: run({ version: 5 }), presence: working });
    const s2 = reduce(s1, { type: 'state', run: run({ version: 4, subject: 'old' }), presence: listening });
    expect(s2.run!.version).toBe(5);
    expect(s2.claudeListening).toBe(true);
  });

  it('a keep-alive with the same presence returns the same state (no re-render)', () => {
    const s = live(listening);
    expect(reduce(s, { type: 'presence', presence: { ...listening } })).toBe(s);
    expect(reduce(s, { type: 'presence', presence: working }).claudeListening).toBe(false);
  });

  it('a goodbye sticks until the connection is live again', () => {
    const ended = reduce(initialState, { type: 'connection', connection: { kind: 'ended', reason: 'bye' } });
    expect(reduce(ended, { type: 'connection', connection: { kind: 'reconnecting', since: 0 } }).connection.kind).toBe('ended');
    expect(reduce(ended, { type: 'connection', connection: { kind: 'live' } }).connection.kind).toBe('live');
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
    expect(pendingForUser(run({ items: [item({ questions: [q(false), q(true)] }), item({ id: 'i2' })] }))).toBe(2);
  });

  it('the turn: yours while Claude listens, working while it acts, idle once it went quiet', () => {
    expect(turnView(live(listening), NOW)).toBe('yours');
    expect(turnView(live(working), NOW)).toBe('working');
    expect(turnView(live(quiet), NOW)).toBe('idle');
    expect(turnView(live({ claudeListening: false, claudeActiveAt: null }), NOW)).toBe('idle');
  });

  it('the tab title leads with whose turn it is', () => {
    expect(tabTitle(live(listening), NOW)).toBe('(1) MiPlan · card · OfficesExist validator');
    expect(tabTitle(live(working), NOW)).toBe('… MiPlan · card · OfficesExist validator');
    expect(tabTitle(live(quiet), NOW)).toBe('○ MiPlan · card · OfficesExist validator');
    expect(tabTitle(live(listening, run({ status: 'closed' })), NOW)).toBe('✓ MiPlan · card · OfficesExist validator');
    expect(tabTitle(live(listening, run({ status: 'paused' })), NOW)).toBe('⏸ MiPlan · card · OfficesExist validator');
  });

  it('cuts the title at 60 characters', () => {
    const title = tabTitle(live(listening, run({ subject: 'x'.repeat(80) })), NOW);
    expect(title).toHaveLength(60);
    expect(title.endsWith('…')).toBe(true);
  });

  it('turn is offline once the session ended, and while reconnecting', () => {
    const s = reduce(live(listening), { type: 'connection', connection: { kind: 'ended', reason: 'x' } });
    expect(turnView(s, NOW)).toBe('offline');
    const r = reduce(live(working), { type: 'connection', connection: { kind: 'reconnecting', since: 0 } });
    expect(turnView(r, NOW)).toBe('offline');
  });
});
