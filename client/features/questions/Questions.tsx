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
import { CLASS, classes, slideToward } from '@client/ui/classes.ts';

type Draft = Record<string, { choice?: number; note?: string }>;
const inline = (markdown: string) => ({ __html: toInlineHtml(markdown) });

/** Long enough to see the pick land before the next question slides in. */
const ADVANCE_MS = 260;

interface QuestionsProps {
  runId: string;
  item: Item;
  disabled: boolean;
  onSend: (answers: Record<string, { choice: number; note?: string }>) => Promise<boolean>;
}

export function Questions(props: QuestionsProps) {
  const { item } = props;
  const open = openQuestions(item);
  const key = `answers:${item.id}`;
  const [draft, setDraft] = useState<Draft>(() => loadDraft(props.runId, key, {}));
  const [pos, setPos] = useState(0);
  const [slide, setSlide] = useState('');
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

  const answered = item.questions.filter((question) => question.answer);
  const rulings = answered.length > 0 && (
    <div class="section">
      {answered.map((question) => (
        <div class="ruling" key={question.id}>
          ✓ <span dangerouslySetInnerHTML={inline(question.text)} />{' '}
          <b>{question.options[question.answer!.choice]?.label}</b>
          {question.answer!.note ? ` · “${question.answer!.note}”` : ''}
        </div>
      ))}
    </div>
  );

  if (!open.length) {
    if (!item.questions.length) return null;
    return (
      <section class="panel" aria-label="Questions">
        <div class="phead">
          <h2>Questions</h2>
          <span class="badge ready">All answered</span>
        </div>
        <div class="section">
          <div class="allset">
            <span class="check" aria-hidden="true">
              ✓
            </span>
            Nothing left to decide on this item
          </div>
        </div>
        {rulings}
      </section>
    );
  }

  const current = Math.min(pos, open.length - 1);
  const question = open[current]!;
  const answer = draft[question.id] ?? {};
  const ready = Object.entries(draft).filter(
    ([id, pick]) => pick.choice !== undefined && open.some((openQuestion) => openQuestion.id === id),
  );
  const go = (target: number) => {
    setSlide(slideToward(target, current));
    setPos(target);
  };
  const choose = (choice: number) => setDraft({ ...draft, [question.id]: { ...answer, choice } });
  const commit = (choice: number) => {
    choose(choice);
    clearTimeout(advance.current);
    if (current < open.length - 1)
      advance.current = setTimeout(() => {
        focusNext.current = true;
        go(current + 1);
      }, ADVANCE_MS);
  };
  const send = async () => {
    const answers = Object.fromEntries(
      ready.map(([id, pick]) => [id, { choice: pick.choice!, ...(pick.note ? { note: pick.note } : {}) }]),
    );
    if (await props.onSend(answers)) setDraft({});
  };

  return (
    <section class="panel" aria-label="Questions">
      <div class="phead">
        <h2>
          Question {current + 1} of {open.length}
        </h2>
        <span class="badge questions">{open.length} open</span>
      </div>
      <div class={classes('qcard', slide)} key={question.id} ref={card}>
        <p class="qtext" dangerouslySetInnerHTML={inline(question.text)} />
        {question.context && <div class="qctx" dangerouslySetInnerHTML={inline(question.context)} />}
        {question.evidence.map((evidence, index) => (
          <div class="ev" key={index}>
            <span class={classes('tag', evidence.kind)}>{evidence.kind}</span>
            <span dangerouslySetInnerHTML={inline(evidence.text)} />
          </div>
        ))}
        <fieldset class="options">
          <legend class="sr">Options</legend>
          {question.options.map((option, index) => (
            <label class="opt" key={index}>
              <input
                type="radio"
                name={question.id}
                checked={answer.choice === index}
                disabled={props.disabled}
                onChange={() => choose(index)}
                // A pointer click has a click count; the click a browser fires for an arrow key has none.
                onClick={(event) => event.detail > 0 && commit(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    commit(index);
                  }
                }}
              />
              <span dangerouslySetInnerHTML={inline(option.label)} />
              {index === question.recommended && <span class="rec">RECOMMENDED</span>}
              <span class="d" dangerouslySetInnerHTML={inline(option.detail)} />
            </label>
          ))}
        </fieldset>
        <textarea
          rows={2}
          aria-label="Note for Claude (optional)"
          placeholder="Note for Claude (optional)"
          value={answer.note ?? ''}
          disabled={props.disabled}
          onInput={(event) =>
            setDraft({ ...draft, [question.id]: { ...answer, note: (event.target as HTMLTextAreaElement).value } })
          }
        />
      </div>
      <div class="qnav">
        <button class="ghost" disabled={current === 0} onClick={() => go(current - 1)}>
          Back
        </button>
        <div class="dots" role="group" aria-label="Go to question">
          {open.map((oq, index) => (
            <button
              key={oq.id}
              aria-current={index === current ? 'step' : undefined}
              aria-label={`Question ${index + 1}${draft[oq.id]?.choice !== undefined ? ', answered' : ''}`}
              class={classes(
                'dot',
                draft[oq.id]?.choice !== undefined && CLASS.answered,
                index === current && CLASS.on,
              )}
              onClick={() => go(index)}
            />
          ))}
        </div>
        {current < open.length - 1 ? (
          <button class="ghost" onClick={() => go(current + 1)}>
            Next
          </button>
        ) : (
          <button class="primary" disabled={props.disabled || !ready.length} onClick={send}>
            Send {ready.length || ''} answer{ready.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
      {rulings}
    </section>
  );
}
