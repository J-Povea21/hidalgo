/**
 * Wires every module's views to the state and the use cases. The only part of
 * the page that knows them all; each module stays ignorant of the others.
 */
import { useCallback, useEffect, useReducer, useState } from 'preact/hooks';
import { PARTY, RUN_STATUS, VERDICT, type VerdictValue } from '@shared/values.ts';
import {
  runThreadId,
  tabTitle,
  threadMessages,
  TURN_VIEW,
  turnView,
  typingIn,
} from '@client/common/domain/selectors.ts';
import { CONNECTION, initialState, reduce } from '@client/common/domain/state.ts';
import { AskAbout } from '@client/conversation/interface/AskAbout.tsx';
import { ConnectionBanner } from '@client/run/interface/Banner.tsx';
import { OpenReviews } from '@client/run/interface/OpenReviews.tsx';
import { Progress } from '@client/run/interface/Progress.tsx';
import { Questions } from '@client/items/interface/Questions.tsx';
import { useTab } from '@client/run/interface/useTab.ts';
import { Thread } from '@client/conversation/interface/Thread.tsx';
import type { Session } from '@client/common/infrastructure/session.ts';
import { CLASS, classes } from '@client/common/interface/ui/classes.ts';
import { ChatIcon, LayersIcon, Lightbox, Toaster, toast } from '@client/common/interface/ui/parts.tsx';
import { useItemNavigation, useNow, useSend, useUnread } from './hooks.ts';
import type { PageModules } from './modules.ts';
import type { DraftStore } from '@client/common/ports/draft-store.port.ts';
import { ItemNav, ItemPanel } from '@client/items/interface/ItemPanel.tsx';

/** How often the page re-checks time-based state ("Claude went quiet"). */
const TICK_MS = 10_000;

/** The side panel: the whole run's conversation, or the other reviews open on this machine. */
const DRAWER = { run: 'run', reviews: 'reviews' } as const;
type Drawer = (typeof DRAWER)[keyof typeof DRAWER];

/** What the toast says once something reached Claude. */
const SENT = {
  message: 'Sent to Claude',
  answers: 'Answers sent to Claude',
  edit: 'Edit sent: Claude will re-check it',
  quoted: "Quoted into this item's conversation",
  verdict: (value: VerdictValue, rev: number) =>
    ({ [VERDICT.approved]: `Approved rev ${rev}`, [VERDICT.rejected]: 'Rejected', [VERDICT.pending]: 'Left pending' })[
      value
    ],
};

interface AppProps {
  modules: PageModules;
  /** Where what the user hasn't sent yet is kept. */
  drafts: DraftStore;
  session: Session;
}

export function App({ modules, drafts, session }: AppProps) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [drawer, setDrawer] = useState<Drawer | undefined>();
  /** The thread something was last sent from: it shows Claude working until Claude listens again. */
  const [sentFrom, setSentFrom] = useState<string | undefined>();
  const [zoom, setZoom] = useState<{ html?: string | undefined; src?: string | undefined }>();
  const [quote, setQuote] = useState<{ text: string; nonce: number }>();
  const now = useNow(TICK_MS);
  const { run } = state;
  const { itemIndex, goTo, slide, slideDone } = useItemNavigation(session.runId, run?.items.length ?? 0);
  const send = useSend(modules.sendPageEvent, setSentFrom);

  useEffect(() => modules.followSession.execute({ dispatch, nudge: (text) => toast(text) }), []);
  useEffect(() => {
    if (state.claudeListening) {
      setSentFrom(undefined);
    }
  }, [state.claudeListening]);
  // For tests and styling: the connection state apart from its wording.
  useEffect(() => {
    document.documentElement.dataset['connection'] = state.connection.kind;
  }, [state.connection.kind]);

  const turn = turnView(state, now);
  useTab(tabTitle(state, now), turn);

  const runThread = run ? runThreadId(run) : undefined;
  const fromClaude =
    run && runThread ? threadMessages(run, runThread).filter((message) => message.from === PARTY.claude) : [];
  const unread = useUnread(fromClaude.length, drawer === DRAWER.run);

  const reportDiagram = useCallback((diagramId: string, error: string) => {
    // Claude hears about it if it can; the user needn't, the diagram already shows its own failure.
    void modules.sendPageEvent.execute({ event: { type: 'diagram-failed', diagramId, error } });
  }, []);
  const zoomIn = useCallback((html?: string, src?: string) => setZoom({ html, src }), []);
  // Handed to children as callbacks, so they're bound to the use cases here.
  const loadImage = useCallback((name: string) => modules.conversation.loadImage.execute({ name }), []);
  const loadOpenReviews = useCallback(() => modules.run.listOpenReviews.execute(), []);
  const shrinkImages = useCallback((files: File[]) => modules.conversation.shrinkImages.execute({ files }), []);

  if (!run) {
    return (
      <>
        <ConnectionBanner connection={state.connection} listening={false} idle={false} />
        {state.connection.kind === CONNECTION.connecting && <div class="empty">Connecting to Claude's session…</div>}
      </>
    );
  }

  const item = run.items[itemIndex];
  const busy = state.connection.kind !== CONNECTION.live || run.status !== RUN_STATUS.open;
  const typing = (threadId: string) => typingIn(state, now, sentFrom, threadId);
  const threadProps = {
    runId: run.id,
    drafts,
    shrinkImages,
    diagrams: run.diagrams,
    disabled: busy,
    imageSrc: loadImage,
    onDiagramFailed: reportDiagram,
    onZoom: zoomIn,
  };
  const toggle = (which: Drawer) => setDrawer(drawer === which ? undefined : which);
  const drawerButton = (which: Drawer) => ({
    class: classes('iconbtn', drawer === which && CLASS.on),
    'aria-expanded': drawer === which,
    onClick: () => toggle(which),
  });

  return (
    <>
      <Progress
        run={run}
        turn={turn}
        current={itemIndex}
        onGo={goTo}
        actions={
          <>
            <button {...drawerButton(DRAWER.reviews)}>
              <LayersIcon />
              <span>Open reviews</span>
            </button>
            <button {...drawerButton(DRAWER.run)}>
              <ChatIcon />
              <span>Run</span>
              {unread && <span class="unread" role="img" aria-label="new messages" />}
            </button>
          </>
        }
      />
      <ConnectionBanner
        connection={state.connection}
        listening={state.claudeListening}
        idle={turn === TURN_VIEW.idle}
        runStatus={run.status}
      />
      <div class="wrap">
        <div class={classes('drawer', drawer && CLASS.open)}>
          <div>
            {drawer === DRAWER.run && runThread && (
              <Thread
                {...threadProps}
                threadId={runThread}
                title="Whole run"
                hint="About anything that spans the items."
                messages={threadMessages(run, runThread)}
                typing={typing(runThread)}
                onSend={(text, images) =>
                  send({ type: 'message', threadId: runThread, text, images }, runThread, SENT.message)
                }
              />
            )}
            {drawer === DRAWER.reviews && <OpenReviews currentRunId={run.id} load={loadOpenReviews} />}
          </div>
        </div>
      </div>
      <main class="stage">
        {!item ? (
          <div class="empty">
            {run.status === RUN_STATUS.open
              ? 'Claude is preparing the first item…'
              : (run.closedOutcome ?? 'This run has ended.')}
          </div>
        ) : (
          <div class={classes('slide', slide)} key={item.id} onAnimationEnd={slideDone}>
            <div class="col">
              <Questions
                runId={run.id}
                drafts={drafts}
                item={item}
                disabled={busy}
                onSend={(answers) => send({ type: 'answers', itemId: item.id, answers }, item.threadId, SENT.answers)}
              />
              <Thread
                {...threadProps}
                threadId={item.threadId}
                title="Conversation about this item"
                hint="About this item only."
                messages={threadMessages(run, item.threadId)}
                typing={typing(item.threadId)}
                quote={quote}
                onSend={(text, images) =>
                  send({ type: 'message', threadId: item.threadId, text, images }, item.threadId, SENT.message)
                }
              />
            </div>
            <div class="col sticky">
              <ItemPanel
                item={item}
                busy={busy}
                working={!!typing(item.threadId)}
                onEdit={(path, text) =>
                  void send({ type: 'edit', itemId: item.id, path, text }, item.threadId, SENT.edit)
                }
                onVerdict={(value, rev) =>
                  void send({ type: 'verdict', itemId: item.id, rev, value }, item.threadId, SENT.verdict(value, rev))
                }
              />
            </div>
          </div>
        )}
      </main>
      <ItemNav items={run.items} itemIndex={itemIndex} onGo={goTo} />
      <AskAbout
        within=".preview"
        onQuote={(text) => {
          setQuote({ text, nonce: Date.now() });
          toast(SENT.quoted);
        }}
      />
      {zoom && <Lightbox html={zoom.html} src={zoom.src} onClose={() => setZoom(undefined)} />}
      <Toaster />
    </>
  );
}
