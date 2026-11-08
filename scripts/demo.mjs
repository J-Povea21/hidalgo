// Runs the real bundled server over stdio with a demo run, for trying the page
// by hand or driving it headless. Prints each page event and answers it.
//   pnpm run demo            opens the page in your browser
//   HIDALGO_OPEN=0 pnpm run demo   prints the address instead
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const data = mkdtempSync(join(tmpdir(), 'hidalgo-demo-'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(root, 'dist', 'server.mjs')],
  env: { ...process.env, CLAUDE_PLUGIN_DATA: data },
  stderr: 'inherit',
});
const client = new Client({ name: 'hidalgo-demo', version: '1' });
await client.connect(transport);

const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 30 * 60 * 1000 });
  const body = JSON.parse(result.content[0].text);
  if (result.isError) {
    throw new Error(`${name}: ${body.message}`);
  }
  return body;
};

const card = (title, what) => ({
  title,
  tags: ['backend', 'bug'],
  proposal: {
    priority: 'high. A malformed payload is a 500 with a stack trace',
    shape: 'one card, one PR',
    status: 'ready for work',
    related: 'none',
  },
  body: {
    what,
    where: ['`src/common/decorators/validators/coupon-exists.decorator.ts:12`, throws instead of returning `false`'],
    why: 'class-validator runs custom constraints without a try/catch.',
  },
  criteria: [
    {
      mode: 'code',
      text: 'The validator guards its own input rather than relying on a sibling decorator running first',
    },
    { mode: 'test', text: 'A unit test covers each non-array input type alongside a valid array' },
  ],
  manualQa: ['Submitting the order form with a valid set of coupons still saves, in development'],
  assuming: ['No client relies on the 500 to detect a bad payload'],
  provenance: 'Demo data: nothing here is created anywhere.',
});

const { runId } = await call('open_session', {
  skill: 'card',
  project: 'Storefront',
  subject: 'CouponExists validator',
});
const { added } = await call('add_items', {
  runId,
  items: [
    {
      kind: 'card',
      fields: card(
        'Checkout - CouponExists validator returns 500 on a non-array',
        '`couponIds` sent as anything other than an array returns a 500 instead of a 400.',
      ),
    },
    {
      kind: 'card',
      fields: {
        ...card(
          'Checkout - Order form shows the validation message for coupons',
          'The form shows a generic error instead of saying what is wrong with the coupons.',
        ),
        tags: ['frontend'],
      },
    },
  ],
});
await call('ask', {
  runId,
  itemId: added[0].id,
  questions: [
    {
      text: 'Four other validators follow the same pattern. Fix them here or card them separately?',
      evidence: [
        { kind: 'verified', text: '4 matches under `src/common/decorators/validators/`' },
        { kind: 'judgement', text: 'Only `CouponExists` has a reported failure' },
      ],
      options: [
        { label: 'Card them separately', detail: 'Keeps this PR to one file.' },
        { label: 'Include them here', detail: 'Fixes the class at once.' },
      ],
      recommended: 0,
    },
  ],
});
const { embed } = await call('create_diagram', {
  runId,
  spec: {
    type: 'sequence',
    participants: [
      { id: 'P', label: 'Page' },
      { id: 'S', label: 'Hidalgo (Item(kind): "rules")' },
      { id: 'C', label: 'Claude' },
    ],
    steps: [
      { from: 'P', to: 'S', text: 'your answer' },
      { from: 'S', to: 'C', text: 'wait_for_events returns', reply: true },
      { note: 'Claude works; the page shows the step', over: ['C'] },
    ],
  },
});
console.log(`demo run ${runId} ready (data in ${data})`);

// Echo every event back; the first message gets a diagram of how it arrived.
let first = true;
for (;;) {
  const { events, timedOut } = await call('wait_for_events', { runId });
  if (timedOut) {
    continue;
  }
  for (const event of events) {
    console.log('event', JSON.stringify(event));
    if (first && event.thread) {
      first = false;
      await call('send_message', {
        runId,
        replyTo: event.seq,
        text: `Got it. Here's how that reached me:\n\n${embed}`,
      });
      continue;
    }
    if (event.thread) {
      await call('send_message', {
        runId,
        replyTo: event.seq,
        text: `Received: “${event.text}”${event.images ? ` with ${event.images.length} image(s)` : ''}.`,
      });
    }
    if (event.type === 'answers') {
      await call('set_status', { runId, line: 'applying your answers' }).then(() => call('set_status', { runId }));
    }
  }
}
