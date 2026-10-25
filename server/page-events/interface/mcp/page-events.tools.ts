/** The page-events module as MCP tools. What the page sends arrives over HTTP, not here. */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RunId } from '@server/common/interface/mcp/tool-result.ts';
import { PageEventMapper } from '@server/page-events/application/mappers/page-event.mapper.ts';
import type { WaitHost } from '@server/page-events/interface/mcp/wait-host.port.ts';
import type { PageEventsModule } from '@server/page-events/page-events.module.ts';

export function registerPageEventsTools(server: McpServer, pageEvents: PageEventsModule, host: WaitHost): void {
  server.registerTool(
    'wait_for_events',
    {
      description:
        "Hand the turn to the user and wait for what they do on the page. Returns at once if events are already waiting. Call it whenever you've finished a round: the session's Stop hook won't let a turn end while a run is open and nobody is waiting.",
      inputSchema: { runId: RunId },
    },
    (input) =>
      host.waitOn(input.runId, async () => PageEventMapper.toWaited(await pageEvents.waitForEvents.execute(input))),
  );
}
