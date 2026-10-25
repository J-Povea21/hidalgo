/** Shared test data: a valid card and question, and a deterministic id generator. */
export const card = (title = 'Formulación - OfficesExist validator returns 500 on a non-array') => ({
  title,
  tags: ['backend', 'bug'],
  proposal: { priority: 'high', shape: 'one card', status: 'ready for work', related: 'none' },
  body: {
    what: '`officeIds` sent as anything other than an array returns a 500 instead of a 400.',
    where: ['`src/common/decorators/validators/offices-exist.decorator.ts:12`'],
  },
  criteria: [
    { mode: 'code' as const, text: 'The validator guards its own input' },
    { mode: 'test' as const, text: 'A unit test covers each non-array input type' },
  ],
  manualQa: ['Submitting the activity form with valid offices still saves, in development'],
  assuming: [],
  provenance: 'investigator: high confidence',
});

export const question = (recommended = 0) => ({
  text: 'Card the other validators separately?',
  evidence: [{ kind: 'verified' as const, text: '4 matches of the pattern' }],
  options: [
    { label: 'Separately', detail: 'Keeps this PR to one file.' },
    { label: 'Here', detail: 'Fixes the class at once.' },
  ],
  recommended,
});

export function counterIds() {
  const n: Record<string, number> = {};
  return (prefix: string) => `${prefix}${(n[prefix] = (n[prefix] ?? 0) + 1)}`;
}

export const T0 = '2026-10-24T22:00:00.000Z';

/** Polls until `ok` holds (or 3 s pass, then fails the test): for conditions with no event to await. */
export async function until(ok: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await ok())) {
    if (Date.now() > end) throw new Error(`condition not met within ${ms} ms`);
    await new Promise((r) => setTimeout(r, 5));
  }
}
