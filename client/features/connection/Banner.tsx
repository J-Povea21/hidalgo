/** Says plainly when the page can't reach its session, or the run is paused, and what to do. Silent when all is well. */
import type { ComponentChildren } from 'preact';
import type { RunStatus } from '@shared/contract.ts';
import { RUN_STATUS } from '@shared/values.ts';
import { CONNECTION, type Connection } from '@client/core/state.ts';
import { classes } from '@client/ui/classes.ts';

interface ConnectionBannerProps {
  connection: Connection;
  listening: boolean;
  idle: boolean;
  runStatus?: RunStatus | undefined;
}

/** How a banner looks: `alert` interrupts a screen reader, `status` waits its turn. */
interface Banner {
  tone: 'info' | 'warn' | 'bad';
  role: 'status' | 'alert';
  message: ComponentChildren;
}

export function ConnectionBanner(props: ConnectionBannerProps) {
  const { connection } = props;
  let banner: Banner | undefined;
  switch (connection.kind) {
    case CONNECTION.reconnecting:
      banner = {
        tone: 'warn',
        role: 'status',
        message: "Reconnecting to Claude's session… Your drafts are kept; you can send again once it's back.",
      };
      break;
    case CONNECTION.ended:
      banner = { tone: 'info', role: 'status', message: connection.reason };
      break;
    case CONNECTION.stale:
      banner = { tone: 'warn', role: 'alert', message: <StaleMessage /> };
      break;
    case CONNECTION.moved:
      banner = {
        tone: 'bad',
        role: 'alert',
        message:
          'This run moved to another address, so this tab stopped sending. Ask Claude to resume the run and it opens the new page.',
      };
      break;
    case CONNECTION.lost:
      banner = { tone: 'bad', role: 'alert', message: <LostMessage /> };
      break;
    case CONNECTION.live:
      banner = runBanner(props);
      break;
    case CONNECTION.connecting:
      break;
  }
  return banner ? (
    <div class={classes('banner', banner.tone)} role={banner.role}>
      {banner.message}
    </div>
  ) : null;
}

/** While connected, the banner is about the run itself: paused, or nobody listening. */
function runBanner(props: ConnectionBannerProps): Banner | undefined {
  if (props.runStatus === RUN_STATUS.paused) {
    return {
      tone: 'info',
      role: 'status',
      message: 'This run is paused. Everything is saved; ask Claude to resume it to carry on.',
    };
  }
  const claudeWentQuiet = props.idle && !props.listening && props.runStatus === RUN_STATUS.open;
  if (claudeWentQuiet) {
    return {
      tone: 'warn',
      role: 'status',
      message: "Claude isn't listening right now. Your messages are kept and reach Claude on its next step.",
    };
  }
  return undefined;
}

function StaleMessage() {
  return (
    <>
      This page is from an older version of workbench, so it can't talk to Claude's session. Your work is saved.{' '}
      <button class="link" onClick={() => location.reload()}>
        Reload the page
      </button>
    </>
  );
}

function LostMessage() {
  return (
    <>
      Can't reach Claude's session. Your work is saved. Ask Claude to resume this run: this tab reconnects by itself, or
      Claude opens a new one. If Claude says workbench is disconnected, run <code>/mcp</code> there and reconnect{' '}
      <b>workbench</b> first.
    </>
  );
}
