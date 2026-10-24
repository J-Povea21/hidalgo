/**
 * The project's runs, read-only: what resume offers, and what the card skill's
 * duplicate search checks so drafts not yet on the board are seen too.
 */
import type { RunState } from '../../../shared/contract.ts';
import type { LiveIndex, RunStore } from '../../kernel/ports.ts';
import { waitingOnUser } from '../../kernel/run.ts';

export interface RunSummary {
  id: string;
  skill: string;
  subject: string;
  status: RunState['status'];
  startedAt: string;
  /** Whether a workbench server is serving it right now (another session, maybe). */
  live: boolean;
  waiting: number;
  items: { id: string; kind: string; title: string; verdict?: string }[];
}

export async function listRuns(deps: { store: RunStore; live: LiveIndex }, input: { project: string; includeClosed?: boolean | undefined }): Promise<RunSummary[]> {
  const [runs, live] = await Promise.all([deps.store.list(input.project), deps.live.alive()]);
  const liveIds = new Set(live.map((e) => e.runId));
  return runs
    .filter((r) => input.includeClosed || r.status !== 'closed')
    .map((r) => ({
      id: r.id,
      skill: r.skill,
      subject: r.subject,
      status: r.status,
      startedAt: r.startedAt,
      live: liveIds.has(r.id),
      waiting: waitingOnUser(r),
      items: r.items.map((i) => ({
        id: i.id,
        kind: i.kind,
        title: typeof i.fields['title'] === 'string' ? i.fields['title'] : i.id,
        ...(i.verdict && i.verdict.rev === i.rev ? { verdict: i.done ? 'done' : i.verdict.value } : {}),
      })),
    }));
}
