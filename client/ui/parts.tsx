/** Small shared pieces: icons, toast, lightbox, typing indicator, badges. */
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

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
      <div class="typing" role="status" aria-label={props.label}><span /><span /><span /></div>
      <div class="typing-label">{props.label}</div>
    </>
  );
}

const STATUS_TEXT: Record<string, string> = {
  questions: 'Questions open', ready: 'Ready', approved: 'Approved', done: 'Done', rejected: 'Rejected', pending: 'Left pending',
};
export const StatusBadge = (props: { status: string; children?: ComponentChildren }) => (
  <span class={`badge ${props.status}`}>{props.children ?? STATUS_TEXT[props.status] ?? props.status}</span>
);

/** One toast at a time; a new one replaces the old. */
let pushToast: ((t: string) => void) | undefined;
export const toast = (t: string) => pushToast?.(t);
export function Toaster() {
  const [text, setText] = useState('');
  const [show, setShow] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    pushToast = (t) => { setText(t); setShow(true); clearTimeout(timer); timer = setTimeout(() => setShow(false), 2200); };
    return () => { pushToast = undefined; clearTimeout(timer); };
  }, []);
  return <div class={`toast ${show ? 'show' : ''}`} role="status" aria-live="polite">{text}</div>;
}

/** Full-size view of an image or a diagram. Escape or click closes it. */
export function Lightbox(props: { html?: string | undefined; src?: string | undefined; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="lightbox" role="dialog" aria-modal="true" aria-label="Enlarged view" onClick={props.onClose}>
      {props.src ? <img src={props.src} alt="" /> : <div class="diagram" dangerouslySetInnerHTML={{ __html: props.html ?? '' }} />}
    </div>
  );
}

export const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
