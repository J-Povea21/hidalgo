/** The conversation module as MCP tools. */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DiagramSpec } from '@shared/contract.ts';
import type { ToolHost } from '@server/common/interface/mcp/tool-host.port.ts';
import { RunId } from '@server/common/interface/mcp/tool-result.ts';
import { ConversationMapper } from '@server/conversation/application/mappers/conversation.mapper.ts';
import type { ConversationModule } from '@server/conversation/conversation.module.ts';

export function registerConversationTools(server: McpServer, conversation: ConversationModule, host: ToolHost): void {
  server.registerTool(
    'send_message',
    {
      description:
        "Post a Markdown message. To answer the user, pass replyTo (the event seq) and the server puts it in that event's thread; to start a conversation, pass threadId (the run's from open_session, or an item's from add_items). Embed a diagram with {{diagram:<id>}}.",
      inputSchema: {
        runId: RunId,
        text: z.string().min(1).max(20_000),
        replyTo: z.number().int().optional(),
        threadId: z.string().optional(),
      },
    },
    (input) =>
      host.onRun(input.runId, async () => ConversationMapper.toSent(await conversation.sendMessage.execute(input))),
  );

  server.registerTool(
    'create_diagram',
    {
      description:
        'Build a diagram from structure (flow: nodes, groups, edges; sequence: participants, steps). The server writes and escapes the Mermaid, so labels can contain any text. Returns an id to embed as {{diagram:<id>}}.',
      inputSchema: { runId: RunId, spec: DiagramSpec },
    },
    (input) =>
      host.onRun(input.runId, async () =>
        ConversationMapper.toDiagram(await conversation.createDiagram.execute(input)),
      ),
  );
}
