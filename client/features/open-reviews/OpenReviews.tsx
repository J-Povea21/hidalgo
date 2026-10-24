/** Other workbench pages open right now on this machine, any session or project. */
import { useEffect, useState } from 'preact/hooks';
import type { LiveEntry } from '../../../shared/contract.ts';

export function OpenReviews(props: { currentRunId: string; load: () => Promise<LiveEntry[]> }) {
  const [runs, setRuns] = useState<LiveEntry[] | undefined>();
  useEffect(() => { props.load().then((r) => setRuns(r.filter((e) => e.runId !== props.currentRunId)), () => setRuns([])); }, []);
  return (
    <section class="panel" aria-label="Open reviews">
      <div class="phead"><h2>Open reviews</h2><span class="meta">on this machine</span></div>
      {runs === undefined ? <div class="section meta">Loading…</div>
        : runs.length === 0 ? <div class="section meta">No other review is open.</div>
        : (
          <ul class="runs">
            {runs.map((r) => (
              <li key={r.runId}>
                <a href={r.url} target="_blank" rel="noopener">
                  <span><b>{r.project}</b> · {r.skill} · {r.subject}</span>
                  <span class="meta">{r.awaiting ? `${r.waiting} waiting on you` : 'Claude is working'}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
