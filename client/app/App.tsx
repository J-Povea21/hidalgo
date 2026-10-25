/**
 * Wires every slice to the state and the server. The only module that knows
 * them all; each feature stays ignorant of the others.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import type { PageEvent, VerdictValue } from '../../shared/contract.ts';
import { itemStatus, itemTitle, runThreadId, tabTitle, threadMessages, turn } from '../core/selectors.ts';
import { initialState, reduce } from '../core/state.ts';
import { ConnectionBanner } from '../features/connection/Banner.tsx';
import { OpenReviews } from '../features/open-reviews/OpenReviews.tsx';
import { Progress } from '../features/progress/Progress.tsx';
import { Questions } from '../features/questions/Questions.tsx';
import { useTab } from '../features/tab/useTab.ts';
import { Thread } from '../features/thread/Thread.tsx';
import { Verdict } from '../features/verdict/Verdict.tsx';
import { ApiError, type Api, type Session } from '../infra/api.ts';
import { KIND_VIEWS } from '../kinds/index.ts';
import { ChatIcon, LayersIcon, Lightbox, StatusBadge, Toaster, toast } from '../ui/parts.tsx';

const IDLE_MS = 90_000;

export function App(props: { api: Api; session: Session }) {
  const { api, session } = props;
  const [state, dispatch] = useReducer(reduce, initialState);
  const [cur, setCur] = useState(() => Number(sessionStorage.getItem(`wb:${session.runId}:cur`) ?? 0) || 0);
  const [slide, setSlide] = useState('');
  const [drawer, setDrawer] = useState<'run' | 'reviews' | undefined>();
  const [typingIn, setTypingIn] = useState<string | undefined>();
  const [zoom, setZoom] = useState<{ html?: string | undefined; src?: string | undefined }>();
  const [quote, setQuote] = useState<{ text: string; nonce: number }>();
  const [ask, setAsk] = useState<{ x: number; y: number; text: string }>();
  const [lastChange, setLastChange] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const seenRun = useRef(0);

  useEffect(() => api.follow({
    state: (run, waiting) => dispatch({ type: 'state', run, waiting }),
    waiting: (waiting) => dispatch({ type: 'waiting', waiting }),
    connection: (connection) => dispatch({ type: 'connection', connection }),
    nudge: (text) => toast(text),
  }), []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 10_000); return () => clearInterval(t); }, []);

  const run = state.run;
  useEffect(() => { if (run) setLastChange(Date.now()); }, [run?.version]);
  useEffect(() => { if (state.waiting) setTypingIn(undefined); }, [state.waiting]);
  useEffect(() => { sessionStorage.setItem(`wb:${session.runId}:cur`, String(cur)); }, [cur]);

  const t = turn(state);
  useTab(tabTitle(state), t);

  const runThread = run ? runThreadId(run) : undefined;
  const unreadRun = run && runThread ? threadMessages(run, runThread).filter((m) => m.from === 'claude').length : 0;
  useEffect(() => { if (drawer === 'run') seenRun.current = unreadRun; }, [drawer, unreadRun]);

  async function send(event: PageEvent, from: string | undefined, ok: string): Promise<boolean> {
    dispatch({ type: 'sent' });
    try {
      const r = await api.sendEvent(event);
      if (from) setTypingIn(from);
      toast(r.imageWarning ?? ok);
      return true;
    } catch (e) {
      dispatch({ type: 'send-failed' });
      toast(e instanceof ApiError ? e.message : 'Not sent: Claude\'s session is unreachable. Your text is kept.');
      return false;
    }
  }

  // "Ask about this": select text on the item, quote it into the item's thread.
  useEffect(() => {
    const onUp = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.askbtn')) return;
      const sel = getSelection();
      const text = sel?.toString().trim();
      const inPreview = sel?.anchorNode?.parentElement?.closest('.preview');
      if (!text || !inPreview || !sel?.rangeCount) return setAsk(undefined);
      const r = sel.getRangeAt(0).getBoundingClientRect();
      setAsk({ x: r.left + scrollX + r.width / 2 - 55, y: r.top + scrollY - 40, text });
    };
    addEventListener('mouseup', onUp);
    return () => removeEventListener('mouseup', onUp);
  }, []);

  const go = (i: number) => {
    if (!run || i < 0 || i >= run.items.length || i === cur) return;
    setSlide(i > cur ? 'in-right' : 'in-left');
    setCur(i);
    scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reportDiagram = useMemo(() => (diagramId: string, error: string) => {
    void api.sendEvent({ type: 'diagram-failed', diagramId, error }).catch(() => undefined);
  }, []);

  if (!run) {
    return (
      <>
        <ConnectionBanner connection={state.connection} listening={false} idle={false} />
        <div class="empty">Connecting to Claude's session…</div>
      </>
    );
  }

  const index = Math.min(cur, Math.max(0, run.items.length - 1));
  const item = run.items[index];
  const busy = state.connection.kind !== 'live' || run.status !== 'open';
  const idle = !state.waiting && now - lastChange > IDLE_MS && run.status === 'open';
  const typingLabel = run.statusLine ? `Claude: ${run.statusLine}` : 'Claude is thinking…';
  // "Thinking" only while a live session is actually working on what was sent from this thread.
  const showTyping = (key: string) =>
    (!state.waiting && typingIn === key && run.status === 'open' && state.connection.kind === 'live' ? typingLabel : undefined);

  const threadProps = {
    runId: run.id, diagrams: run.diagrams, disabled: busy,
    imageSrc: api.imageBlob, onDiagramFailed: reportDiagram,
    onZoom: (html?: string, src?: string) => setZoom({ html, src }),
  };

  const View = item ? KIND_VIEWS[item.kind] : undefined;
  const status = item ? itemStatus(item) : undefined;

  return (
    <>
      <Progress run={run} turn={t} current={index} onGo={go} actions={
        <>
          <button class={`iconbtn ${drawer === 'reviews' ? 'on' : ''}`} aria-expanded={drawer === 'reviews'} onClick={() => setDrawer(drawer === 'reviews' ? undefined : 'reviews')}>
            <LayersIcon /><span>Open reviews</span>
          </button>
          <button class={`iconbtn ${drawer === 'run' ? 'on' : ''}`} aria-expanded={drawer === 'run'} onClick={() => setDrawer(drawer === 'run' ? undefined : 'run')}>
            <ChatIcon /><span>Run</span>
            {drawer !== 'run' && unreadRun > seenRun.current && <span class="unread" aria-label="new messages" />}
          </button>
        </>
      } />
      <ConnectionBanner connection={state.connection} listening={state.waiting} idle={idle} runStatus={run.status} />
      <div class="wrap">
        <div class={`drawer ${drawer ? 'open' : ''}`}>
          <div>
            {drawer === 'run' && runThread && (
              <Thread {...threadProps} threadId={runThread} title="Whole run" hint="About anything that spans the items."
                messages={threadMessages(run, runThread)} typing={showTyping(runThread)}
                onSend={(text, images) => send({ type: 'message', threadId: runThread, text, images }, runThread, 'Sent to Claude')} />
            )}
            {drawer === 'reviews' && <OpenReviews currentRunId={run.id} load={api.liveRuns} />}
          </div>
        </div>
      </div>
      <main class="stage">
        {!item ? (
          <div class="empty">{run.status === 'open' ? 'Claude is preparing the first item…' : run.closedOutcome ?? 'This run has ended.'}</div>
        ) : (
          <div class={`slide ${slide}`} key={item.id} onAnimationEnd={() => setSlide('')}>
            <div class="col">
              <Questions runId={run.id} item={item} disabled={busy}
                onSend={(answers) => send({ type: 'answers', itemId: item.id, answers }, item.threadId, 'Answers sent to Claude')} />
              <Thread {...threadProps} threadId={item.threadId} title="Conversation about this item" hint="About this item only."
                messages={threadMessages(run, item.threadId)} typing={showTyping(item.threadId)}
                quote={quote}
                onSend={(text, images) => send({ type: 'message', threadId: item.threadId, text, images }, item.threadId, 'Sent to Claude')} />
            </div>
            <div class="col sticky">
              <article class={`panel preview ${status === 'questions' ? 'pending' : ''} ${showTyping(item.threadId) ? 'working' : ''}`}>
                <div class="cardtitle">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
                    <h2>{itemTitle(item)}</h2>
                    <StatusBadge status={status!} />
                  </div>
                  <div class="chips">{((item.fields['tags'] as string[] | undefined) ?? []).map((tag) => <span class="chip" key={tag}>{tag}</span>)}</div>
                </div>
                {View && <View item={item} editable={!busy && (status === 'ready' || status === 'questions')}
                  onEdit={(path, text) => void send({ type: 'edit', itemId: item.id, path, text }, item.threadId, 'Edit sent: Claude will re-check it')} />}
                <Verdict item={item} disabled={busy}
                  onVerdict={(value: VerdictValue, rev) => void send({ type: 'verdict', itemId: item.id, rev, value }, item.threadId,
                    value === 'approved' ? `Approved rev ${rev}` : value === 'rejected' ? 'Rejected' : 'Left pending')} />
              </article>
            </div>
          </div>
        )}
      </main>
      {run.items.length > 1 && (
        <nav class="bar" aria-label="Items">
          <div class="in">
            <button disabled={index === 0} onClick={() => go(index - 1)}>← Previous</button>
            <span class="meta">{itemTitle(run.items[index]!)}</span>
            <button class="primary" disabled={index === run.items.length - 1} onClick={() => go(index + 1)}>Next →</button>
          </div>
        </nav>
      )}
      {ask && (
        <button class="askbtn" style={{ left: `${ask.x}px`, top: `${ask.y}px` }} onClick={() => {
          setQuote({ text: ask.text, nonce: Date.now() });
          setAsk(undefined);
          getSelection()?.removeAllRanges();
          toast('Quoted into this item\'s conversation');
        }}>Ask about this</button>
      )}
      {zoom && <Lightbox html={zoom.html} src={zoom.src} onClose={() => setZoom(undefined)} />}
      <Toaster />
    </>
  );
}
