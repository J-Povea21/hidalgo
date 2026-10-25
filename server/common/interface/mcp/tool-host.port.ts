/** What a module's tools need from the server around them. */
import type { ToolResult } from '@server/common/interface/mcp/tool-result.ts';

export abstract class ToolHost {
  /**
   * For a tool that acts on a run: serves the run (so a page left open from before a restart
   * sees the change), marks Claude as working, runs the tool, then attaches whatever the user
   * did since the last delivery.
   */
  abstract onRun(runId: string, act: () => Promise<object>): Promise<ToolResult>;
}
