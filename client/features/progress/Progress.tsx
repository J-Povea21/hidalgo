/** The header: what this run is, whose turn it is, what Claude is doing, and where each item stands. */
import type { ComponentChildren } from 'preact';
import type { RunState } from '../../../shared/contract.ts';
import { itemStatus, itemTitle, type ItemStatus, type TurnView } from '../../core/selectors.ts';

const FILL: Record<ItemStatus, [string, string]> = {
  questions: ['35%', 'var(--warn)'], ready: ['75%', 'var(--accent)'], approved: ['90%', 'var(--ok)'],
  done: ['100%', 'var(--ok)'], rejected: ['100%', 'var(--bad)'], pending: ['100%', 'var(--faint)'],
};

export function Progress(props: { run: RunState; turn: TurnView; current: number; onGo: (i: number) => void; actions: ComponentChildren }) {
  const { run, turn } = props;
  const approved = run.items.filter((i) => ['approved', 'done'].includes(itemStatus(i))).length;
  return (
    <header class="top">
      <div class="in">
        <div class="row">
          <h1>{run.subject}</h1>
          <span class="meta">{run.project} · {run.skill}</span>
          <span class="spacer" />
          <TurnLine turn={turn} line={run.statusLine} status={run.status} />
          {run.items.length > 0 && <span class="meta">Item {props.current + 1} of {run.items.length} · {approved} approved</span>}
          {props.actions}
        </div>
        {run.items.length > 1 && (
          <nav class="progress" aria-label="Items in this run">
            {run.items.map((item, i) => {
              const [fill, color] = FILL[itemStatus(item)];
              return (
                <button
                  key={item.id}
                  class={`seg ${i === props.current ? 'cur' : ''}`}
                  style={{ '--fill': fill, '--c': color } as never}
                  title={itemTitle(item)}
                  aria-label={`${itemTitle(item)}: ${itemStatus(item)}`}
                  aria-current={i === props.current}
                  onClick={() => props.onGo(i)}
                />
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}

/** `data-turn` lets tests assert the state apart from its wording. */
function TurnLine(props: { turn: TurnView; line?: string | undefined; status: RunState['status'] }) {
  const [cls, pulse, text] = {
    yours: ['yours', true, 'Your turn'],
    working: ['working', true, props.line ?? 'Claude is working'],
    idle: ['', false, "Claude isn't listening"],
    done: ['', false, props.status === 'paused' ? 'Paused · resumable' : 'Run ended'],
    offline: ['', false, 'Not connected'],
  }[props.turn] as [string, boolean, string];
  return <span class={`status ${cls}`} role="status" aria-label="Turn" data-turn={props.turn}>{pulse && <span class="dotpulse" />}{text}</span>;
}
