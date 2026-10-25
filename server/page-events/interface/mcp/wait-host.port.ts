import type { ToolResult } from '@server/common/interface/mcp/tool-result.ts';

/** What wait_for_events needs from the server around it. */
export abstract class WaitHost {
  /**
   * Serves the run, waits, and marks Claude as working once woken by the user. Nothing is
   * attached: the wait returns the events itself.
   */
  abstract waitOn(runId: string, wait: () => Promise<object>): Promise<ToolResult>;
}
