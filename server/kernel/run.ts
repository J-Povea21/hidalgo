/**
 * The rules every kind of item obeys, as pure functions over a run. Each
 * returns a new run and never mutates its input. Nothing here knows about
 * MCP, HTTP, the disk or which skill is calling.
 */
import {
  ItemKinds,
  QuestionSpec,
  type Item,
  type ItemKind,
  type Message,
  type Question,
  type RunState,
  type RunStatus,
  type VerdictValue,
} from '../../shared/contract.ts';
import { WorkbenchError } from './errors.ts';

type IdGen = (prefix: string) => string;

const clone = <T>(v: T): T => structuredClone(v);
const touch = (run: RunState): RunState => ({ ...run, version: run.version + 1 });

export function newRun(a: { id: string; skill: string; project: string; subject: string; now: string; threadId: string }): RunState {
  return {
    id: a.id,
    skill: a.skill,
    project: a.project,
    subject: a.subject,
    status: 'open',
    startedAt: a.now,
    items: [],
    threads: [{ id: a.threadId, owner: { type: 'run' } }],
    messages: [],
    diagrams: [],
    turn: 'claude',
    version: 1,
    eventThreads: {},
    appliedSeq: 0,
  };
}

export function runThreadId(run: RunState): string {
  const t = run.threads.find((t) => t.owner.type === 'run');
  if (!t) throw new WorkbenchError('invalid', 'run has no run thread');
  return t.id;
}

function assertOpen(run: RunState): void {
  if (run.status === 'closed') throw new WorkbenchError('closed', `run ${run.id} is closed`);
}

export function findItem(run: RunState, itemId: string): Item {
  const item = run.items.find((i) => i.id === itemId);
  if (!item) throw new WorkbenchError('not-found', `no item ${itemId} in run ${run.id}`);
  return item;
}

function parseFields(kind: ItemKind, fields: unknown): Record<string, unknown> {
  const schema = ItemKinds[kind];
  const parsed = schema.safeParse(fields);
  if (!parsed.success) {
    throw new WorkbenchError('invalid', `fields do not match the "${kind}" schema`, parsed.error.issues);
  }
  return parsed.data as Record<string, unknown>;
}

function buildQuestions(specs: unknown[], ids: IdGen): Question[] {
  return specs.map((raw) => {
    const spec = QuestionSpec.parse(raw);
    if (spec.recommended >= spec.options.length) {
      throw new WorkbenchError('invalid', `question "${spec.text}" recommends option ${spec.recommended}, which does not exist`);
    }
    return { ...spec, id: ids('q') };
  });
}

export const openQuestions = (item: Item): Question[] => item.questions.filter((q) => !q.answer);

export function addItems(
  run: RunState,
  inputs: { kind: string; fields: unknown; questions?: unknown[] | undefined }[],
  ids: IdGen,
): { run: RunState; added: { id: string; rev: number }[] } {
  assertOpen(run);
  const next = clone(run);
  const added: { id: string; rev: number }[] = [];
  for (const input of inputs) {
    if (!(input.kind in ItemKinds)) {
      throw new WorkbenchError('invalid', `unknown item kind "${input.kind}"; known kinds: ${Object.keys(ItemKinds).join(', ')}`);
    }
    const kind = input.kind as ItemKind;
    const threadId = ids('t');
    const item: Item = {
      id: ids('i'),
      kind,
      rev: 1,
      fields: parseFields(kind, input.fields),
      questions: buildQuestions(input.questions ?? [], ids),
      threadId,
    };
    next.items.push(item);
    next.threads.push({ id: threadId, owner: { type: 'item', itemId: item.id } });
    added.push({ id: item.id, rev: item.rev });
  }
  return { run: touch(next), added };
}

/** Any change to an item bumps its revision, which voids any verdict on the old one. */
function revise(item: Item): void {
  item.rev += 1;
  delete item.verdict;
}

function merge(base: unknown, patch: unknown): unknown {
  if (Array.isArray(patch) || patch === null || typeof patch !== 'object') return patch;
  const out: Record<string, unknown> = { ...(typeof base === 'object' && base !== null && !Array.isArray(base) ? base : {}) };
  for (const [k, v] of Object.entries(patch)) out[k] = merge(out[k], v);
  return out;
}

export function updateItem(run: RunState, itemId: string, patch: unknown): { run: RunState; rev: number } {
  assertOpen(run);
  const next = clone(run);
  const item = findItem(next, itemId);
  item.fields = parseFields(item.kind, merge(item.fields, patch));
  delete item.edits;
  revise(item);
  return { run: touch(next), rev: item.rev };
}

export function ask(run: RunState, itemId: string, specs: unknown[], ids: IdGen): { run: RunState; questionIds: string[]; rev: number } {
  assertOpen(run);
  if (specs.length === 0) throw new WorkbenchError('invalid', 'ask needs at least one question');
  const next = clone(run);
  const item = findItem(next, itemId);
  const qs = buildQuestions(specs, ids);
  item.questions.push(...qs);
  revise(item);
  return { run: touch(next), questionIds: qs.map((q) => q.id), rev: item.rev };
}

export function applyAnswers(
  run: RunState,
  itemId: string,
  answers: Record<string, { choice: number; note?: string | undefined }>,
  now: string,
): RunState {
  assertOpen(run);
  const next = clone(run);
  const item = findItem(next, itemId);
  for (const [qid, a] of Object.entries(answers)) {
    const q = item.questions.find((q) => q.id === qid);
    if (!q) throw new WorkbenchError('not-found', `no question ${qid} on item ${itemId}`);
    if (a.choice < 0 || a.choice >= q.options.length) throw new WorkbenchError('invalid', `question ${qid} has no option ${a.choice}`);
    q.answer = { choice: a.choice, at: now, ...(a.note ? { note: a.note } : {}) };
  }
  return touch(next);
}

/**
 * The approval gate. A verdict counts only against the item's current
 * revision, and Approve is refused while the item has open questions.
 */
export function applyVerdict(run: RunState, itemId: string, rev: number, value: VerdictValue, now: string): RunState {
  assertOpen(run);
  const next = clone(run);
  const item = findItem(next, itemId);
  if (rev !== item.rev) {
    throw new WorkbenchError('stale-revision', `verdict names rev ${rev}, but item ${itemId} is at rev ${item.rev}`);
  }
  if (value === 'approved' && openQuestions(item).length > 0) {
    throw new WorkbenchError('open-questions', `item ${itemId} still has ${openQuestions(item).length} open question(s)`);
  }
  item.verdict = { value, rev, at: now };
  return touch(next);
}

/** A user's edit to one text field, e.g. `criteria.2.text`. It is a change, so it bumps the revision. */
export function applyEdit(run: RunState, itemId: string, path: string, text: string): RunState {
  assertOpen(run);
  const next = clone(run);
  const item = findItem(next, itemId);
  const parts = path.split('.');
  let target: unknown = item.fields;
  for (const p of parts.slice(0, -1)) {
    target = (target as Record<string, unknown> | undefined)?.[p];
  }
  const last = parts.at(-1)!;
  if (target === null || typeof target !== 'object' || typeof (target as Record<string, unknown>)[last] !== 'string') {
    throw new WorkbenchError('invalid', `item ${itemId} has no text field at "${path}"`);
  }
  (target as Record<string, unknown>)[last] = text;
  item.fields = parseFields(item.kind, item.fields);
  item.edits = { ...(item.edits ?? {}), [path]: text };
  revise(item);
  return touch(next);
}

export function markDone(run: RunState, itemId: string, note: string, now: string): RunState {
  const next = clone(run);
  const item = findItem(next, itemId);
  if (item.verdict?.value !== 'approved' || item.verdict.rev !== item.rev) {
    throw new WorkbenchError('invalid', `item ${itemId} is not approved at its current revision, so it can't be marked done`);
  }
  item.done = { at: now, note };
  return touch(next);
}

/**
 * Where a message goes. A reply is addressed by the event it answers, never by
 * a thread the caller names; a caller that names both must agree with the event.
 */
export function addMessage(
  run: RunState,
  m: { text: string; from: Message['from']; now: string; id: string; replyTo?: number | undefined; threadId?: string | undefined; images?: string[] | undefined },
): RunState {
  let threadId = m.threadId;
  if (m.replyTo !== undefined) {
    const fromEvent = run.eventThreads[m.replyTo];
    if (!fromEvent) throw new WorkbenchError('not-found', `no recorded event #${m.replyTo} in run ${run.id}`);
    if (threadId !== undefined && threadId !== fromEvent) {
      throw new WorkbenchError('thread-mismatch', `event #${m.replyTo} came from thread ${fromEvent}, not ${threadId}; nothing was posted`);
    }
    threadId = fromEvent;
  }
  if (threadId === undefined) throw new WorkbenchError('invalid', 'a message needs replyTo or threadId');
  if (!run.threads.some((t) => t.id === threadId)) throw new WorkbenchError('not-found', `no thread ${threadId} in run ${run.id}`);
  const next = clone(run);
  next.messages.push({
    id: m.id,
    threadId,
    from: m.from,
    at: m.now,
    text: m.text,
    ...(m.images?.length ? { images: m.images } : {}),
    ...(m.replyTo !== undefined ? { replyTo: m.replyTo } : {}),
  });
  return touch(next);
}

/** The thread a page event belongs to; used to record it and to check the thread is in this run. */
export function threadOfItem(run: RunState, itemId: string): string {
  return findItem(run, itemId).threadId;
}

export function rememberEventThread(run: RunState, seq: number, threadId: string): RunState {
  if (!run.threads.some((t) => t.id === threadId)) throw new WorkbenchError('not-found', `no thread ${threadId} in run ${run.id}`);
  return { ...run, eventThreads: { ...run.eventThreads, [seq]: threadId } };
}

/** Items without an outcome: not approved-and-done, not rejected, not left pending by the user. */
export function itemsWithoutOutcome(run: RunState): Item[] {
  return run.items.filter((i) => {
    const v = i.verdict?.rev === i.rev ? i.verdict.value : undefined;
    if (v === 'rejected' || v === 'pending') return false;
    if (v === 'approved') return !i.done;
    return true;
  });
}

/**
 * Ending a run. `paused` is always allowed: it keeps everything and stays
 * resumable, whatever state the items are in. `closed` is final, so it needs
 * every item rejected, or approved and done; anything undecided or left
 * pending means the run can only be paused.
 */
export function close(run: RunState, status: Exclude<RunStatus, 'open'>, outcome: string, now: string): RunState {
  assertOpen(run);
  if (status === 'closed') {
    const missing = itemsWithoutOutcome(run);
    if (missing.length) {
      throw new WorkbenchError('open-items', `${missing.length} item(s) have no outcome yet: pause the run instead`, missing.map((i) => ({ id: i.id, rev: i.rev })));
    }
    const pending = run.items.filter((i) => i.verdict?.rev === i.rev && i.verdict.value === 'pending');
    if (pending.length) {
      throw new WorkbenchError('open-items', `${pending.length} item(s) were left pending: pause the run instead`, pending.map((i) => ({ id: i.id, rev: i.rev })));
    }
  }
  return touch({ ...clone(run), status, closedOutcome: outcome, closedAt: now, turn: 'claude' });
}

export function reopen(run: RunState): RunState {
  return run.status === 'paused' ? touch({ ...clone(run), status: 'open' }) : run;
}

export function setStatusLine(run: RunState, line: string | undefined): RunState {
  const next = clone(run);
  if (line === undefined) delete next.statusLine;
  else next.statusLine = line;
  return touch(next);
}

export function setTurn(run: RunState, turn: RunState['turn']): RunState {
  return run.turn === turn ? run : touch({ ...run, turn });
}

/** How many things wait on the user: open questions plus items ready for a verdict. */
export function waitingOnUser(run: RunState): number {
  return run.items.reduce((n, i) => {
    const open = openQuestions(i).length;
    const ready = open === 0 && !(i.verdict && i.verdict.rev === i.rev) ? 1 : 0;
    return n + open + ready;
  }, 0);
}
