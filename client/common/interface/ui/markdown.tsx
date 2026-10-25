import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Diagram as DiagramData } from '@shared/contract.ts';

const PLACEHOLDER = /\{\{diagram:([A-Za-z0-9_-]+)\}\}/g;

/** What Claude is told about a diagram that failed, at most this long. */
const ERROR_MAX_CHARS = 500;

/** Parsing and sanitizing take real time, and the page re-renders on every state push. */
const CACHE_MAX_ENTRIES = 500;
const blockCache = new Map<string, string>();
const inlineCache = new Map<string, string>();

const drawnDiagrams = new Map<string, string>();
const reportedFailures = new Set<string>();
let mermaidLoad: Promise<typeof import('mermaid').default> | undefined;
let renderCount = 0;

/**
 * Raw HTML in a message is shown as text, never parsed: Claude's Markdown has no need for it,
 * and it keeps tag soup (mXSS samples, inline handlers) from ever reaching the sanitizer.
 */
marked.use({ async: false, gfm: true, breaks: true, renderer: { html: ({ text }) => escapeHtml(text) } });

interface MarkdownProps {
  text: string;
  diagrams: DiagramData[];
  onDiagramFailed: (id: string, error: string) => void;
  onZoom: (html: string) => void;
}

/**
 * Markdown, sanitized, with `{{diagram:<id>}}` placeholders turned into diagrams.
 * Mermaid loads only when a diagram is actually on screen.
 */
export function Markdown(props: MarkdownProps) {
  // Splitting on the placeholder leaves text at even positions and diagram ids at odd ones.
  const parts = useMemo(() => props.text.split(PLACEHOLDER), [props.text]);
  return (
    <div class="md">
      {parts.map((part, index) => {
        const isDiagramId = index % 2 === 1;
        if (isDiagramId) {
          const data = props.diagrams.find((diagram) => diagram.id === part);
          return (
            <Diagram key={`d${index}`} id={part} data={data} onFailed={props.onDiagramFailed} onZoom={props.onZoom} />
          );
        }
        if (!part.trim()) {
          return null;
        }
        return <div key={`t${index}`} dangerouslySetInnerHTML={{ __html: toSafeHtml(part) }} />;
      })}
    </div>
  );
}

interface DiagramProps {
  id: string;
  data: DiagramData | undefined;
  onFailed: (id: string, error: string) => void;
  onZoom: (html: string) => void;
}

/** Draws a diagram; if it can't, shows its outline instead and reports the failure. Never shows an error. */
export function Diagram(props: DiagramProps) {
  const [svg, setSvg] = useState<string | undefined>(props.data ? drawnDiagrams.get(props.data.mermaid) : undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const diagram = props.data;
    if (!diagram || svg || failed) {
      return;
    }
    let mounted = true;
    draw(diagram.mermaid).then(
      (drawn) => mounted && setSvg(drawn),
      (error: unknown) => {
        if (!mounted) {
          return;
        }
        setFailed(true);
        // Reported once per page, not on every remount.
        if (!reportedFailures.has(props.id)) {
          reportedFailures.add(props.id);
          const message = error instanceof Error ? error.message : String(error);
          props.onFailed(props.id, message.slice(0, ERROR_MAX_CHARS));
        }
      },
    );
    return () => {
      mounted = false;
    };
  }, [props.data?.mermaid]);

  if (!props.data) {
    return <div class="diagram loading">Diagram not found.</div>;
  }
  if (failed) {
    return (
      <div class="diagram outline" aria-label="Diagram as text">
        {props.data.outline}
      </div>
    );
  }
  if (!svg) {
    return <div class="diagram loading">Drawing diagram…</div>;
  }
  // The drawing is clickable with a mouse; the button is the keyboard's way in.
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

/** Block Markdown (paragraphs, lists, code) as sanitized HTML. */
export function toSafeHtml(text: string): string {
  return memo(blockCache, text, () => sanitize(marked.parse(text)));
}

/** Inline Markdown (no paragraph), for labels, options and list items. */
export function toInlineHtml(text: string): string {
  return memo(inlineCache, text, () => sanitize(marked.parseInline(text)));
}

// ---- parsing ----

function sanitize(html: string | Promise<string>): string {
  // marked is configured synchronous above, so a promise here would be a bug in that setup.
  if (typeof html !== 'string') {
    throw new Error('marked returned a promise: it must be configured with async: false');
  }
  return DOMPurify.sanitize(html);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function memo(cache: Map<string, string>, text: string, make: () => string): string {
  const cached = cache.get(text);
  if (cached !== undefined) {
    return cached;
  }
  if (cache.size >= CACHE_MAX_ENTRIES) {
    cache.clear();
  }
  const html = make();
  cache.set(text, html);
  return html;
}

// ---- drawing ----

async function draw(mermaidSource: string): Promise<string> {
  const mermaid = await loadMermaid();
  renderCount += 1;
  const { svg } = await mermaid.render(`wbd${renderCount}`, mermaidSource);
  drawnDiagrams.set(mermaidSource, svg);
  return svg;
}

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
  // A failed chunk load must not break every diagram until reload: the next one tries again.
  mermaidLoad.catch(() => {
    mermaidLoad = undefined;
  });
  return mermaidLoad;
}
