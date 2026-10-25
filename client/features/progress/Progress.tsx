/** The header: what this run is, whose turn it is, what Claude is doing, and where each item stands. */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { RunState } from '@shared/contract.ts';
import { itemStatus, itemTitle, type ItemStatus, TURN_VIEW, type TurnView } from '@client/domain/selectors.ts';
import { RUN_STATUS } from '@shared/values.ts';
import { CLASS, classes } from '@client/ui/classes.ts';

const FILL: Record<ItemStatus, [string, string]> = {
  questions: ['35%', 'var(--warn)'],
  ready: ['75%', 'var(--accent)'],
  approved: ['90%', 'var(--ok)'],
  done: ['100%', 'var(--ok)'],
  rejected: ['100%', 'var(--bad)'],
  pending: ['100%', 'var(--faint)'],
};

interface ProgressProps {
  run: RunState;
  turn: TurnView;
  current: number;
  onGo: (i: number) => void;
  actions: ComponentChildren;
}

export function Progress(props: ProgressProps) {
  const { run, turn } = props;
  const approved = run.items.filter((item) => ['approved', 'done'].includes(itemStatus(item))).length;
  const header = useRef<HTMLElement>(null);
  // The header wraps on narrow screens and long subjects: publish its height so sticky panels sit below it.
  useEffect(() => {
    const el = header.current;
    if (!el) {
      return;
    }
    const publish = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    publish();
    const watch = new ResizeObserver(publish);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return (
    <header class="top" ref={header}>
      <div class="in">
        <div class="row">
          <h1>{run.subject}</h1>
          <span class="meta">
            {run.project} · {run.skill}
          </span>
          <span class="spacer" />
          <TurnLine turn={turn} line={run.statusLine} status={run.status} />
          {run.items.length > 0 && (
            <span class="meta">
              Item {props.current + 1} of {run.items.length} · {approved} approved
            </span>
          )}
          {props.actions}
        </div>
        {run.items.length > 1 && (
          <nav class="progress" aria-label="Items in this run">
            {run.items.map((item, index) => {
              const [fill, color] = FILL[itemStatus(item)];
              return (
                <button
                  key={item.id}
                  class={classes('seg', index === props.current && CLASS.current)}
                  style={`--fill: ${fill}; --c: ${color}`}
                  title={itemTitle(item)}
                  aria-label={`${itemTitle(item)}: ${itemStatus(item)}`}
                  aria-current={index === props.current}
                  onClick={() => props.onGo(index)}
                />
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}

interface TurnLineProps {
  turn: TurnView;
  line?: string | undefined;
  status: RunState['status'];
}

/** `data-turn` lets tests assert the state apart from its wording. */
function TurnLine(props: TurnLineProps) {
  let text: string;
  switch (props.turn) {
    case TURN_VIEW.yours:
      text = 'Your turn';
      break;
    case TURN_VIEW.working:
      text = props.line ?? 'Claude is working';
      break;
    case TURN_VIEW.idle:
      text = "Claude isn't listening";
      break;
    case TURN_VIEW.done:
      text = props.status === RUN_STATUS.paused ? 'Paused · resumable' : 'Run ended';
      break;
    case TURN_VIEW.offline:
      text = 'Not connected';
      break;
  }
  // Only the two live turns are coloured and pulse; the class names match the turn.
  const isLive = props.turn === TURN_VIEW.yours || props.turn === TURN_VIEW.working;
  return (
    <span class={classes('status', isLive && props.turn)} role="status" aria-label="Turn" data-turn={props.turn}>
      {isLive && <span class="dotpulse" />}
      {text}
    </span>
  );
}
