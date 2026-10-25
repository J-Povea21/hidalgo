/**
 * The project's runs, read-only: what resume offers, and what the card skill's
 * duplicate search checks so drafts not yet on the board are seen too.
 */
import type { RunState } from '@shared/contract.ts';
import type { LiveIndex, RunStore } from '@server/kernel/ports.ts';
import { currentVerdict, itemTitle, pendingForUser } from '@shared/rules.ts';
import { RUN_STATUS } from '@shared/values.ts';

export interface RunSummary {
  id: string;
  skill: string;
  subject: string;
  status: RunState['status'];
  startedAt: string;
  /** Whether a workbench server is serving it right now (another session, maybe). */
  live: boolean;
  /** Open questions plus items ready for a verdict. */
  pendingForUser: number;
  items: { id: string; kind: string; title: string; verdict?: string }[];
}

export async function listRuns(
  deps: { store: RunStore; live: LiveIndex },
  input: { project: string; includeClosed?: boolean | undefined },
): Promise<RunSummary[]> {
  const [runs, live] = await Promise.all([deps.store.list(input.project), deps.live.alive()]);
  const liveIds = new Set(live.map((entry) => entry.runId));
  return runs
    .filter((run) => input.includeClosed || run.status !== RUN_STATUS.closed)
    .map((run) => ({
      id: run.id,
      skill: run.skill,
      subject: run.subject,
      status: run.status,
      startedAt: run.startedAt,
      live: liveIds.has(run.id),
      pendingForUser: pendingForUser(run),
      items: run.items.map((item) => {
        const verdict = currentVerdict(item);
        return {
          id: item.id,
          kind: item.kind,
          title: itemTitle(item),
          ...(verdict ? { verdict: item.done ? 'done' : verdict } : {}),
        };
      }),
    }));
}
