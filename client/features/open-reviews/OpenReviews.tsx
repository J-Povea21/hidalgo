/** Other workbench pages open right now on this machine, any session or project. */
import { useEffect, useState } from 'preact/hooks';
import type { LiveEntry } from '@shared/contract.ts';

export function OpenReviews(props: { currentRunId: string; load: () => Promise<LiveEntry[]> }) {
  const [runs, setRuns] = useState<LiveEntry[] | undefined>();
  useEffect(() => {
    props.load().then(
      (entries) => setRuns(entries.filter((entry) => entry.runId !== props.currentRunId)),
      () => setRuns([]),
    );
  }, []);
  return (
    <section class="panel" aria-label="Open reviews">
      <div class="phead">
        <h2>Open reviews</h2>
        <span class="meta">on this machine</span>
      </div>
      {runs === undefined ? (
        <div class="section meta">Loading…</div>
      ) : runs.length === 0 ? (
        <div class="section meta">No other review is open.</div>
      ) : (
        <ul class="runs">
          {runs.map((entry) => (
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
      )}
    </section>
  );
}
