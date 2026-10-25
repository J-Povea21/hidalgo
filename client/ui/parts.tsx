/** Small shared pieces: icons, toast, lightbox, typing indicator, badges. */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { ItemStatus } from '@shared/rules.ts';

export const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export const LayersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);

export function Typing(props: { label: string }) {
  return (
    <>
      <div class="typing" aria-hidden="true"><span /><span /><span /></div>
      <div class="typing-label" role="status">{props.label}</div>
    </>
  );
}

const STATUS_TEXT: Record<ItemStatus, string> = {
  questions: 'Questions open', ready: 'Ready', approved: 'Approved', done: 'Done', rejected: 'Rejected', pending: 'Left pending',
};
export const StatusBadge = (props: { status: ItemStatus; children?: ComponentChildren }) => (
  <span class={`badge ${props.status}`}>{props.children ?? STATUS_TEXT[props.status]}</span>
);

const TOAST_MS = 2200;

/** One toast at a time; a new one replaces the old. */
let pushToast: ((t: string) => void) | undefined;
export const toast = (t: string) => pushToast?.(t);
export function Toaster() {
  const [text, setText] = useState('');
  const [show, setShow] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    pushToast = (t) => { setText(t); setShow(true); clearTimeout(timer); timer = setTimeout(() => setShow(false), TOAST_MS); };
    return () => { pushToast = undefined; clearTimeout(timer); };
  }, []);
  return <div class={`toast ${show ? 'show' : ''}`} role="status" aria-live="polite" data-testid="toast">{text}</div>;
}

/**
 * Full-size view of an image or a diagram. Takes focus when it opens, Escape or
 * a click closes it, and focus goes back to whatever opened it.
 */
export function Lightbox(props: { html?: string | undefined; src?: string | undefined; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    addEventListener('keydown', onKey);
    return () => { removeEventListener('keydown', onKey); opener?.focus(); };
  }, []);
  return (
    <div class="lightbox" role="dialog" aria-modal="true" aria-label="Enlarged view" tabIndex={-1} ref={box} onClick={props.onClose}>
      {props.src ? <img src={props.src} alt="Enlarged image" /> : <div class="diagram" tabIndex={0} aria-label="Diagram" role="region" dangerouslySetInnerHTML={{ __html: props.html ?? '' }} />}
      <button type="button" class="lightbox-close" onClick={props.onClose}>Close</button>
    </div>
  );
}

export const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
