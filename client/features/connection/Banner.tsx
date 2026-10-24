/** Says plainly when the page can't reach its session, and what to do. Silent when all is well. */
import type { Connection } from '../../core/state.ts';

export function ConnectionBanner(props: { connection: Connection; listening: boolean; idle: boolean }) {
  const c = props.connection;
  if (c.kind === 'reconnecting') return <div class="banner warn" role="status">Reconnecting to Claude's session… Anything you write is kept and sent when it's back.</div>;
  if (c.kind === 'ended') return <div class="banner info" role="status">{c.reason}</div>;
  if (c.kind === 'moved') return <div class="banner bad" role="alert">This run moved to another address, so this tab stopped sending. Claude opens the new one when the run resumes.</div>;
  if (c.kind === 'lost') {
    return (
      <div class="banner bad" role="alert">
        Can't reach Claude's session. Your work is saved. If the session is still open, run <code>/mcp</code> there and reconnect <b>workbench</b>; otherwise run the skill again in this project to resume.
      </div>
    );
  }
  if (c.kind === 'live' && props.idle && !props.listening) {
    return <div class="banner warn" role="status">Claude isn't listening right now. Your messages are kept and reach Claude on its next step.</div>;
  }
  return null;
}
