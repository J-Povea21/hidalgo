/**
 * One conversation: the feed, and a composer that takes text, pasted or dropped
 * images (shrunk before sending), and quotes from the item. ⌘/Ctrl+Enter sends.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Diagram, Message } from '../../../shared/contract.ts';
import { loadDraft, saveDraft } from '../../infra/drafts.ts';
import { compress, MAX_PER_MESSAGE } from '../../infra/images.ts';
import { Markdown } from '../../ui/markdown.tsx';
import { time, toast, Typing } from '../../ui/parts.tsx';

export interface ThreadProps {
  runId: string;
  threadId: string;
  title: string;
  hint: string;
  messages: Message[];
  diagrams: Diagram[];
  /** Shown while Claude works on something sent from this thread. */
  typing?: string | undefined;
  disabled: boolean;
  /** A quote to insert; a new nonce inserts it again. */
  quote?: { text: string; nonce: number } | undefined;
  imageSrc: (name: string) => Promise<string>;
  onSend: (text: string, images: string[]) => Promise<boolean>;
  onDiagramFailed: (id: string, error: string) => void;
  onZoom: (html?: string, src?: string) => void;
}

const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

export function Thread(p: ThreadProps) {
  const [text, setText] = useState<string>(() => loadDraft(p.runId, `text:${p.threadId}`, ''));
  const [images, setImages] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => saveDraft(p.runId, `text:${p.threadId}`, text), [text]);
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight }); }, [p.messages.length, p.typing]);
  useEffect(() => {
    if (!p.quote) return;
    const quoted = p.quote.text.split('\n').map((l) => `> ${l}`).join('\n');
    setText((t) => `${quoted}\n\n${t}`);
    box.current?.focus();
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [p.quote?.nonce]);

  const add = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    if (images.length >= MAX_PER_MESSAGE) return toast(`Up to ${MAX_PER_MESSAGE} images per message`);
    const urls = await Promise.all(list.slice(0, MAX_PER_MESSAGE - images.length).map(compress));
    let kept = 0;
    setImages((cur) => {
      const next = [...cur, ...urls].slice(0, MAX_PER_MESSAGE);
      kept = next.length - cur.length;
      return next;
    });
    toast(kept < list.length ? `Attached ${kept}; up to ${MAX_PER_MESSAGE} per message` : `${kept} image${kept > 1 ? 's' : ''} attached`);
  };

  const send = async () => {
    if (!text.trim() && !images.length) return;
    const [t, imgs] = [text, images];
    setText('');
    setImages([]);
    if (!(await p.onSend(t, imgs))) { setText(t); setImages(imgs); }
  };

  return (
    <section class="panel" aria-label={p.title}>
      <div class="phead"><h2>{p.title}</h2><span class="meta">{p.messages.length} message{p.messages.length === 1 ? '' : 's'}</span></div>
      <div class="feed" ref={feed} aria-live="polite">
        {p.messages.length === 0 && !p.typing && <div class="meta">No messages yet.</div>}
        {p.messages.map((m) => (
          <div class={`msg ${m.from}`} key={m.id}>
            <div class="who">{m.from === 'claude' ? 'Claude' : 'You'} · {time(m.at)}</div>
            <Markdown text={m.text} diagrams={p.diagrams} onDiagramFailed={p.onDiagramFailed} onZoom={(html) => p.onZoom(html)} />
            {m.images?.map((name) => <StoredImage key={name} name={name} load={p.imageSrc} onZoom={(src) => p.onZoom(undefined, src)} />)}
          </div>
        ))}
        {p.typing && <Typing label={p.typing} />}
      </div>
      <div
        class={`composewrap ${drag ? 'drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer?.files) void add(e.dataTransfer.files); }}
      >
        {images.length > 0 && (
          <div class="thumbs">
            {images.map((src, k) => (
              <div class="thumb" key={k}>
                <img src={src} alt={`Attachment ${k + 1}`} />
                <button aria-label="Remove image" onClick={() => setImages(images.filter((_, j) => j !== k))}>×</button>
              </div>
            ))}
          </div>
        )}
        <div class="compose">
          <button class="ghost" aria-label="Attach images" disabled={p.disabled} onClick={() => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
            input.onchange = () => input.files && void add(input.files);
            input.click();
          }}>📎</button>
          <textarea
            ref={box}
            rows={1}
            aria-label={p.hint}
            placeholder={`${p.hint} Paste or drop images. ${mac ? '⌘' : 'Ctrl'}+Enter to send.`}
            value={text}
            disabled={p.disabled}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              setText(t.value);
              t.style.height = 'auto';
              t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
            }}
            onPaste={(e) => { const f = e.clipboardData?.files; if (f?.length) { e.preventDefault(); void add(f); } }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
          />
          <button class="primary" disabled={p.disabled} onClick={send}>Send</button>
        </div>
      </div>
    </section>
  );
}

/** Stored images need the token, which an <img> can't send: fetch them, show a blob URL. */
function StoredImage(p: { name: string; load: (name: string) => Promise<string>; onZoom: (src: string) => void }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => { let live = true; p.load(p.name).then((s) => live && setSrc(s), () => undefined); return () => { live = false; }; }, [p.name]);
  return src ? <button type="button" class="stored" aria-label="Attached image. Open full size" onClick={() => p.onZoom(src)}><img src={src} alt="" /></button> : null;
}
