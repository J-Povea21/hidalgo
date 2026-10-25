/**
 * An item's questions as a carousel. Picking an answer (a click, or Enter or Space
 * on an option) moves to the next one; arrow keys only move between options, so a
 * keyboard user can reach every option. Answers are kept as drafts until sent, so
 * nothing is lost on a reload.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Item, Question } from '@shared/contract.ts';
import { openQuestions } from '@client/common/domain/selectors.ts';
import { BrowserDraftStore } from '@client/common/infrastructure/drafts.ts';
import { CLASS, classes, slideToward } from '@client/common/interface/ui/classes.ts';
import { toInlineHtml } from '@client/common/interface/ui/markdown.tsx';

/** What the user picked (and noted) per question, not sent yet. */
type Draft = Record<string, { choice?: number; note?: string }>;
type Answers = Record<string, { choice: number; note?: string }>;

interface QuestionsProps {
  runId: string;
  item: Item;
  disabled: boolean;
  onSend: (answers: Answers) => Promise<boolean>;
}

/** Long enough to see the pick land before the next question slides in. */
const ADVANCE_MS = 260;
const FIRST_QUESTION = 0;

export function Questions(props: QuestionsProps) {
  const { item } = props;
  const open = openQuestions(item);
  const drafts = useMemo(() => new BrowserDraftStore(props.runId), [props.runId]);
  const draftKey = `answers:${item.id}`;
  const [draft, setDraft] = useState<Draft>(() => drafts.load(draftKey, {}));
  const [shownIndex, setShownIndex] = useState(FIRST_QUESTION);
  const [slide, setSlide] = useState('');
  const card = useRef<HTMLDivElement>(null);
  /** Set when a pick moved on, so focus follows to the next question instead of dropping to the page. */
  const focusNext = useRef(false);
  const advance = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(advance.current), []);
  useEffect(() => drafts.save(draftKey, draft), [draft]);
  useEffect(() => {
    if (!focusNext.current) {
      return;
    }
    focusNext.current = false;
    card.current?.querySelector<HTMLInputElement>('input[type=radio]:checked, input[type=radio]')?.focus();
  }, [shownIndex]);

  if (open.length === 0) {
    return item.questions.length > 0 ? <AllAnswered questions={item.questions} /> : null;
  }

  const current = Math.min(shownIndex, open.length - 1);
  const question = open[current]!;
  const answer = draft[question.id] ?? {};
  const isLast = current === open.length - 1;
  const picked = open.filter((openQuestion) => draft[openQuestion.id]?.choice !== undefined);

  const go = (target: number) => {
    setSlide(slideToward(target, current));
    setShownIndex(target);
  };
  const choose = (choice: number) => setDraft({ ...draft, [question.id]: { ...answer, choice } });
  const commit = (choice: number) => {
    choose(choice);
    clearTimeout(advance.current);
    if (!isLast) {
      advance.current = setTimeout(() => {
        focusNext.current = true;
        go(current + 1);
      }, ADVANCE_MS);
    }
  };
  const send = async () => {
    const delivered = await props.onSend(answersFrom(draft, picked));
    if (delivered) {
      setDraft({});
    }
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
                onClick={(event) => {
                  // A pointer click has a click count; the click a browser fires for an arrow key has none.
                  const isPointerClick = event.detail > 0;
                  if (isPointerClick) {
                    commit(index);
                  }
                }}
                onKeyDown={(event) => {
                  const commitsChoice = event.key === 'Enter' || event.key === ' ';
                  if (commitsChoice) {
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
          onInput={(event) => setDraft({ ...draft, [question.id]: { ...answer, note: event.currentTarget.value } })}
        />
      </div>
      <div class="qnav">
        <button class="ghost" disabled={current === FIRST_QUESTION} onClick={() => go(current - 1)}>
          Back
        </button>
        <div class="dots" role="group" aria-label="Go to question">
          {open.map((dotQuestion, index) => {
            const isPicked = draft[dotQuestion.id]?.choice !== undefined;
            return (
              <button
                key={dotQuestion.id}
                aria-current={index === current ? 'step' : undefined}
                aria-label={`Question ${index + 1}${isPicked ? ', answered' : ''}`}
                class={classes('dot', isPicked && CLASS.answered, index === current && CLASS.on)}
                onClick={() => go(index)}
              />
            );
          })}
        </div>
        {isLast ? (
          <button class="primary" disabled={props.disabled || picked.length === 0} onClick={send}>
            Send {picked.length || ''} answer{picked.length === 1 ? '' : 's'}
          </button>
        ) : (
          <button class="ghost" onClick={() => go(current + 1)}>
            Next
          </button>
        )}
      </div>
      <Rulings questions={item.questions} />
    </section>
  );
}

function AllAnswered(props: { questions: Question[] }) {
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
      <Rulings questions={props.questions} />
    </section>
  );
}

/** What the user already decided on this item, one line per answered question. */
function Rulings(props: { questions: Question[] }) {
  const answered = props.questions.filter((question) => question.answer);
  if (answered.length === 0) {
    return null;
  }
  return (
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
}

/** The picks of the given questions, with their notes when there are any. */
function answersFrom(draft: Draft, questions: Question[]): Answers {
  const answers: Answers = {};
  for (const question of questions) {
    const pick = draft[question.id]!;
    answers[question.id] = { choice: pick.choice!, ...(pick.note ? { note: pick.note } : {}) };
  }
  return answers;
}

function inline(markdown: string) {
  return { __html: toInlineHtml(markdown) };
}
