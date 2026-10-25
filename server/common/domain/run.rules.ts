/**
 * The run as a whole: starting it, its status line, whose turn it is, and ending it.
 * Like every `*.rules.ts`, these are pure functions over the run's plain data: each returns
 * a new run and never mutates its input, and nothing here knows about MCP, HTTP or the disk.
 */
import type { Item, RunState, RunStatus } from '@shared/contract.ts';
import { isFinal } from '@shared/rules.ts';
import { PARTY, RUN_STATUS } from '@shared/values.ts';
import { WorkbenchError } from './errors.ts';

/** Makes ids for what a rule creates, each starting with its prefix. */
export type IdGen = (prefix: string) => string;

export const clone = <T>(value: T): T => structuredClone(value);

/** Every change bumps the run's version, so the page can tell a newer snapshot from an older one. */
export const touch = (run: RunState): RunState => ({ ...run, version: run.version + 1 });

export function newRun(init: {
  id: string;
  skill: string;
  project: string;
  subject: string;
  now: string;
  threadId: string;
}): RunState {
  return {
    id: init.id,
    skill: init.skill,
    project: init.project,
    subject: init.subject,
    status: RUN_STATUS.open,
    startedAt: init.now,
    items: [],
    threads: [{ id: init.threadId, owner: { type: 'run' } }],
    messages: [],
    diagrams: [],
    turn: PARTY.claude,
    version: 1,
    eventThreads: {},
    appliedSeq: 0,
  };
}

export function runThreadId(run: RunState): string {
  const thread = run.threads.find((candidate) => candidate.owner.type === 'run');
  if (!thread) {
    throw new WorkbenchError('invalid', 'run has no run thread');
  }
  return thread.id;
}

/** A closed run is final: every change to it is refused. A paused run still takes changes and stays resumable. */
export function assertOpen(run: RunState): void {
  if (run.status === RUN_STATUS.closed) {
    throw new WorkbenchError('closed', `run ${run.id} is closed`);
  }
}

export function findItem(run: RunState, itemId: string): Item {
  const item = run.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new WorkbenchError('not-found', `no item ${itemId} in run ${run.id}`);
  }
  return item;
}

/**
 * Ending a run. `paused` is always allowed: it keeps everything and stays
 * resumable, whatever state the items are in. `closed` is final, so it needs
 * every item rejected, or approved and done; anything undecided or left
 * pending means the run can only be paused.
 */
export function close(run: RunState, status: Exclude<RunStatus, 'open'>, outcome: string, now: string): RunState {
  assertOpen(run);
  const open = run.items.filter((item) => !isFinal(item));
  if (status === RUN_STATUS.closed && open.length) {
    throw new WorkbenchError(
      'open-items',
      `${open.length} item(s) aren't rejected, or approved and done: pause the run instead`,
      open.map((item) => ({ id: item.id, rev: item.rev })),
    );
  }
  return touch({ ...clone(run), status, closedOutcome: outcome, closedAt: now, turn: PARTY.claude });
}

export function reopen(run: RunState): RunState {
  return run.status === RUN_STATUS.paused ? touch({ ...clone(run), status: RUN_STATUS.open }) : run;
}

export function setStatusLine(run: RunState, line: string | undefined): RunState {
  assertOpen(run);
  const next = clone(run);
  if (line === undefined) {
    delete next.statusLine;
  } else {
    next.statusLine = line;
  }
  return touch(next);
}

export function setTurn(run: RunState, turn: RunState['turn']): RunState {
  return run.turn === turn ? run : touch({ ...run, turn });
}
