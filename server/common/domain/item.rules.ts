/**
 * The rules every kind of item obeys: adding and revising it, its questions, the approval
 * gate, and marking it done. In common/ because both Claude's tools (items/) and the
 * user's page events (page-events/) change items, and modules can't import each other.
 */
import {
  ItemKinds,
  QuestionSpec,
  type Item,
  type ItemKind,
  type ItemOf,
  type Question,
  type RunState,
  type VerdictValue,
} from '@shared/contract.ts';
import { currentVerdict, openQuestions } from '@shared/rules.ts';
import { VERDICT } from '@shared/values.ts';
import type { z } from 'zod';
import { HidalgoError } from './errors.ts';
import { assertOpen, clone, findItem, touch, type IdGen } from './run.rules.ts';

/** What Claude asks for when it adds an item; its fields are checked against its kind's schema. */
export interface NewItem {
  kind: string;
  fields: unknown;
  questions?: unknown[] | undefined;
}

export function addItems(run: RunState, inputs: NewItem[], ids: IdGen): { run: RunState; added: Item[] } {
  assertOpen(run);
  const next = clone(run);
  const added: Item[] = [];
  for (const input of inputs) {
    if (!isItemKind(input.kind)) {
      throw new HidalgoError(
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
    added.push(item);
  }
  return { run: touch(next), added };
}

export function updateItem(run: RunState, itemId: string, patch: unknown): { run: RunState; item: Item } {
  assertOpen(run);
  const next = clone(run);
  const item = findItem(next, itemId);
  setFields(item, merge(item.fields, patch));
  delete item.edits;
  revise(item);
  return { run: touch(next), item };
}

export function ask(
  run: RunState,
  itemId: string,
  specs: unknown[],
  ids: IdGen,
): { run: RunState; item: Item; asked: Question[] } {
  assertOpen(run);
  if (specs.length === 0) {
    throw new HidalgoError('invalid', 'ask needs at least one question');
  }
  const next = clone(run);
  const item = findItem(next, itemId);
  const asked = buildQuestions(specs, ids);
  item.questions.push(...asked);
  revise(item);
  return { run: touch(next), item, asked };
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
      throw new HidalgoError('not-found', `no question ${qid} on item ${itemId}`);
    }
    if (answer.choice < 0 || answer.choice >= question.options.length) {
      throw new HidalgoError('invalid', `question ${qid} has no option ${answer.choice}`);
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
    throw new HidalgoError('stale-revision', `verdict names rev ${rev}, but item ${itemId} is at rev ${item.rev}`);
  }
  if (value === VERDICT.approved && openQuestions(item).length > 0) {
    throw new HidalgoError('open-questions', `item ${itemId} still has ${openQuestions(item).length} open question(s)`);
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
    throw new HidalgoError('invalid', `item ${itemId} has no text field at "${path}"`);
  }
  target[last] = text;
  setFields(item, item.fields);
  item.edits = { ...(item.edits ?? {}), [path]: text };
  revise(item);
  return touch(next);
}

export function markDone(run: RunState, itemId: string, note: string, now: string): { run: RunState; item: Item } {
  assertOpen(run);
  const next = clone(run);
  const item = findItem(next, itemId);
  if (currentVerdict(item) !== VERDICT.approved) {
    throw new HidalgoError(
      'invalid',
      `item ${itemId} is not approved at its current revision, so it can't be marked done`,
    );
  }
  item.done = { at: now, note };
  return { run: touch(next), item };
}

function isItemKind(kind: string): kind is ItemKind {
  return kind in ItemKinds;
}

/** A plain object whose fields can be read by name. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Replaces an item's fields with a re-validated copy (assigning to the union directly can't be typed). */
function setFields(item: Item, fields: unknown): void {
  Object.assign(item, { fields: parseFields(item.kind, fields) });
}

function parseFields<K extends ItemKind>(kind: K, fields: unknown): ItemOf<K>['fields'] {
  return parseWith(ItemKinds[kind], kind, fields);
}

function parseWith<S extends z.ZodType>(schema: S, kind: string, fields: unknown): z.output<S> {
  const parsed = schema.safeParse(fields);
  if (!parsed.success) {
    throw new HidalgoError('invalid', `fields do not match the "${kind}" schema`, parsed.error.issues);
  }
  return parsed.data;
}

function buildQuestions(specs: unknown[], ids: IdGen): Question[] {
  return specs.map((raw) => {
    const spec = QuestionSpec.parse(raw);
    if (spec.recommended >= spec.options.length) {
      throw new HidalgoError(
        'invalid',
        `question "${spec.text}" recommends option ${spec.recommended}, which does not exist`,
      );
    }
    return { ...spec, id: ids('q') };
  });
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
