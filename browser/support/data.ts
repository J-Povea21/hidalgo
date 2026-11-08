/** What the tests put on the page: cards and questions with sensible defaults. */

export function card(title = 'Checkout - CouponExists validator returns 500 on a non-array') {
  return {
    title,
    tags: ['backend', 'bug'],
    proposal: { priority: 'high', shape: 'one card, one PR', status: 'ready for work', related: 'none' },
    body: {
      what: '`couponIds` sent as anything other than an array returns a 500.',
      where: ['`src/coupon-exists.decorator.ts:12`'],
    },
    criteria: [
      { mode: 'code', text: 'The validator guards its own input' },
      { mode: 'test', text: 'A unit test covers each non-array input' },
    ],
    manualQa: ['Submitting the order form with valid coupons still saves'],
    assuming: [],
    provenance: 'browser suite',
  };
}

export function question(text = 'Fix the other validators here or separately?') {
  return {
    text,
    evidence: [{ kind: 'verified', text: '4 matches' }],
    options: [
      { label: 'Separately', detail: 'One file.' },
      { label: 'Here', detail: 'All at once.' },
      { label: 'Neither', detail: 'Leave them.' },
    ],
    recommended: 0,
  };
}

/** A card to put on the page: its title, and the questions Claude asks about it. */
export interface CardSpec {
  title?: string;
  questions?: ReturnType<typeof question>[];
}

export function plainCard(title?: string): CardSpec {
  return title ? { title } : {};
}
export function cardAsking(...texts: string[]): CardSpec {
  return { questions: texts.map((text) => question(text)) };
}

/** A two-box flow diagram, for tests that need one drawn. */
export function smallFlow(from = 'Page', to = 'Server') {
  return {
    type: 'flow',
    nodes: [
      { id: 'from', label: from },
      { id: 'to', label: to },
    ],
    edges: [{ from: 'from', to: 'to', label: 'event' }],
  };
}
