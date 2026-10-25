import { describe, expect, it } from 'vitest';
import type { RunState } from '@shared/contract.ts';
import { pendingForUser } from '@shared/rules.ts';
import { RUN_STATUS } from '@shared/values.ts';
import { anAnsweredQuestion, anItem, anOpenQuestion, approvedAt, aRun } from '@test/builders.ts';
import { itemStatus, tabTitle, turnView, typingIn } from '@client/common/domain/selectors.ts';
import {
  ACTIVE_FOR_MS,
  actions,
  CONNECTION,
  initialState,
  reduce,
  type Presence,
} from '@client/common/domain/state.ts';

const NOW = 1_000_000;
/** What the server says about Claude, as of NOW. */
const CLAUDE = {
  listening: { claudeListening: true, claudeActiveAt: NOW },
  working: { claudeListening: false, claudeActiveAt: NOW - 1_000 },
  quiet: { claudeListening: false, claudeActiveAt: NOW - ACTIVE_FOR_MS - 1 },
  neverSeen: { claudeListening: false, claudeActiveAt: null },
} satisfies Record<string, Presence>;

/** A connected page showing `run`, with Claude in the given state. */
const aLivePage = (claude: Presence, run: RunState = aRun()) =>
  [actions.state(run, claude), actions.connection({ kind: CONNECTION.live })].reduce(reduce, initialState);

describe("an item's status", () => {
  it('is ready when nothing is open and nothing is decided', () => {
    expect(itemStatus(anItem())).toBe('ready');
  });

  it('is questions while any question is open', () => {
    expect(itemStatus(anItem({ questions: [anOpenQuestion()] }))).toBe('questions');
  });

  it('is approved when the approval names the current revision', () => {
    expect(itemStatus(anItem({ rev: 1, verdict: approvedAt(1) }))).toBe('approved');
  });

  it('is ready again when the item changed after it was approved', () => {
    expect(itemStatus(anItem({ rev: 2, verdict: approvedAt(1) }))).toBe('ready');
  });

  it('is done once an approved item was acted on', () => {
    expect(itemStatus(anItem({ verdict: approvedAt(1), done: { at: '', note: 'created' } }))).toBe('done');
  });
});

describe('what waits on the user', () => {
  it('counts open questions plus items ready for a verdict', () => {
    const run = aRun({
      items: [anItem({ questions: [anOpenQuestion(), anAnsweredQuestion()] }), anItem({ id: 'i2' })],
    });
    expect(pendingForUser(run)).toBe(2);
  });
});

describe('whose turn the page shows', () => {
  it("is the user's while Claude listens", () => {
    expect(turnView(aLivePage(CLAUDE.listening), NOW)).toBe('yours');
  });

  it("is Claude's, working, within a minute of its last tool call", () => {
    expect(turnView(aLivePage(CLAUDE.working), NOW)).toBe('working');
  });

  it('is idle once Claude went quiet, or was never seen', () => {
    expect(turnView(aLivePage(CLAUDE.quiet), NOW)).toBe('idle');
    expect(turnView(aLivePage(CLAUDE.neverSeen), NOW)).toBe('idle');
  });

  it('is offline once the session ended, and while reconnecting', () => {
    const ended = reduce(aLivePage(CLAUDE.listening), actions.connection({ kind: CONNECTION.ended, reason: 'bye' }));
    const reconnecting = reduce(
      aLivePage(CLAUDE.working),
      actions.connection({ kind: CONNECTION.reconnecting, since: 0 }),
    );
    expect(turnView(ended, NOW)).toBe('offline');
    expect(turnView(reconnecting, NOW)).toBe('offline');
  });
});

describe('the tab title', () => {
  const SUFFIX = 'MiPlan · card · OfficesExist validator';

  it('leads with what waits on the user, or with how Claude is', () => {
    expect(tabTitle(aLivePage(CLAUDE.listening), NOW)).toBe(`(1) ${SUFFIX}`);
    expect(tabTitle(aLivePage(CLAUDE.working), NOW)).toBe(`… ${SUFFIX}`);
    expect(tabTitle(aLivePage(CLAUDE.quiet), NOW)).toBe(`○ ${SUFFIX}`);
  });

  it('marks a closed run and a paused one', () => {
    expect(tabTitle(aLivePage(CLAUDE.listening, aRun({ status: RUN_STATUS.closed })), NOW)).toBe(`✓ ${SUFFIX}`);
    expect(tabTitle(aLivePage(CLAUDE.listening, aRun({ status: RUN_STATUS.paused })), NOW)).toBe(`⏸ ${SUFFIX}`);
  });

  it('is cut at 60 characters, ending in an ellipsis', () => {
    const title = tabTitle(aLivePage(CLAUDE.listening, aRun({ subject: 'x'.repeat(80) })), NOW);
    expect(title).toHaveLength(60);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('the "Claude is working" line in a thread', () => {
  it('shows in the thread something was sent from, while Claude works', () => {
    expect(typingIn(aLivePage(CLAUDE.working), NOW, 't2', 't2')).toBe('Claude is thinking…');
  });

  it("uses Claude's status line when it set one", () => {
    expect(typingIn(aLivePage(CLAUDE.working, aRun({ statusLine: 'reading the code' })), NOW, 't2', 't2')).toBe(
      'Claude: reading the code',
    );
  });

  it('does not show in another thread, nor once Claude went quiet', () => {
    expect(typingIn(aLivePage(CLAUDE.working), NOW, 't2', 't9')).toBeUndefined();
    expect(typingIn(aLivePage(CLAUDE.quiet), NOW, 't2', 't2')).toBeUndefined();
  });
});
