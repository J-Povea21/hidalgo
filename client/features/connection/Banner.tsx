/** Says plainly when the page can't reach its session, or the run is paused, and what to do. Silent when all is well. */
import type { RunStatus } from '@shared/contract.ts';
import type { Connection } from '@client/core/state.ts';
import { CONNECTION } from '@client/core/state.ts';
import { RUN_STATUS } from '@shared/values.ts';

interface ConnectionBannerProps {
  connection: Connection;
  listening: boolean;
  idle: boolean;
  runStatus?: RunStatus | undefined;
}

export function ConnectionBanner(props: ConnectionBannerProps) {
  const connection = props.connection;
  if (connection.kind === CONNECTION.reconnecting)
    return (
      <div class="banner warn" role="status">
        Reconnecting to Claude's session… Your drafts are kept; you can send again once it's back.
      </div>
    );
  if (connection.kind === CONNECTION.ended)
    return (
      <div class="banner info" role="status">
        {connection.reason}
      </div>
    );
  if (connection.kind === CONNECTION.stale) {
    return (
      <div class="banner warn" role="alert">
        This page is from an older version of workbench, so it can't talk to Claude's session. Your work is saved.{' '}
        <button class="link" onClick={() => location.reload()}>
          Reload the page
        </button>
      </div>
    );
  }
  if (connection.kind === CONNECTION.moved)
    return (
      <div class="banner bad" role="alert">
        This run moved to another address, so this tab stopped sending. Ask Claude to resume the run and it opens the
        new page.
      </div>
    );
  if (connection.kind === CONNECTION.lost) {
    return (
      <div class="banner bad" role="alert">
        Can't reach Claude's session. Your work is saved. Ask Claude to resume this run: this tab reconnects by itself,
        or Claude opens a new one. If Claude says workbench is disconnected, run <code>/mcp</code> there and reconnect{' '}
        <b>workbench</b> first.
      </div>
    );
  }
  if (props.runStatus === RUN_STATUS.paused) {
    return (
      <div class="banner info" role="status">
        This run is paused. Everything is saved; ask Claude to resume it to carry on.
      </div>
    );
  }
  if (connection.kind === CONNECTION.live && props.idle && !props.listening && props.runStatus === RUN_STATUS.open) {
    return (
      <div class="banner warn" role="status">
        Claude isn't listening right now. Your messages are kept and reach Claude on its next step.
      </div>
    );
  }
  return null;
}
