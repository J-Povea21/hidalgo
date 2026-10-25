// @vitest-environment happy-dom
import mermaid from 'mermaid';
import { beforeAll, describe, expect, it } from 'vitest';
import { DiagramSpec } from '@shared/contract.ts';
import { toMermaid, toOutline } from '@server/conversation/domain/mermaid.ts';

/** Labels built to break Mermaid syntax if anything reached it unescaped. */
const HOSTILE = [
  'Item(kind)',
  'a "quoted" word',
  'x --> y',
  'semi; colon: pipe|',
  '[brackets] {braces}',
  '#hash %percent &amp',
  '<br/> <script>',
  'end',
  'subgraph',
  'graph TD',
  'back`tick',
  'line one\nline two',
  'arrow ->> here',
  'dash - dash',
];

beforeAll(() => mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' }));

async function parses(text: string) {
  await expect(mermaid.parse(text)).resolves.toBeTruthy();
}

describe('generated Mermaid always parses', () => {
  it('flowchart with hostile node, group and edge labels', async () => {
    for (const label of HOSTILE) {
      const spec = DiagramSpec.parse({
        type: 'flow',
        groups: [{ id: 'G', label }],
        nodes: [
          { id: 'A', label, group: 'G' },
          { id: 'B', label },
        ],
        edges: [
          { from: 'A', to: 'B', label },
          { from: 'B', to: 'G', dashed: true },
        ],
      });
      await parses(toMermaid(spec));
    }
  });

  it('sequence with hostile participant, message and note text', async () => {
    for (const label of HOSTILE) {
      const spec = DiagramSpec.parse({
        type: 'sequence',
        participants: [
          { id: 'P', label },
          { id: 'S', label: 'Server' },
        ],
        steps: [
          { from: 'P', to: 'S', text: label },
          { from: 'S', to: 'P', text: label, reply: true },
          { note: label, over: ['P', 'S'] },
        ],
      });
      await parses(toMermaid(spec));
    }
  });

  it('control: the same label written by hand, unescaped, does fail', async () => {
    await expect(
      mermaid.parse('flowchart LR\n    K[server/kernel<br/>Run, Item(kind), Verdict rules]'),
    ).rejects.toBeTruthy();
  });

  it('the label that broke card 3 rev 4 draws', async () => {
    const spec = DiagramSpec.parse({
      type: 'flow',
      nodes: [{ id: 'K', label: 'server/kernel\nRun, Item(kind), Verdict rules' }],
      edges: [],
    });
    await parses(toMermaid(spec));
  });
});

describe('structure is validated before anything is generated', () => {
  it('rejects an edge to a node that does not exist', () => {
    const spec = DiagramSpec.parse({ type: 'flow', nodes: [{ id: 'A', label: 'a' }], edges: [{ from: 'A', to: 'Z' }] });
    expect(() => toMermaid(spec)).toThrow(/unknown node Z/);
  });

  it('rejects duplicate ids and unknown participants', () => {
    expect(() =>
      toMermaid(
        DiagramSpec.parse({
          type: 'flow',
          nodes: [
            { id: 'A', label: 'a' },
            { id: 'A', label: 'b' },
          ],
          edges: [],
        }),
      ),
    ).toThrow(/unique/);
    expect(() =>
      toMermaid(
        DiagramSpec.parse({
          type: 'sequence',
          participants: [
            { id: 'A', label: 'a' },
            { id: 'B', label: 'b' },
          ],
          steps: [{ from: 'A', to: 'C', text: 'x' }],
        }),
      ),
    ).toThrow(/unknown participant C/);
  });
});

describe('the outline fallback', () => {
  it('says the same thing in plain text', () => {
    const spec = DiagramSpec.parse({
      type: 'sequence',
      participants: [
        { id: 'P', label: 'Page' },
        { id: 'C', label: 'Claude' },
      ],
      steps: [
        { from: 'P', to: 'C', text: 'your answers' },
        { note: 'Claude works', over: ['C'] },
      ],
    });
    expect(toOutline(spec)).toBe('1. Page → Claude: your answers\n2. (Claude) Claude works');
  });
});
