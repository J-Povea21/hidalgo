/**
 * Structure in, Mermaid out. Claude never writes Mermaid: every label is
 * escaped here, so punctuation in a label can't change the diagram's syntax.
 */
import type { DiagramSpec } from '../../../shared/contract.ts';
import { WorkbenchError } from '../../kernel/errors.ts';

/** Mermaid's entity codes for characters that are syntax somewhere in a diagram. */
const ENTITIES: Record<string, string> = {
  '"': '#quot;', '#': '#35;', ';': '#59;', '<': '#lt;', '>': '#gt;',
  '|': '#124;', '[': '#91;', ']': '#93;', '{': '#123;', '}': '#125;',
  '(': '#40;', ')': '#41;', '`': '#96;', ':': '#58;', '%': '#37;', '&': '#38;',
};

export function escapeLabel(s: string): string {
  return s.replace(/["#;<>|[\]{}()`:%&]/g, (c) => ENTITIES[c]!).replace(/\r?\n/g, '<br/>');
}

function validate(spec: DiagramSpec): void {
  const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
  if (spec.type === 'flow') {
    const nodes = spec.nodes.map((n) => n.id);
    const groups = spec.groups.map((g) => g.id);
    const d = dupes([...nodes, ...groups]);
    if (d.length) throw new WorkbenchError('invalid', `diagram ids must be unique: ${[...new Set(d)].join(', ')}`);
    for (const n of spec.nodes) {
      if (n.group && !groups.includes(n.group)) throw new WorkbenchError('invalid', `node ${n.id} is in unknown group ${n.group}`);
    }
    for (const e of spec.edges) {
      for (const end of [e.from, e.to]) {
        if (!nodes.includes(end) && !groups.includes(end)) throw new WorkbenchError('invalid', `edge ${e.from} -> ${e.to} names unknown node ${end}`);
      }
    }
  } else {
    const ids = spec.participants.map((p) => p.id);
    const d = dupes(ids);
    if (d.length) throw new WorkbenchError('invalid', `participant ids must be unique: ${[...new Set(d)].join(', ')}`);
    for (const s of spec.steps) {
      const used = 'note' in s ? s.over : [s.from, s.to];
      for (const id of used) if (!ids.includes(id)) throw new WorkbenchError('invalid', `step names unknown participant ${id}`);
    }
  }
}

export function toMermaid(spec: DiagramSpec): string {
  validate(spec);
  if (spec.type === 'sequence') {
    const lines = ['sequenceDiagram'];
    for (const p of spec.participants) lines.push(`    participant ${p.id} as ${escapeLabel(p.label)}`);
    for (const s of spec.steps) {
      if ('note' in s) lines.push(`    Note over ${s.over.join(',')}: ${escapeLabel(s.note)}`);
      else lines.push(`    ${s.from}${s.reply ? '-->>' : '->>'}${s.to}: ${escapeLabel(s.text)}`);
    }
    return lines.join('\n');
  }
  const lines = [`flowchart ${spec.direction}`];
  const node = (n: (typeof spec.nodes)[number], indent: string) => `${indent}${n.id}["${escapeLabel(n.label)}"]`;
  for (const g of spec.groups) {
    lines.push(`    subgraph ${g.id}["${escapeLabel(g.label)}"]`);
    for (const n of spec.nodes.filter((n) => n.group === g.id)) lines.push(node(n, '      '));
    lines.push('    end');
  }
  for (const n of spec.nodes.filter((n) => !n.group)) lines.push(node(n, '    '));
  for (const e of spec.edges) {
    const arrow = e.dashed ? '-.->' : '-->';
    lines.push(`    ${e.from} ${arrow}${e.label ? `|"${escapeLabel(e.label)}"|` : ''} ${e.to}`);
  }
  return lines.join('\n');
}

/** The same content as plain text: what the page shows if a diagram can't be drawn. */
export function toOutline(spec: DiagramSpec): string {
  if (spec.type === 'sequence') {
    const name = (id: string) => spec.participants.find((p) => p.id === id)?.label ?? id;
    return spec.steps
      .map((s, i) => ('note' in s ? `${i + 1}. (${s.over.map(name).join(', ')}) ${s.note}` : `${i + 1}. ${name(s.from)} → ${name(s.to)}: ${s.text}`))
      .join('\n');
  }
  const label = (id: string) => spec.nodes.find((n) => n.id === id)?.label ?? spec.groups.find((g) => g.id === id)?.label ?? id;
  const groups = spec.groups.map((g) => `${g.label}: ${spec.nodes.filter((n) => n.group === g.id).map((n) => n.label).join(', ')}`);
  const edges = spec.edges.map((e) => `${label(e.from)} → ${label(e.to)}${e.label ? ` (${e.label})` : ''}`);
  return [...groups, ...edges].join('\n');
}
