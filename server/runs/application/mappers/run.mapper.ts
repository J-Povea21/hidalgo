import type { RunState } from '@shared/contract.ts';
import { currentVerdict, itemTitle, pendingForUser } from '@shared/rules.ts';
import { runThreadId } from '@server/common/domain/run.rules.ts';
import type { ListedRuns } from '@server/runs/application/use-cases/list-runs.use-case.ts';

export interface OpenSessionResponse {
  runId: string;
  /** The whole-run conversation, for send_message. */
  threadId: string;
  resumed: boolean;
}

export interface RunSummaryResponse {
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

export interface ListRunsResponse {
  runs: RunSummaryResponse[];
}

export interface StatusLineResponse {
  /** The line the page shows now; null once cleared. */
  statusLine: string | null;
}

export interface CloseSessionResponse {
  status: RunState['status'];
}

/**
 * What the runs tools return, built from what the use cases return. A change in
 * either side is absorbed here, so the tools' results stay as the skills read them.
 */
export class RunMapper {
  static toOpened(opened: { run: RunState; resumed: boolean }): OpenSessionResponse {
    return { runId: opened.run.id, threadId: runThreadId(opened.run), resumed: opened.resumed };
  }

  static toList(listed: ListedRuns): ListRunsResponse {
    return { runs: listed.runs.map((run) => RunMapper.toSummary(run, listed.liveRunIds.has(run.id))) };
  }

  static toSummary(run: RunState, live: boolean): RunSummaryResponse {
    return {
      id: run.id,
      skill: run.skill,
      subject: run.subject,
      status: run.status,
      startedAt: run.startedAt,
      live,
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
    };
  }

  static toStatusLine(run: RunState): StatusLineResponse {
    return { statusLine: run.statusLine ?? null };
  }

  static toClosed(run: RunState): CloseSessionResponse {
    return { status: run.status };
  }
}
