/**
 * One conversation: the feed, and a composer that takes text, pasted or dropped
 * images (shrunk before sending), and quotes from the item. ⌘/Ctrl+Enter sends.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Diagram, Message } from '@shared/contract.ts';
import { loadDraft, saveDraft } from '@client/infra/drafts.ts';
import { compress, MAX_PER_MESSAGE } from '@client/infra/images.ts';
import { Markdown } from '@client/ui/markdown.tsx';
import { time, toast, Typing } from '@client/ui/parts.tsx';

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

export function Thread(props: ThreadProps) {
  const [text, setText] = useState<string>(() => loadDraft(props.runId, `text:${props.threadId}`, ''));
  const [images, setImages] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => saveDraft(props.runId, `text:${props.threadId}`, text), [text]);
  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight });
  }, [props.messages.length, props.typing]);
  useEffect(() => {
    if (!props.quote) return;
    const quoted = props.quote.text
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    setText((current) => `${quoted}\n\n${current}`);
    box.current?.focus();
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [props.quote?.nonce]);

  const add = async (files: FileList | File[]) => {
    const list = [...files].filter((file) => file.type.startsWith('image/'));
    if (!list.length) return;
    if (images.length >= MAX_PER_MESSAGE) return toast(`Up to ${MAX_PER_MESSAGE} images per message`);
    const urls = await Promise.all(list.slice(0, MAX_PER_MESSAGE - images.length).map(compress));
    let kept = 0;
    setImages((cur) => {
      const next = [...cur, ...urls].slice(0, MAX_PER_MESSAGE);
      kept = next.length - cur.length;
      return next;
    });
    toast(
      kept < list.length
        ? `Attached ${kept}; up to ${MAX_PER_MESSAGE} per message`
        : `${kept} image${kept > 1 ? 's' : ''} attached`,
    );
  };

  const send = async () => {
    if (!text.trim() && !images.length) return;
    const [sentText, imgs] = [text, images];
    setText('');
    setImages([]);
    if (!(await props.onSend(sentText, imgs))) {
      setText(sentText);
      setImages(imgs);
    }
  };

  return (
    <section class="panel" aria-label={props.title}>
      <div class="phead">
        <h2>{props.title}</h2>
        <span class="meta">
          {props.messages.length} message{props.messages.length === 1 ? '' : 's'}
        </span>
      </div>
      <div class="feed" ref={feed} aria-live="polite">
        {props.messages.length === 0 && !props.typing && <div class="meta">No messages yet.</div>}
        {props.messages.map((message) => (
          <div class={`msg ${message.from}`} key={message.id}>
            <div class="who">
              {message.from === 'claude' ? 'Claude' : 'You'} · {time(message.at)}
            </div>
            <Markdown
              text={message.text}
              diagrams={props.diagrams}
              onDiagramFailed={props.onDiagramFailed}
              onZoom={(html) => props.onZoom(html)}
            />
            {message.images?.map((name) => (
              <StoredImage
                key={name}
                name={name}
                load={props.imageSrc}
                onZoom={(src) => props.onZoom(undefined, src)}
              />
            ))}
          </div>
        ))}
        {props.typing && <Typing label={props.typing} />}
      </div>
      <div
        class={`composewrap ${drag ? 'drag' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          if (event.dataTransfer?.files) void add(event.dataTransfer.files);
        }}
      >
        {images.length > 0 && (
          <div class="thumbs">
            {images.map((src, position) => (
              <div class="thumb" key={position}>
                <img src={src} alt={`Attachment ${position + 1}`} />
                <button
                  aria-label="Remove image"
                  onClick={() => setImages(images.filter((_, otherPosition) => otherPosition !== position))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div class="compose">
          <button
            class="ghost"
            aria-label="Attach images"
            disabled={props.disabled}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.multiple = true;
              input.onchange = () => input.files && void add(input.files);
              input.click();
            }}
          >
            📎
          </button>
          <textarea
            ref={box}
            rows={1}
            aria-label={props.hint}
            placeholder={`${props.hint} Paste or drop images. ${mac ? '⌘' : 'Ctrl'}+Enter to send.`}
            value={text}
            disabled={props.disabled}
            onInput={(event) => {
              const textarea = event.target as HTMLTextAreaElement;
              setText(textarea.value);
              textarea.style.height = 'auto';
              textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
            }}
            onPaste={(event) => {
              const files = event.clipboardData?.files;
              if (files?.length) {
                event.preventDefault();
                void add(files);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <button class="primary" disabled={props.disabled} onClick={send}>
            Send
          </button>
        </div>
      </div>
    </section>
  );
}

/** Stored images need the token, which an <img> can't send: fetch them, show a blob URL. */
function StoredImage(props: { name: string; load: (name: string) => Promise<string>; onZoom: (src: string) => void }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let live = true;
    props.load(props.name).then(
      (url) => live && setSrc(url),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [props.name]);
  return src ? (
    <button type="button" class="stored" aria-label="Attached image. Open full size" onClick={() => props.onZoom(src)}>
      <img src={src} alt="" />
    </button>
  ) : null;
}
