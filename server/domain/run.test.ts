import { describe, expect, it } from 'vitest';
import { card, counterIds, question, T0 } from '@test/fixtures.ts';
import { WorkbenchError } from './errors.ts';
import {
  addItems,
  addMessage,
  applyAnswers,
  applyEdit,
  applyVerdict,
  ask,
  close,
  markDone,
  newRun,
  rememberEventThread,
  runThreadId,
  updateItem,
} from './run.ts';
import { isFinal, pendingForUser } from '@shared/rules.ts';

const start = () => {
  const ids = counterIds();
  const run = newRun({ id: 'r1', skill: 'card', project: 'MiPlan', subject: 'validator', now: T0, threadId: ids('t') });
  return { ids, run };
};
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof WorkbenchError ? error.code : 'not a WorkbenchError';
  }
  return 'no error';
};

describe('items', () => {
  it('adds a valid card with its own thread at rev 1', () => {
    const { ids, run } = start();
    const { run: next, added } = addItems(run, [{ kind: 'card', fields: card() }], ids);
    expect(added).toEqual([{ id: 'i1', rev: 1, threadId: 't2' }]);
    expect(next.threads.map((thread) => thread.owner)).toEqual([{ type: 'run' }, { type: 'item', itemId: 'i1' }]);
    expect(next.version).toBe(run.version + 1);
  });

  it('rejects an unknown kind and a card that fails its schema, naming the reason', () => {
    const { ids, run } = start();
    expect(code(() => addItems(run, [{ kind: 'finding', fields: {} }], ids))).toBe('invalid');
    expect(code(() => addItems(run, [{ kind: 'card', fields: { ...card(), title: '' } }], ids))).toBe('invalid');
  });

  it('does not mutate the run it was given', () => {
    const { ids, run } = start();
    const before = structuredClone(run);
    addItems(run, [{ kind: 'card', fields: card() }], ids);
    expect(run).toEqual(before);
  });

  it('a patch changes only the given fields and bumps the revision', () => {
    const { ids, run } = start();
    const r1 = addItems(run, [{ kind: 'card', fields: card() }], ids).run;
    const { run: r2, rev } = updateItem(r1, 'i1', { proposal: { priority: 'normal' } });
    const { fields } = r2.items[0]!;
    expect(rev).toBe(2);
    expect(fields.proposal).toEqual({ ...card().proposal, priority: 'normal' });
    expect(fields.title).toBe(card().title);
  });
});

describe('the approval gate', () => {
  const ready = () => {
    const { ids, run } = start();
    return { ids, run: addItems(run, [{ kind: 'card', fields: card() }], ids).run };
  };

  it('approves only the current revision', () => {
    const { run } = ready();
    const changed = updateItem(run, 'i1', { proposal: { priority: 'low' } }).run;
    expect(code(() => applyVerdict(changed, 'i1', 1, 'approved', T0))).toBe('stale-revision');
    expect(applyVerdict(changed, 'i1', 2, 'approved', T0).items[0]!.verdict).toEqual({
      value: 'approved',
      rev: 2,
      at: T0,
    });
  });

  it('refuses Approve while questions are open, and allows it once answered', () => {
    const { ids, run } = ready();
    const { run: asked, questionIds, rev } = ask(run, 'i1', [question()], ids);
    expect(code(() => applyVerdict(asked, 'i1', rev, 'approved', T0))).toBe('open-questions');
    const answered = applyAnswers(asked, 'i1', { [questionIds[0]!]: { choice: 1, note: 'do it here' } }, T0);
    expect(answered.items[0]!.questions[0]!.answer).toEqual({ choice: 1, note: 'do it here', at: T0 });
    expect(applyVerdict(answered, 'i1', rev, 'approved', T0).items[0]!.verdict?.value).toBe('approved');
  });

  it('allows Reject and Leave pending even with open questions', () => {
    const { ids, run } = ready();
    const { run: asked, rev } = ask(run, 'i1', [question()], ids);
    expect(applyVerdict(asked, 'i1', rev, 'rejected', T0).items[0]!.verdict?.value).toBe('rejected');
    expect(applyVerdict(asked, 'i1', rev, 'pending', T0).items[0]!.verdict?.value).toBe('pending');
  });

  it('any later change voids an approval', () => {
    const { run } = ready();
    const approved = applyVerdict(run, 'i1', 1, 'approved', T0);
    expect(updateItem(approved, 'i1', { tags: ['x'] }).run.items[0]!.verdict).toBeUndefined();
    expect(applyEdit(approved, 'i1', 'criteria.0.text', 'Rewritten by the user').items[0]!.verdict).toBeUndefined();
  });

  it('a user edit changes exactly that text, records it, and bumps the revision', () => {
    const { run } = ready();
    const edited = applyEdit(run, 'i1', 'criteria.1.text', 'A test per input type');
    const item = edited.items[0]!;
    expect(item.fields.criteria[1]!.text).toBe('A test per input type');
    expect(item.edits).toEqual({ 'criteria.1.text': 'A test per input type' });
    expect(item.rev).toBe(2);
    expect(code(() => applyEdit(run, 'i1', 'criteria.9.text', 'x'))).toBe('invalid');
  });

  it('rejects answers to unknown questions or options', () => {
    const { ids, run } = ready();
    const { run: asked, questionIds } = ask(run, 'i1', [question()], ids);
    expect(code(() => applyAnswers(asked, 'i1', { nope: { choice: 0 } }, T0))).toBe('not-found');
    expect(code(() => applyAnswers(asked, 'i1', { [questionIds[0]!]: { choice: 5 } }, T0))).toBe('invalid');
  });

  it('rejects a question whose recommendation is not one of its options', () => {
    const { ids, run } = ready();
    expect(code(() => ask(run, 'i1', [question(7)], ids))).toBe('invalid');
  });
});

describe('message addressing', () => {
  const twoThreads = () => {
    const { ids, run } = start();
    const withCards = addItems(
      run,
      [
        { kind: 'card', fields: card('Card one - a') },
        { kind: 'card', fields: card('Card two - b') },
      ],
      ids,
    ).run;
    return rememberEventThread(withCards, 42, withCards.items[0]!.threadId);
  };

  it('a reply lands in the thread of the event it answers', () => {
    const run = twoThreads();
    const withMessage = addMessage(run, { text: 'done', from: 'claude', now: T0, id: 'm1', replyTo: 42 });
    expect(withMessage.messages[0]!.threadId).toBe(run.items[0]!.threadId);
  });

  it('a reply whose explicit thread disagrees with its event posts nothing', () => {
    const run = twoThreads();
    expect(
      code(() =>
        addMessage(run, {
          text: 'x',
          from: 'claude',
          now: T0,
          id: 'm1',
          replyTo: 42,
          threadId: run.items[1]!.threadId,
        }),
      ),
    ).toBe('thread-mismatch');
  });

  it('a new message needs a thread that belongs to the run', () => {
    const run = twoThreads();
    expect(code(() => addMessage(run, { text: 'x', from: 'claude', now: T0, id: 'm1', threadId: 'elsewhere' }))).toBe(
      'not-found',
    );
    expect(
      addMessage(run, { text: 'hi', from: 'claude', now: T0, id: 'm1', threadId: runThreadId(run) }).messages,
    ).toHaveLength(1);
  });

  it('an event naming a thread outside the run is not remembered', () => {
    const run = twoThreads();
    expect(code(() => rememberEventThread(run, 43, 'elsewhere'))).toBe('not-found');
  });
});

describe('ending a run', () => {
  const two = () => {
    const { ids, run } = start();
    return addItems(
      run,
      [
        { kind: 'card', fields: card('A - a') },
        { kind: 'card', fields: card('B - b') },
      ],
      ids,
    ).run;
  };

  it('one approval never closes a run', () => {
    const run = applyVerdict(two(), 'i1', 1, 'approved', T0);
    const done = markDone(run, 'i1', 'created 86e3', T0);
    expect(done.items.filter((item) => !isFinal(item)).map((item) => item.id)).toEqual(['i2']);
    expect(code(() => close(done, 'closed', 'created', T0))).toBe('open-items');
  });

  it('an approved item needs to be done before it counts as an outcome', () => {
    const run = applyVerdict(applyVerdict(two(), 'i1', 1, 'approved', T0), 'i2', 1, 'rejected', T0);
    expect(code(() => close(run, 'closed', 'x', T0))).toBe('open-items');
    expect(close(markDone(run, 'i1', 'created', T0), 'closed', 'created 1, rejected 1', T0).status).toBe('closed');
  });

  it('a run with undecided items can always be paused, but not closed', () => {
    const run = two();
    expect(code(() => close(run, 'closed', 'x', T0))).toBe('open-items');
    const paused = close(run, 'paused', 'stopping for now', T0);
    expect(paused.status).toBe('paused');
    expect(paused.items).toEqual(run.items);
  });

  it('items left pending let the run pause but not close', () => {
    const run = applyVerdict(applyVerdict(two(), 'i1', 1, 'rejected', T0), 'i2', 1, 'pending', T0);
    expect(code(() => close(run, 'closed', 'x', T0))).toBe('open-items');
    expect(close(run, 'paused', 'card 2 left for later', T0).status).toBe('paused');
  });

  it('a closed run refuses further changes', () => {
    const rejected = applyVerdict(applyVerdict(two(), 'i1', 1, 'rejected', T0), 'i2', 1, 'rejected', T0);
    const run = close(rejected, 'closed', 'none', T0);
    expect(code(() => updateItem(run, 'i1', { tags: [] }))).toBe('closed');
  });

  it('counts what waits on the user: open questions plus items ready for a verdict', () => {
    const { ids } = start();
    const run = two();
    expect(pendingForUser(run)).toBe(2);
    const asked = ask(run, 'i1', [question(), question()], ids).run;
    expect(pendingForUser(asked)).toBe(3);
  });
});

describe('marking done', () => {
  it('only an item approved at its current revision can be marked done', () => {
    const { ids, run } = start();
    const withCard = addItems(run, [{ kind: 'card', fields: card() }], ids).run;
    expect(code(() => markDone(withCard, 'i1', 'x', T0))).toBe('invalid');
  });
});
