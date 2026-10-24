import { describe, expect, it } from 'vitest';
import { card } from '../../../test/fixtures.ts';
import { world } from '../../../test/fakes.ts';
import { addItems } from '../../kernel/run.ts';
import { openSession } from './open-session.ts';

describe('open-session', () => {
  it('starts a run, saves it, shows it, and returns its page', async () => {
    const w = world();
    const { run, resumed } = await openSession(w, { skill: 'card', project: 'MiPlan', subject: 'validator' });
    expect(resumed).toBe(false);
    expect(await w.store.load(run.id)).toEqual(run);
    expect(w.page.last?.id).toBe(run.id);
  });

  it('resumes a run and replays page events the saved state had not absorbed', async () => {
    const w = world();
    const { run } = await openSession(w, { skill: 'card', project: 'MiPlan', subject: 'v' });
    const withItem = addItems(run, [{ kind: 'card', fields: card() }], (p) => w.ids.next(p)).run;
    await w.store.save(withItem);
    // The event reached the log, then the server died before saving the applied state.
    await w.log.append(run.id, { type: 'verdict', itemId: withItem.items[0]!.id, rev: 1, value: 'rejected', at: 'x' });

    const resumed = await openSession(w, { skill: 'card', project: 'MiPlan', subject: 'v', resume: run.id });
    expect(resumed.resumed).toBe(true);
    expect(resumed.run.items[0]!.verdict?.value).toBe('rejected');
    expect(resumed.run.appliedSeq).toBe(1);
  });

  it('refuses to resume an unknown or closed run', async () => {
    const w = world();
    await expect(openSession(w, { skill: 'card', project: 'MiPlan', subject: 'v', resume: 'nope' })).rejects.toMatchObject({ code: 'not-found' });
    const { run } = await openSession(w, { skill: 'card', project: 'MiPlan', subject: 'v' });
    await w.store.save({ ...run, status: 'closed' });
    await expect(openSession(w, { skill: 'card', project: 'MiPlan', subject: 'v', resume: run.id })).rejects.toMatchObject({ code: 'closed' });
  });

  it('resuming a paused run reopens it', async () => {
    const w = world();
    const { run } = await openSession(w, { skill: 'card', project: 'MiPlan', subject: 'v' });
    await w.store.save({ ...run, status: 'paused' });
    expect((await openSession(w, { skill: 'card', project: 'MiPlan', subject: 'v', resume: run.id })).run.status).toBe('open');
  });
});
