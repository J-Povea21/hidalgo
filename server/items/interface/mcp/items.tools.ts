/** The items module as MCP tools. */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ITEM_KINDS, ItemKinds, QuestionSpec } from '@shared/contract.ts';
import type { ToolHost } from '@server/common/interface/mcp/tool-host.port.ts';
import { RunId } from '@server/common/interface/mcp/tool-result.ts';
import type { ItemsModule } from '@server/items/items.module.ts';

/** One input shape per registered kind, derived from ItemKinds: adding a kind needs no change here. */
const [firstKind, ...otherKinds] = ITEM_KINDS.map((kind) =>
  z.object({ kind: z.literal(kind), fields: ItemKinds[kind], questions: z.array(QuestionSpec).optional() }),
);
const ItemInput = z.discriminatedUnion('kind', [firstKind!, ...otherKinds]);

export function registerItemsTools(server: McpServer, items: ItemsModule, host: ToolHost): void {
  server.registerTool(
    'add_items',
    {
      description:
        "Add items to the run's page in one call. Each is checked against its kind's schema; a failure names the reason and adds nothing. Returns each item's id, revision and threadId (its conversation, for send_message).",
      inputSchema: { runId: RunId, items: z.array(ItemInput).min(1).max(20) },
    },
    (input) => host.onRun(input.runId, async () => ({ added: await items.addItems.execute(input) })),
  );

  server.registerTool(
    'update_item',
    {
      description:
        "Change only the given fields of an item (deep merge; arrays replace whole). Bumps the item's revision, which clears any approval of the old one.",
      inputSchema: { runId: RunId, itemId: z.string(), patch: z.record(z.string(), z.unknown()) },
    },
    (input) => host.onRun(input.runId, () => items.updateItem.execute(input)),
  );

  server.registerTool(
    'ask',
    {
      description:
        "Put questions in an item's carousel. Approve stays blocked on the page until every question is answered. Mark your recommendation with `recommended` (option index).",
      inputSchema: { runId: RunId, itemId: z.string(), questions: z.array(QuestionSpec).min(1).max(10) },
    },
    (input) => host.onRun(input.runId, () => items.ask.execute(input)),
  );

  server.registerTool(
    'mark_done',
    {
      description:
        'Record that an approved item now exists outside the workbench (e.g. the ClickUp card was created). Only an item approved at its current revision qualifies.',
      inputSchema: {
        runId: RunId,
        itemId: z.string(),
        note: z.string().min(1).max(300).describe('e.g. "created 86e3abc12"'),
      },
    },
    (input) => host.onRun(input.runId, () => items.markDone.execute(input)),
  );
}
