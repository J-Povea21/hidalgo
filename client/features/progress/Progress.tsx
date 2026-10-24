/** The header: what this run is, whose turn it is, what Claude is doing, and where each item stands. */
import type { ComponentChildren } from 'preact';
import type { RunState } from '../../../shared/contract.ts';
import { itemStatus, itemTitle, type ItemStatus, type Turn } from '../../core/selectors.ts';

const FILL: Record<ItemStatus, [string, string]> = {
  questions: ['35%', 'var(--warn)'], ready: ['75%', 'var(--accent)'], approved: ['90%', 'var(--ok)'],
  done: ['100%', 'var(--ok)'], rejected: ['100%', 'var(--bad)'], pending: ['100%', 'var(--faint)'],
};

export function Progress(props: { run: RunState; turn: Turn; current: number; onGo: (i: number) => void; actions: ComponentChildren }) {
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
          <nav class="progress" aria-label="Items">
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

function TurnLine(props: { turn: Turn; line?: string | undefined; status: RunState['status'] }) {
  if (props.turn === 'yours') return <span class="status yours" role="status"><span class="dotpulse" />Your turn</span>;
  if (props.turn === 'working') return <span class="status working" role="status"><span class="dotpulse" />{props.line ?? 'Claude is working'}</span>;
  if (props.turn === 'done') return <span class="status" role="status">{props.status === 'paused' ? 'Paused · resumable' : 'Run ended'}</span>;
  if (props.turn === 'offline') return <span class="status" role="status">Not connected</span>;
  return null;
}
