import { useEffect, useState } from 'preact/hooks';
import type { LiveEntry } from '@shared/contract.ts';

interface OpenReviewsProps {
  currentRunId: string;
  load: () => Promise<LiveEntry[]>;
}

/** Other workbench pages open right now on this machine, any session or project. */
export function OpenReviews(props: OpenReviewsProps) {
  /** undefined while loading. */
  const [others, setOthers] = useState<LiveEntry[]>();
  useEffect(() => {
    props.load().then(
      (entries) => setOthers(entries.filter((entry) => entry.runId !== props.currentRunId)),
      () => setOthers([]),
    );
  }, []);
  return (
    <section class="panel" aria-label="Open reviews">
      <div class="phead">
        <h2>Open reviews</h2>
        <span class="meta">on this machine</span>
      </div>
      <ReviewList others={others} />
    </section>
  );
}

function ReviewList(props: { others: LiveEntry[] | undefined }) {
  const { others } = props;
  if (others === undefined) {
    return <div class="section meta">Loading…</div>;
  }
  if (others.length === 0) {
    return <div class="section meta">No other review is open.</div>;
  }
  return (
    <ul class="runs">
      {others.map((entry) => (
        <li key={entry.runId}>
          <a href={entry.url} target="_blank" rel="noopener">
            <span>
              <b>{entry.project}</b> · {entry.skill} · {entry.subject}
            </span>
            <span class="meta">
              {entry.claudeListening ? `${entry.pendingForUser} waiting on you` : 'Claude is working'}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
