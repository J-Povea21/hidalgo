/**
 * Wires every slice to the state and the server. The only module that knows
 * them all; each feature stays ignorant of the others.
 */
import { useCallback, useEffect, useReducer, useState } from 'preact/hooks';
import type { PageEvent } from '../../shared/contract.ts';
import { runThreadId, tabTitle, threadMessages, turnView } from '../core/selectors.ts';
import { initialState, reduce } from '../core/state.ts';
import { AskAbout } from '../features/ask-about/AskAbout.tsx';
import { ConnectionBanner } from '../features/connection/Banner.tsx';
import { OpenReviews } from '../features/open-reviews/OpenReviews.tsx';
import { Progress } from '../features/progress/Progress.tsx';
import { Questions } from '../features/questions/Questions.tsx';
import { useTab } from '../features/tab/useTab.ts';
import { Thread } from '../features/thread/Thread.tsx';
import { ApiError, type Api, type Session } from '../infra/api.ts';
import { ChatIcon, LayersIcon, Lightbox, Toaster, toast } from '../ui/parts.tsx';
import { useItemPosition, useNow, useUnread } from './hooks.ts';
import { ItemNav, ItemPanel } from './ItemPanel.tsx';

/** How often the page re-checks time-based state ("Claude went quiet"). */
const TICK_MS = 10_000;

export function App(props: { api: Api; session: Session }) {
  const { api, session } = props;
  const [state, dispatch] = useReducer(reduce, initialState);
  const [cur, setCur] = useItemPosition(session.runId);
  const [slide, setSlide] = useState('');
  const [drawer, setDrawer] = useState<'run' | 'reviews' | undefined>();
  const [typingIn, setTypingIn] = useState<string | undefined>();
  const [zoom, setZoom] = useState<{ html?: string | undefined; src?: string | undefined }>();
  const [quote, setQuote] = useState<{ text: string; nonce: number }>();
  const now = useNow(TICK_MS);

  useEffect(() => api.follow({
    state: (run, presence) => dispatch({ type: 'state', run, presence }),
    presence: (presence) => dispatch({ type: 'presence', presence }),
    connection: (connection) => dispatch({ type: 'connection', connection }),
    nudge: (text) => toast(text),
  }), []);

  const run = state.run;
  useEffect(() => { if (state.claudeListening) setTypingIn(undefined); }, [state.claudeListening]);
  // For tests and styling: the connection state apart from its wording.
  useEffect(() => { document.documentElement.dataset['connection'] = state.connection.kind; }, [state.connection.kind]);

  const turn = turnView(state, now);
  useTab(tabTitle(state, now), turn);

  const runThread = run ? runThreadId(run) : undefined;
  const claudeMessages = run && runThread ? threadMessages(run, runThread).filter((m) => m.from === 'claude').length : 0;
  const unread = useUnread(claudeMessages, drawer === 'run');

  const reportDiagram = useCallback((diagramId: string, error: string) => {
    void api.sendEvent({ type: 'diagram-failed', diagramId, error }).catch(() => undefined);
  }, []);
  const zoomIn = useCallback((html?: string, src?: string) => setZoom({ html, src }), []);

  if (!run) {
    return (
      <>
        <ConnectionBanner connection={state.connection} listening={false} idle={false} />
        {state.connection.kind === 'connecting' && <div class="empty">Connecting to Claude's session…</div>}
      </>
    );
  }

  async function send(event: PageEvent, from: string | undefined, ok: string): Promise<boolean> {
    try {
      const r = await api.sendEvent(event);
      if (from) setTypingIn(from);
      toast(r.imageWarning ?? ok);
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Not sent: Claude\'s session is unreachable. Your text is kept.');
      return false;
    }
  }

  const index = Math.min(cur, Math.max(0, run.items.length - 1));
  const item = run.items[index];
  const go = (i: number) => {
    if (i < 0 || i >= run.items.length || i === index) return;
    setSlide(i > index ? 'in-right' : 'in-left');
    setCur(i);
    scrollTo({ top: 0, behavior: 'smooth' });
  };

  const busy = state.connection.kind !== 'live' || run.status !== 'open';
  const typingLabel = run.statusLine ? `Claude: ${run.statusLine}` : 'Claude is thinking…';
  // "Thinking" only while a live session is actually working on what was sent from this thread.
  const showTyping = (key: string) => (turn === 'working' && typingIn === key && state.connection.kind === 'live' ? typingLabel : undefined);
  const threadProps = { runId: run.id, diagrams: run.diagrams, disabled: busy, imageSrc: api.imageBlob, onDiagramFailed: reportDiagram, onZoom: zoomIn };
  const toggle = (d: 'run' | 'reviews') => setDrawer(drawer === d ? undefined : d);

  return (
    <>
      <Progress run={run} turn={turn} current={index} onGo={go} actions={
        <>
          <button class={`iconbtn ${drawer === 'reviews' ? 'on' : ''}`} aria-expanded={drawer === 'reviews'} onClick={() => toggle('reviews')}>
            <LayersIcon /><span>Open reviews</span>
          </button>
          <button class={`iconbtn ${drawer === 'run' ? 'on' : ''}`} aria-expanded={drawer === 'run'} onClick={() => toggle('run')}>
            <ChatIcon /><span>Run</span>
            {unread && <span class="unread" role="img" aria-label="new messages" />}
          </button>
        </>
      } />
      <ConnectionBanner connection={state.connection} listening={state.claudeListening} idle={turn === 'idle'} runStatus={run.status} />
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
                messages={threadMessages(run, item.threadId)} typing={showTyping(item.threadId)} quote={quote}
                onSend={(text, images) => send({ type: 'message', threadId: item.threadId, text, images }, item.threadId, 'Sent to Claude')} />
            </div>
            <div class="col sticky">
              <ItemPanel item={item} busy={busy} working={!!showTyping(item.threadId)}
                onEdit={(path, text) => void send({ type: 'edit', itemId: item.id, path, text }, item.threadId, 'Edit sent: Claude will re-check it')}
                onVerdict={(value, rev) => void send({ type: 'verdict', itemId: item.id, rev, value }, item.threadId,
                  value === 'approved' ? `Approved rev ${rev}` : value === 'rejected' ? 'Rejected' : 'Left pending')} />
            </div>
          </div>
        )}
      </main>
      <ItemNav items={run.items} index={index} onGo={go} />
      <AskAbout within=".preview" onQuote={(text) => { setQuote({ text, nonce: Date.now() }); toast('Quoted into this item\'s conversation'); }} />
      {zoom && <Lightbox html={zoom.html} src={zoom.src} onClose={() => setZoom(undefined)} />}
      <Toaster />
    </>
  );
}
