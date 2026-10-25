import { describe, expect, it } from 'vitest';
import { card, counterIds, T0 } from '@test/fixtures.ts';
import { world } from '@test/fakes.ts';
import { addItems, newRun } from '@server/kernel/run.ts';
import { listRuns } from './list-runs.ts';

describe('list-runs', () => {
  it("shows another session's drafts in the same project, read-only, and marks which are live", async () => {
    const fakes = world();
    const ids = counterIds();
    const mine = newRun({
      id: 'r1',
      skill: 'card',
      project: 'MiPlan',
      subject: 'validator',
      now: T0,
      threadId: ids('t'),
    });
    const theirs = addItems(
      newRun({ id: 'r2', skill: 'card', project: 'MiPlan', subject: 'export', now: T0, threadId: ids('t') }),
      [{ kind: 'card', fields: card('Formulación - Export activities to Excel') }],
      ids,
    ).run;
    const elsewhere = newRun({
      id: 'r3',
      skill: 'card',
      project: 'Mi Titulo',
      subject: 'x',
      now: T0,
      threadId: ids('t'),
    });
    for (const run of [mine, theirs, elsewhere]) {
      await fakes.store.save(run);
    }
    await fakes.live.write({
      runId: 'r2',
      project: 'MiPlan',
      skill: 'card',
      subject: 'export',
      port: 1,
      pid: 1,
      processStartedAt: T0,
      heartbeat: T0,
      pendingForUser: 1,
      url: '',
      status: 'open',
      ownerPid: 1,
      claudeListening: false,
    });

    const list = await listRuns(fakes, { project: 'MiPlan' });
    expect(list.map((summary) => summary.id).sort()).toEqual(['r1', 'r2']);
    const other = list.find((summary) => summary.id === 'r2')!;
    expect(other.live).toBe(true);
    expect(other.items[0]!.title).toBe('Formulación - Export activities to Excel');
    expect(await fakes.store.load('r2')).toEqual(theirs);
  });

  it('hides closed runs unless asked', async () => {
    const fakes = world();
    await fakes.store.save({
      ...newRun({ id: 'r1', skill: 'card', project: 'MiPlan', subject: 's', now: T0, threadId: 't1' }),
      status: 'closed',
    });
    expect(await listRuns(fakes, { project: 'MiPlan' })).toHaveLength(0);
    expect(await listRuns(fakes, { project: 'MiPlan', includeClosed: true })).toHaveLength(1);
  });
});
