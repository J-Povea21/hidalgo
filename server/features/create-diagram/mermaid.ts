/**
 * Structure in, Mermaid out. Claude never writes Mermaid: every label is
 * escaped here, so punctuation in a label can't change the diagram's syntax.
 */
import type { DiagramSpec } from '@shared/contract.ts';
import { WorkbenchError } from '@server/domain/errors.ts';

/** Mermaid's entity codes for characters that are syntax somewhere in a diagram. */
const ENTITIES: Record<string, string> = {
  '"': '#quot;',
  '#': '#35;',
  ';': '#59;',
  '<': '#lt;',
  '>': '#gt;',
  '|': '#124;',
  '[': '#91;',
  ']': '#93;',
  '{': '#123;',
  '}': '#125;',
  '(': '#40;',
  ')': '#41;',
  '`': '#96;',
  ':': '#58;',
  '%': '#37;',
  '&': '#38;',
};

export function escapeLabel(text: string): string {
  return text.replace(/["#;<>|[\]{}()`:%&]/g, (char) => ENTITIES[char]!).replace(/\r?\n/g, '<br/>');
}

function validate(spec: DiagramSpec): void {
  const dupes = (ids: string[]) => ids.filter((id, index) => ids.indexOf(id) !== index);
  if (spec.type === 'flow') {
    const nodes = spec.nodes.map((node) => node.id);
    const groups = spec.groups.map((group) => group.id);
    const repeated = dupes([...nodes, ...groups]);
    if (repeated.length) {
      throw new WorkbenchError('invalid', `diagram ids must be unique: ${[...new Set(repeated)].join(', ')}`);
    }
    for (const node of spec.nodes) {
      if (node.group && !groups.includes(node.group)) {
        throw new WorkbenchError('invalid', `node ${node.id} is in unknown group ${node.group}`);
      }
    }
    for (const edge of spec.edges) {
      for (const end of [edge.from, edge.to]) {
        if (!nodes.includes(end) && !groups.includes(end)) {
          throw new WorkbenchError('invalid', `edge ${edge.from} -> ${edge.to} names unknown node ${end}`);
        }
      }
    }
  } else {
    const ids = spec.participants.map((participant) => participant.id);
    const repeated = dupes(ids);
    if (repeated.length) {
      throw new WorkbenchError('invalid', `participant ids must be unique: ${[...new Set(repeated)].join(', ')}`);
    }
    for (const step of spec.steps) {
      const used = 'note' in step ? step.over : [step.from, step.to];
      for (const id of used) {
        if (!ids.includes(id)) {
          throw new WorkbenchError('invalid', `step names unknown participant ${id}`);
        }
      }
    }
  }
}

export function toMermaid(spec: DiagramSpec): string {
  validate(spec);
  if (spec.type === 'sequence') {
    const lines = ['sequenceDiagram'];
    for (const participant of spec.participants) {
      lines.push(`    participant ${participant.id} as ${escapeLabel(participant.label)}`);
    }
    for (const step of spec.steps) {
      if ('note' in step) {
        lines.push(`    Note over ${step.over.join(',')}: ${escapeLabel(step.note)}`);
      } else {
        lines.push(`    ${step.from}${step.reply ? '-->>' : '->>'}${step.to}: ${escapeLabel(step.text)}`);
      }
    }
    return lines.join('\n');
  }
  const lines = [`flowchart ${spec.direction}`];
  const nodeLine = (flowNode: (typeof spec.nodes)[number], indent: string) =>
    `${indent}${flowNode.id}["${escapeLabel(flowNode.label)}"]`;
  for (const group of spec.groups) {
    lines.push(`    subgraph ${group.id}["${escapeLabel(group.label)}"]`);
    for (const member of spec.nodes.filter((flowNode) => flowNode.group === group.id)) {
      lines.push(nodeLine(member, '      '));
    }
    lines.push('    end');
  }
  for (const loose of spec.nodes.filter((flowNode) => !flowNode.group)) {
    lines.push(nodeLine(loose, '    '));
  }
  for (const edge of spec.edges) {
    const arrow = edge.dashed ? '-.->' : '-->';
    lines.push(`    ${edge.from} ${arrow}${edge.label ? `|"${escapeLabel(edge.label)}"|` : ''} ${edge.to}`);
  }
  return lines.join('\n');
}

/** The same content as plain text: what the page shows if a diagram can't be drawn. */
export function toOutline(spec: DiagramSpec): string {
  if (spec.type === 'sequence') {
    const name = (id: string) => spec.participants.find((participant) => participant.id === id)?.label ?? id;
    return spec.steps
      .map((step, index) =>
        'note' in step
          ? `${index + 1}. (${step.over.map(name).join(', ')}) ${step.note}`
          : `${index + 1}. ${name(step.from)} → ${name(step.to)}: ${step.text}`,
      )
      .join('\n');
  }
  const label = (id: string) =>
    spec.nodes.find((node) => node.id === id)?.label ?? spec.groups.find((group) => group.id === id)?.label ?? id;
  const groups = spec.groups.map(
    (group) =>
      `${group.label}: ${spec.nodes
        .filter((node) => node.group === group.id)
        .map((node) => node.label)
        .join(', ')}`,
  );
  const edges = spec.edges.map(
    (edge) => `${label(edge.from)} → ${label(edge.to)}${edge.label ? ` (${edge.label})` : ''}`,
  );
  return [...groups, ...edges].join('\n');
}
