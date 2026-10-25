/**
 * The rules every kind of item obeys, as pure functions over a run. Each
 * returns a new run and never mutates its input. Nothing here knows about
 * MCP, HTTP, the disk or which skill is calling.
 */
import {
  ItemKinds,
  QuestionSpec,
  type Diagram,
  type Item,
  type ItemKind,
  type ItemOf,
  type Message,
  type Question,
  type RunState,
  type RunStatus,
  type VerdictValue,
} from '@shared/contract.ts';
import { currentVerdict, isFinal, openQuestions } from '@shared/rules.ts';
import type { z } from 'zod';
import { WorkbenchError } from './errors.ts';
import { PARTY, RUN_STATUS, VERDICT } from '@shared/values.ts';

type IdGen = (prefix: string) => string;

const clone = <T>(value: T): T => structuredClone(value);
const touch = (run: RunState): RunState => ({ ...run, version: run.version + 1 });

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
function assertOpen(run: RunState): void {
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

function parseFields<K extends ItemKind>(kind: K, fields: unknown): ItemOf<K>['fields'] {
  return parseWith(ItemKinds[kind], kind, fields);
}

function parseWith<S extends z.ZodType>(schema: S, kind: string, fields: unknown): z.output<S> {
  const parsed = schema.safeParse(fields);
  if (!parsed.success) {
    throw new WorkbenchError('invalid', `fields do not match the "${kind}" schema`, parsed.error.issues);
  }
  return parsed.data;
}

const isItemKind = (kind: string): kind is ItemKind => kind in ItemKinds;

/** A plain object whose fields can be read by name. */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Replaces an item's fields with a re-validated copy (assigning to the union directly can't be typed). */
const setFields = (item: Item, fields: unknown) => Object.assign(item, { fields: parseFields(item.kind, fields) });

function buildQuestions(specs: unknown[], ids: IdGen): Question[] {
  return specs.map((raw) => {
    const spec = QuestionSpec.parse(raw);
    if (spec.recommended >= spec.options.length) {
      throw new WorkbenchError(
        'invalid',
        `question "${spec.text}" recommends option ${spec.recommended}, which does not exist`,
      );
    }
    return { ...spec, id: ids('q') };
  });
}

export function addItems(
  run: RunState,
  inputs: { kind: string; fields: unknown; questions?: unknown[] | undefined }[],
  ids: IdGen,
): { run: RunState; added: { id: string; rev: number; threadId: string }[] } {
  assertOpen(run);
  const next = clone(run);
  const added: { id: string; rev: number; threadId: string }[] = [];
  for (const input of inputs) {
    if (!isItemKind(input.kind)) {
      throw new WorkbenchError(
        'invalid',
        `unknown item kind "${input.kind}"; known kinds: ${Object.keys(ItemKinds).join(', ')}`,
      );
    }
    const threadId = ids('t');
    const item: Item = {
      id: ids('i'),
      kind: input.kind,
      rev: 1,
      fields: parseFields(input.kind, input.fields),
      questions: buildQuestions(input.questions ?? [], ids),
      threadId,
    };
    next.items.push(item);
    next.threads.push({ id: threadId, owner: { type: 'item', itemId: item.id } });
    added.push({ id: item.id, rev: item.rev, threadId });
  }
  return { run: touch(next), added };
}

/** Any change to an item bumps its revision, which voids any verdict on the old one. */
function revise(item: Item): void {
  item.rev += 1;
  delete item.verdict;
}

function merge(base: unknown, patch: unknown): unknown {
  if (Array.isArray(patch) || patch === null || typeof patch !== 'object') {
    return patch;
  }
  const out: Record<string, unknown> = {
    ...(typeof base === 'object' && base !== null && !Array.isArray(base) ? base : {}),
  };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = merge(out[key], value);
  }
  return out;
}

export function updateItem(run: RunState, itemId: string, patch: unknown): { run: RunState; rev: number } {
  assertOpen(run);
  const next = clone(run);
  const item = findItem(next, itemId);
  setFields(item, merge(item.fields, patch));
  delete item.edits;
  revise(item);
  return { run: touch(next), rev: item.rev };
}

export function ask(
  run: RunState,
  itemId: string,
  specs: unknown[],
  ids: IdGen,
): { run: RunState; questionIds: string[]; rev: number } {
  assertOpen(run);
  if (specs.length === 0) {
    throw new WorkbenchError('invalid', 'ask needs at least one question');
  }
  const next = clone(run);
  const item = findItem(next, itemId);
  const qs = buildQuestions(specs, ids);
  item.questions.push(...qs);
  revise(item);
  return { run: touch(next), questionIds: qs.map((question) => question.id), rev: item.rev };
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
  for (const [qid, answer] of Object.entries(answers)) {
    const question = item.questions.find((candidate) => candidate.id === qid);
    if (!question) {
      throw new WorkbenchError('not-found', `no question ${qid} on item ${itemId}`);
    }
    if (answer.choice < 0 || answer.choice >= question.options.length) {
      throw new WorkbenchError('invalid', `question ${qid} has no option ${answer.choice}`);
    }
    question.answer = { choice: answer.choice, at: now, ...(answer.note ? { note: answer.note } : {}) };
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
  if (value === VERDICT.approved && openQuestions(item).length > 0) {
    throw new WorkbenchError(
      'open-questions',
      `item ${itemId} still has ${openQuestions(item).length} open question(s)`,
    );
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
  for (const part of parts.slice(0, -1)) {
    target = isRecord(target) ? target[part] : undefined;
  }
  const last = parts.at(-1)!;
  if (!isRecord(target) || typeof target[last] !== 'string') {
    throw new WorkbenchError('invalid', `item ${itemId} has no text field at "${path}"`);
  }
  target[last] = text;
  setFields(item, item.fields);
  item.edits = { ...(item.edits ?? {}), [path]: text };
  revise(item);
  return touch(next);
}

export function markDone(run: RunState, itemId: string, note: string, now: string): RunState {
  assertOpen(run);
  const next = clone(run);
  const item = findItem(next, itemId);
  if (currentVerdict(item) !== VERDICT.approved) {
    throw new WorkbenchError(
      'invalid',
      `item ${itemId} is not approved at its current revision, so it can't be marked done`,
    );
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
  message: {
    text: string;
    from: Message['from'];
    now: string;
    id: string;
    replyTo?: number | undefined;
    threadId?: string | undefined;
    images?: string[] | undefined;
  },
): RunState {
  let threadId = message.threadId;
  if (message.replyTo !== undefined) {
    const fromEvent = run.eventThreads[message.replyTo];
    if (!fromEvent) {
      throw new WorkbenchError('not-found', `no recorded event #${message.replyTo} in run ${run.id}`);
    }
    if (threadId !== undefined && threadId !== fromEvent) {
      throw new WorkbenchError(
        'thread-mismatch',
        `event #${message.replyTo} came from thread ${fromEvent}, not ${threadId}; nothing was posted`,
      );
    }
    threadId = fromEvent;
  }
  assertOpen(run);
  if (threadId === undefined) {
    throw new WorkbenchError('invalid', 'a message needs replyTo or threadId');
  }
  if (!run.threads.some((thread) => thread.id === threadId)) {
    throw new WorkbenchError('not-found', `no thread ${threadId} in run ${run.id}`);
  }
  const next = clone(run);
  next.messages.push({
    id: message.id,
    threadId,
    from: message.from,
    at: message.now,
    text: message.text,
    ...(message.images?.length ? { images: message.images } : {}),
    ...(message.replyTo !== undefined ? { replyTo: message.replyTo } : {}),
  });
  return touch(next);
}

/** The thread a page event belongs to; used to record it and to check the thread is in this run. */
export function threadOfItem(run: RunState, itemId: string): string {
  return findItem(run, itemId).threadId;
}

export function rememberEventThread(run: RunState, seq: number, threadId: string): RunState {
  if (!run.threads.some((thread) => thread.id === threadId)) {
    throw new WorkbenchError('not-found', `no thread ${threadId} in run ${run.id}`);
  }
  return { ...run, eventThreads: { ...run.eventThreads, [seq]: threadId } };
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

/** Adds a diagram the run's messages and items can embed. */
export function addDiagram(run: RunState, diagram: Diagram): RunState {
  assertOpen(run);
  return touch({ ...clone(run), diagrams: [...run.diagrams, diagram] });
}
