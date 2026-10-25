/**
 * Markdown, sanitized, with `{{diagram:<id>}}` placeholders turned into
 * diagrams. Mermaid is loaded only when a diagram is actually on screen.
 */
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Diagram as DiagramData } from '@shared/contract.ts';

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * Raw HTML in a message is shown as text, never parsed: Claude's Markdown has no need for it,
 * and it keeps tag soup (mXSS samples, inline handlers) from ever reaching the sanitizer.
 * DOMPurify still cleans everything Markdown itself produces.
 */
marked.use({ gfm: true, breaks: true, renderer: { html: ({ text }) => escapeHtml(text) } });

const PLACEHOLDER = /\{\{diagram:([A-Za-z0-9_-]+)\}\}/g;

/**
 * Parsing and sanitizing cost real time per message, and the page re-renders on
 * every state push, so results are memoized (bounded: cleared past CACHE_MAX).
 */
const CACHE_MAX = 500;
const blockCache = new Map<string, string>();
const inlineCache = new Map<string, string>();
function memo(cache: Map<string, string>, text: string, make: () => string): string {
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  if (cache.size >= CACHE_MAX) cache.clear();
  const html = make();
  cache.set(text, html);
  return html;
}

export const toSafeHtml = (text: string): string =>
  memo(blockCache, text, () => DOMPurify.sanitize(marked.parse(text, { async: false }) as string));

/** Inline Markdown (no paragraph), for labels, options and list items. */
export const toInlineHtml = (text: string): string =>
  memo(inlineCache, text, () => DOMPurify.sanitize(marked.parseInline(text, { async: false }) as string));

export function Markdown(props: {
  text: string;
  diagrams: DiagramData[];
  onDiagramFailed: (id: string, error: string) => void;
  onZoom: (html: string) => void;
}) {
  // Split around diagram placeholders so each diagram is its own component.
  const parts = useMemo(() => props.text.split(PLACEHOLDER), [props.text]);
  return (
    <div class="md">
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Diagram
            key={`d${index}`}
            data={props.diagrams.find((diagram) => diagram.id === part)}
            id={part}
            onFailed={props.onDiagramFailed}
            onZoom={props.onZoom}
          />
        ) : part.trim() ? (
          <div key={`t${index}`} dangerouslySetInnerHTML={{ __html: toSafeHtml(part) }} />
        ) : null,
      )}
    </div>
  );
}

let mermaidLoad: Promise<typeof import('mermaid').default> | undefined;
let renderSeq = 0;
const svgCache = new Map<string, string>();
/** A diagram that failed is reported to Claude once per page, not on every remount. */
const reportedFailures = new Set<string>();

function loadMermaid() {
  mermaidLoad ??= import('mermaid').then((module) => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    module.default.initialize({
      startOnLoad: false,
      theme: dark ? 'dark' : 'neutral',
      securityLevel: 'strict',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    });
    return module.default;
  });
  // A failed chunk load must not break every diagram until reload: let the next one retry.
  mermaidLoad.catch(() => {
    mermaidLoad = undefined;
  });
  return mermaidLoad;
}

/** Draws a diagram; if it can't, shows its outline instead and reports the failure. Never shows an error. */
export function Diagram(props: {
  id: string;
  data: DiagramData | undefined;
  onFailed: (id: string, error: string) => void;
  onZoom: (html: string) => void;
}) {
  const [svg, setSvg] = useState<string | undefined>(props.data ? svgCache.get(props.data.mermaid) : undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const diagram = props.data;
    if (!diagram || svg || failed) return;
    let live = true;
    loadMermaid()
      .then((mermaid) => mermaid.render(`wbd${++renderSeq}`, diagram.mermaid))
      .then(({ svg: drawn }) => {
        svgCache.set(diagram.mermaid, drawn);
        if (live) setSvg(drawn);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setFailed(true);
        if (!reportedFailures.has(props.id)) {
          reportedFailures.add(props.id);
          props.onFailed(props.id, String((error as Error)?.message ?? error).slice(0, 500));
        }
      });
    return () => {
      live = false;
    };
  }, [props.data?.mermaid]);

  if (!props.data) return <div class="diagram loading">Diagram not found.</div>;
  if (failed)
    return (
      <div class="diagram outline" aria-label="Diagram as text">
        {props.data.outline}
      </div>
    );
  if (!svg) return <div class="diagram loading">Drawing diagram…</div>;
  // The drawing is clickable for a mouse; the button is the keyboard's way in (and keeps the
  // drawing's own text as its content, not hidden behind a button's name).
  return (
    <div class="diagram" onClick={() => props.onZoom(svg)}>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      <button
        type="button"
        class="link zoom"
        onClick={(event) => {
          event.stopPropagation();
          props.onZoom(svg);
        }}
      >
        Open diagram full size
      </button>
    </div>
  );
}
