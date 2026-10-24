/**
 * Markdown, sanitized, with `{{diagram:<id>}}` placeholders turned into
 * diagrams. Mermaid is loaded only when a diagram is actually on screen.
 */
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Diagram as DiagramData } from '../../shared/contract.ts';

marked.setOptions({ gfm: true, breaks: true });

const PLACEHOLDER = /\{\{diagram:([A-Za-z0-9_-]+)\}\}/g;

export function toSafeHtml(text: string): string {
  return DOMPurify.sanitize(marked.parse(text, { async: false }) as string);
}

export function Markdown(props: { text: string; diagrams: DiagramData[]; onDiagramFailed: (id: string, error: string) => void; onZoom: (node: HTMLElement) => void }) {
  // Split around diagram placeholders so each diagram is its own component.
  const parts = useMemo(() => props.text.split(PLACEHOLDER), [props.text]);
  return (
    <div class="md">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Diagram key={`d${i}`} data={props.diagrams.find((d) => d.id === part)} id={part} onFailed={props.onDiagramFailed} onZoom={props.onZoom} />
        ) : part.trim() ? (
          <div key={`t${i}`} dangerouslySetInnerHTML={{ __html: toSafeHtml(part) }} />
        ) : null,
      )}
    </div>
  );
}

let mermaidLoad: Promise<typeof import('mermaid').default> | undefined;
let seq = 0;
const cache = new Map<string, string>();

function loadMermaid() {
  mermaidLoad ??= import('mermaid').then((m) => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    m.default.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'neutral', securityLevel: 'strict', fontFamily: 'ui-sans-serif, system-ui, sans-serif' });
    return m.default;
  });
  return mermaidLoad;
}

/** Draws a diagram; if it can't, shows its outline instead and reports the failure. Never shows an error. */
export function Diagram(props: { id: string; data: DiagramData | undefined; onFailed: (id: string, error: string) => void; onZoom: (node: HTMLElement) => void }) {
  const [svg, setSvg] = useState<string | undefined>(props.data ? cache.get(props.data.mermaid) : undefined);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const reported = useRef(false);

  useEffect(() => {
    const d = props.data;
    if (!d || svg || failed) return;
    let live = true;
    loadMermaid()
      .then((m) => m.render(`wbd${++seq}`, d.mermaid))
      .then(({ svg }) => { cache.set(d.mermaid, svg); if (live) setSvg(svg); })
      .catch((e: unknown) => {
        if (!live) return;
        setFailed(true);
        if (!reported.current) { reported.current = true; props.onFailed(props.id, String((e as Error)?.message ?? e).slice(0, 500)); }
      });
    return () => { live = false; };
  }, [props.data?.mermaid]);

  if (!props.data) return <div class="diagram loading">Diagram not found.</div>;
  if (failed) return <div class="diagram outline" aria-label="Diagram as text">{props.data.outline}</div>;
  if (!svg) return <div class="diagram loading">Drawing diagram…</div>;
  return <div ref={ref} class="diagram" role="img" aria-label="Diagram, click to enlarge" onClick={() => ref.current && props.onZoom(ref.current)} dangerouslySetInnerHTML={{ __html: svg }} />;
}
