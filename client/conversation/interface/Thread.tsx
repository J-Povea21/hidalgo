/**
 * One conversation: the feed, and a composer that takes text, pasted or dropped
 * images (shrunk before sending), and quotes from the item. ⌘/Ctrl+Enter sends.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Diagram, Message } from '@shared/contract.ts';
import { PARTY } from '@shared/values.ts';
import { BrowserDraftStore } from '@client/common/infrastructure/drafts.ts';
import { CLASS, classes } from '@client/common/interface/ui/classes.ts';
import { Markdown } from '@client/common/interface/ui/markdown.tsx';
import { time, Typing } from '@client/common/interface/ui/parts.tsx';
import { useAttachments } from './useAttachments.ts';

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

/** The send shortcut as the user's keyboard labels it, for the composer's placeholder. */
const SEND_SHORTCUT = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘+Enter' : 'Ctrl+Enter';
/** The composer grows with its text up to this height, then scrolls. */
const COMPOSER_MAX_HEIGHT_PX = 140;

export function Thread(props: ThreadProps) {
  const drafts = useMemo(() => new BrowserDraftStore(props.runId), [props.runId]);
  const draftKey = `text:${props.threadId}`;
  const [text, setText] = useState<string>(() => drafts.load(draftKey, ''));
  const { images, setImages, attach, remove } = useAttachments();
  const [dragging, setDragging] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => drafts.save(draftKey, text), [text]);
  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight });
  }, [props.messages.length, props.typing]);
  useEffect(() => {
    if (!props.quote) {
      return;
    }
    // Quote each line Markdown-style above whatever the user had written.
    const quoted = props.quote.text
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    setText((current) => `${quoted}\n\n${current}`);
    composer.current?.focus();
    composer.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [props.quote?.nonce]);

  const send = async () => {
    const nothingToSend = !text.trim() && images.length === 0;
    if (nothingToSend) {
      return;
    }
    const [sentText, sentImages] = [text, images];
    setText('');
    setImages([]);
    const delivered = await props.onSend(sentText, sentImages);
    if (!delivered) {
      setText(sentText);
      setImages(sentImages);
    }
  };

  const chooseFiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => {
      if (input.files) {
        void attach(input.files);
      }
    };
    input.click();
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
          <div class={classes('msg', message.from)} key={message.id}>
            <div class="who">
              {message.from === PARTY.claude ? 'Claude' : 'You'} · {time(message.at)}
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
        class={classes('composewrap', dragging && CLASS.dragging)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer?.files) {
            void attach(event.dataTransfer.files);
          }
        }}
      >
        {images.length > 0 && (
          <div class="thumbs">
            {images.map((src, position) => (
              <div class="thumb" key={position}>
                <img src={src} alt={`Attachment ${position + 1}`} />
                <button aria-label="Remove image" onClick={() => remove(position)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div class="compose">
          <button class="ghost" aria-label="Attach images" disabled={props.disabled} onClick={chooseFiles}>
            📎
          </button>
          <textarea
            ref={composer}
            rows={1}
            aria-label={props.hint}
            placeholder={`${props.hint} Paste or drop images. ${SEND_SHORTCUT} to send.`}
            value={text}
            disabled={props.disabled}
            onInput={(event) => {
              const textarea = event.currentTarget;
              setText(textarea.value);
              textarea.style.height = 'auto';
              textarea.style.height = `${Math.min(textarea.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
            }}
            onPaste={(event) => {
              const files = event.clipboardData?.files;
              if (files?.length) {
                event.preventDefault();
                void attach(files);
              }
            }}
            onKeyDown={(event) => {
              const isSendShortcut = event.key === 'Enter' && (event.metaKey || event.ctrlKey);
              if (isSendShortcut) {
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

interface StoredImageProps {
  name: string;
  load: (name: string) => Promise<string>;
  onZoom: (src: string) => void;
}

/** A stored image needs the token, which an <img> can't send: it is fetched and shown as a blob URL. */
function StoredImage(props: StoredImageProps) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let mounted = true;
    props.load(props.name).then(
      (url) => mounted && setSrc(url),
      () => undefined,
    );
    return () => {
      mounted = false;
    };
  }, [props.name]);
  if (!src) {
    return null;
  }
  return (
    <button type="button" class="stored" aria-label="Attached image. Open full size" onClick={() => props.onZoom(src)}>
      <img src={src} alt="" />
    </button>
  );
}
