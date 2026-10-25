import { describe, expect, it } from 'vitest';
import { card } from '@test/fixtures.ts';
import { useCases, world } from '@test/fakes.ts';
import { addItems } from '@server/common/domain/item.rules.ts';

describe('open-session', () => {
  it('starts a run, saves it, shows it, and returns its page', async () => {
    const fakes = world();
    const cases = useCases(fakes);
    const { run, resumed } = await cases.runs.openSession.execute({
      skill: 'card',
      project: 'MiPlan',
      subject: 'validator',
    });
    expect(resumed).toBe(false);
    expect(await fakes.store.load(run.id)).toEqual(run);
    expect(fakes.page.last?.id).toBe(run.id);
  });

  it('resumes a run and replays page events the saved state had not absorbed', async () => {
    const fakes = world();
    const cases = useCases(fakes);
    const { run } = await cases.runs.openSession.execute({ skill: 'card', project: 'MiPlan', subject: 'v' });
    const withItem = addItems(run, [{ kind: 'card', fields: card() }], (prefix) => fakes.ids.next(prefix)).run;
    await fakes.store.save(withItem);
    // The event reached the log, then the server died before saving the applied state.
    await fakes.log.append(run.id, {
      type: 'verdict',
      itemId: withItem.items[0]!.id,
      rev: 1,
      value: 'rejected',
      at: 'x',
    });

    const resumed = await cases.runs.openSession.execute({
      skill: 'card',
      project: 'MiPlan',
      subject: 'v',
      resume: run.id,
    });
    expect(resumed.resumed).toBe(true);
    expect(resumed.run.items[0]!.verdict?.value).toBe('rejected');
    expect(resumed.run.appliedSeq).toBe(1);
  });

  it('refuses to resume an unknown or closed run', async () => {
    const fakes = world();
    const cases = useCases(fakes);
    await expect(
      cases.runs.openSession.execute({ skill: 'card', project: 'MiPlan', subject: 'v', resume: 'nope' }),
    ).rejects.toMatchObject({ code: 'not-found' });
    const { run } = await cases.runs.openSession.execute({ skill: 'card', project: 'MiPlan', subject: 'v' });
    await fakes.store.save({ ...run, status: 'closed' });
    await expect(
      cases.runs.openSession.execute({ skill: 'card', project: 'MiPlan', subject: 'v', resume: run.id }),
    ).rejects.toMatchObject({ code: 'closed' });
  });

  it('resuming a paused run reopens it', async () => {
    const fakes = world();
    const cases = useCases(fakes);
    const { run } = await cases.runs.openSession.execute({ skill: 'card', project: 'MiPlan', subject: 'v' });
    await fakes.store.save({ ...run, status: 'paused' });
    expect(
      (
        await cases.runs.openSession.execute({
          skill: 'card',
          project: 'MiPlan',
          subject: 'v',
          resume: run.id,
        })
      ).run.status,
    ).toBe('open');
  });
});
