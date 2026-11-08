import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RunState } from '@shared/contract.ts';
import type { ToolHost } from '@server/common/interface/mcp/tool-host.port.ts';
import { err, guarded, ok, type ToolResult } from '@server/common/interface/mcp/tool-result.ts';
import { registerConversationTools } from '@server/conversation/interface/mcp/conversation.tools.ts';
import { registerItemsTools } from '@server/items/interface/mcp/items.tools.ts';
import { registerPageEventsTools } from '@server/page-events/interface/mcp/page-events.tools.ts';
import { PageEventMapper } from '@server/page-events/application/mappers/page-event.mapper.ts';
import type { WaitHost } from '@server/page-events/interface/mcp/wait-host.port.ts';
import type { RunPages } from '@server/runs/interface/mcp/run-pages.port.ts';
import { registerRunsTools } from '@server/runs/interface/mcp/runs.tools.ts';
import type { Hidalgo } from './hidalgo.ts';

class HidalgoHost implements ToolHost, WaitHost, RunPages {
  constructor(private readonly wb: Hidalgo) {}

  async onRun(runId: string, act: () => Promise<object>): Promise<ToolResult> {
    try {
      // A run touched after a restart is served again, so its open page sees the change.
      await this.wb.ensureServed(runId);
      this.wb.markActive(runId);
      const result = await act();
      const events = PageEventMapper.toDelivered(await this.wb.modules.pageEvents.takeEvents.execute({ runId }));
      return ok(events.length ? { ...result, events } : result);
    } catch (error) {
      return err(error);
    }
  }

  waitOn(runId: string, wait: () => Promise<object>): Promise<ToolResult> {
    return guarded(async () => {
      await this.wb.ensureServed(runId);
      const result = await wait();
      // Woken by the user: Claude is working on it from this moment.
      this.wb.markActive(runId);
      return result;
    });
  }

  async show(run: RunState, resumed: boolean): Promise<object> {
    await this.wb.serve(run.id);
    this.wb.markActive(run.id);
    // A page already connected to this run (or about to reconnect) is the one the user has: tell it, don't open another.
    const viewers = resumed ? await this.wb.reattach(run.id) : 0;
    const alreadyOpen = viewers > 0;
    if (alreadyOpen) {
      this.wb.hub.nudge(run.id, 'Claude resumed this run.');
    } else {
      this.wb.open(this.wb.pageUrl(run.id));
    }
    const events = resumed
      ? PageEventMapper.toDelivered(await this.wb.modules.pageEvents.takeEvents.execute({ runId: run.id }))
      : [];
    return {
      opened: !alreadyOpen,
      ...(alreadyOpen ? { alreadyOpen: viewers } : {}),
      ...(events.length ? { events } : {}),
    };
  }
}

/**
 * Hidalgo as MCP tools: each module registers its own, and this host gives
 * them what only the running server has. Every tool that acts on a run also
 * hands back any page events not yet delivered, so input reaches Claude mid-run
 * without a wait.
 */
export function registerTools(server: McpServer, wb: Hidalgo): void {
  const host = new HidalgoHost(wb);
  registerRunsTools(server, wb.modules.runs, host, host);
  registerItemsTools(server, wb.modules.items, host);
  registerConversationTools(server, wb.modules.conversation, host);
  registerPageEventsTools(server, wb.modules.pageEvents, host);
}
