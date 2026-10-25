/** Says plainly when the page can't reach its session, or the run is paused, and what to do. Silent when all is well. */
import type { RunStatus } from '../../../shared/contract.ts';
import type { Connection } from '../../core/state.ts';

export function ConnectionBanner(props: { connection: Connection; listening: boolean; idle: boolean; runStatus?: RunStatus | undefined }) {
  const c = props.connection;
  if (c.kind === 'reconnecting') return <div class="banner warn" role="status">Reconnecting to Claude's session… Your drafts are kept; you can send again once it's back.</div>;
  if (c.kind === 'ended') return <div class="banner info" role="status">{c.reason}</div>;
  if (c.kind === 'stale') {
    return (
      <div class="banner warn" role="alert">
        This page is from an older version of workbench, so it can't talk to Claude's session. Your work is saved.{' '}
        <button class="link" onClick={() => location.reload()}>Reload the page</button>
      </div>
    );
  }
  if (c.kind === 'moved') return <div class="banner bad" role="alert">This run moved to another address, so this tab stopped sending. Ask Claude to resume the run and it opens the new page.</div>;
  if (c.kind === 'lost') {
    return (
      <div class="banner bad" role="alert">
        Can't reach Claude's session. Your work is saved. Ask Claude to resume this run: this tab reconnects by itself, or Claude opens a new one.
        If Claude says workbench is disconnected, run <code>/mcp</code> there and reconnect <b>workbench</b> first.
      </div>
    );
  }
  if (props.runStatus === 'paused') {
    return <div class="banner info" role="status">This run is paused. Everything is saved; ask Claude to resume it to carry on.</div>;
  }
  if (c.kind === 'live' && props.idle && !props.listening && props.runStatus === 'open') {
    return <div class="banner warn" role="status">Claude isn't listening right now. Your messages are kept and reach Claude on its next step.</div>;
  }
  return null;
}
