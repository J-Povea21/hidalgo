/**
 * An item's questions as a carousel. Picking an answer (a click, or Enter or Space
 * on an option) moves to the next one; arrow keys only move between options, so a
 * keyboard user can reach every option. Answers are kept as drafts until sent, so
 * nothing is lost on a reload.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item } from '@shared/contract.ts';
import { openQuestions } from '@client/core/selectors.ts';
import { loadDraft, saveDraft } from '@client/infra/drafts.ts';
import { toInlineHtml } from '@client/ui/markdown.tsx';

type Draft = Record<string, { choice?: number; note?: string }>;
const inline = (s: string) => ({ __html: toInlineHtml(s) });

/** Long enough to see the pick land before the next question slides in. */
const ADVANCE_MS = 260;

export function Questions(props: { runId: string; item: Item; disabled: boolean; onSend: (answers: Record<string, { choice: number; note?: string }>) => Promise<boolean> }) {
  const { item } = props;
  const open = openQuestions(item);
  const key = `answers:${item.id}`;
  const [draft, setDraft] = useState<Draft>(() => loadDraft(props.runId, key, {}));
  const [pos, setPos] = useState(0);
  const [dir, setDir] = useState('');
  const card = useRef<HTMLDivElement>(null);
  /** Set when a pick moved on, so focus follows to the next question instead of dropping to the page. */
  const focusNext = useRef(false);
  const advance = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(advance.current), []);
  useEffect(() => saveDraft(props.runId, key, draft), [draft]);
  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    card.current?.querySelector<HTMLInputElement>('input[type=radio]:checked, input[type=radio]')?.focus();
  }, [pos]);

  const answered = item.questions.filter((q) => q.answer);
  const rulings = answered.length > 0 && (
    <div class="section">
      {answered.map((q) => (
        <div class="ruling" key={q.id}>
          ✓ <span dangerouslySetInnerHTML={inline(q.text)} /> <b>{q.options[q.answer!.choice]?.label}</b>
          {q.answer!.note ? ` · “${q.answer!.note}”` : ''}
        </div>
      ))}
    </div>
  );

  if (!open.length) {
    if (!item.questions.length) return null;
    return (
      <section class="panel" aria-label="Questions">
        <div class="phead"><h2>Questions</h2><span class="badge ready">All answered</span></div>
        <div class="section"><div class="allset"><span class="check" aria-hidden="true">✓</span>Nothing left to decide on this item</div></div>
        {rulings}
      </section>
    );
  }

  const i = Math.min(pos, open.length - 1);
  const q = open[i]!;
  const a = draft[q.id] ?? {};
  const ready = Object.entries(draft).filter(([id, d]) => d.choice !== undefined && open.some((o) => o.id === id));
  const go = (to: number) => { setDir(to > i ? 'in-right' : 'in-left'); setPos(to); };
  const choose = (choice: number) => setDraft({ ...draft, [q.id]: { ...a, choice } });
  const commit = (choice: number) => {
    choose(choice);
    clearTimeout(advance.current);
    if (i < open.length - 1) advance.current = setTimeout(() => { focusNext.current = true; go(i + 1); }, ADVANCE_MS);
  };
  const send = async () => {
    const answers = Object.fromEntries(ready.map(([id, d]) => [id, { choice: d.choice!, ...(d.note ? { note: d.note } : {}) }]));
    if (await props.onSend(answers)) setDraft({});
  };

  return (
    <section class="panel" aria-label="Questions">
      <div class="phead"><h2>Question {i + 1} of {open.length}</h2><span class="badge questions">{open.length} open</span></div>
      <div class={`qcard ${dir}`} key={q.id} ref={card}>
        <p class="qtext" dangerouslySetInnerHTML={inline(q.text)} />
        {q.context && <div class="qctx" dangerouslySetInnerHTML={inline(q.context)} />}
        {q.evidence.map((e, k) => (
          <div class="ev" key={k}><span class={`tag ${e.kind}`}>{e.kind}</span><span dangerouslySetInnerHTML={inline(e.text)} /></div>
        ))}
        <fieldset class="options">
          <legend class="sr">Options</legend>
          {q.options.map((o, k) => (
            <label class="opt" key={k}>
              <input type="radio" name={q.id} checked={a.choice === k} disabled={props.disabled}
                onChange={() => choose(k)}
                // A pointer click has a click count; the click a browser fires for an arrow key has none.
                onClick={(e) => e.detail > 0 && commit(k)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(k); } }} />
              <span dangerouslySetInnerHTML={inline(o.label)} />
              {k === q.recommended && <span class="rec">RECOMMENDED</span>}
              <span class="d" dangerouslySetInnerHTML={inline(o.detail)} />
            </label>
          ))}
        </fieldset>
        <textarea
          rows={2}
          aria-label="Note for Claude (optional)"
          placeholder="Note for Claude (optional)"
          value={a.note ?? ''}
          disabled={props.disabled}
          onInput={(e) => setDraft({ ...draft, [q.id]: { ...a, note: (e.target as HTMLTextAreaElement).value } })}
        />
      </div>
      <div class="qnav">
        <button class="ghost" disabled={i === 0} onClick={() => go(i - 1)}>Back</button>
        <div class="dots" role="group" aria-label="Go to question">
          {open.map((oq, k) => (
            <button key={oq.id} aria-current={k === i ? 'step' : undefined}
              aria-label={`Question ${k + 1}${draft[oq.id]?.choice !== undefined ? ', answered' : ''}`}
              class={`dot ${draft[oq.id]?.choice !== undefined ? 'answered' : ''} ${k === i ? 'on' : ''}`} onClick={() => go(k)} />
          ))}
        </div>
        {i < open.length - 1
          ? <button class="ghost" onClick={() => go(i + 1)}>Next</button>
          : <button class="primary" disabled={props.disabled || !ready.length} onClick={send}>Send {ready.length || ''} answer{ready.length === 1 ? '' : 's'}</button>}
      </div>
      {rulings}
    </section>
  );
}
