import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolHost } from '@server/common/interface/mcp/tool-host.port.ts';
import { guarded, RunId } from '@server/common/interface/mcp/tool-result.ts';
import { RunMapper } from '@server/runs/application/mappers/run.mapper.ts';
import type { RunPages } from '@server/runs/interface/mcp/run-pages.port.ts';
import type { RunsModule } from '@server/runs/runs.module.ts';
import { RUN_STATUS } from '@shared/values.ts';

/** The runs module as MCP tools. */
export function registerRunsTools(server: McpServer, runs: RunsModule, host: ToolHost, pages: RunPages): void {
  server.registerTool(
    'open_session',
    {
      description:
        "Start a workbench run (or resume one) and open its page in the browser. Returns the run id and the whole-run thread id (for send_message). Resuming replays anything the user did while no server was running; if the run's page is already open, that tab is told instead of opening another (opened:false, alreadyOpen).",
      inputSchema: {
        skill: z.string().describe('The skill using the page, e.g. "card".'),
        project: z.string().describe('Project name from references/projects.json, e.g. "MiPlan".'),
        subject: z.string().max(60).describe('Short subject for the tab title, e.g. "OfficesExist validator".'),
        resume: z.string().optional().describe('Id of an unfinished run to resume (see list_runs).'),
      },
    },
    (input) =>
      guarded(async () => {
        const opened = await runs.openSession.execute(input);
        const shown = await pages.show(opened.run, opened.resumed);
        return { ...RunMapper.toOpened(opened), ...shown };
      }),
  );

  server.registerTool(
    'list_runs',
    {
      description:
        "The project's runs that aren't closed, with their items' titles, read-only. Use it to offer a resume and, before drafting, to catch drafts another session hasn't put on the board yet.",
      inputSchema: { project: z.string(), includeClosed: z.boolean().optional() },
    },
    (input) => guarded(async () => RunMapper.toList(await runs.listRuns.execute(input))),
  );

  server.registerTool(
    'set_status',
    {
      description: 'The live line the page shows while you work, e.g. "adversary round 1 of 2". Omit line to clear it.',
      inputSchema: { runId: RunId, line: z.string().max(120).optional() },
    },
    (input) => host.onRun(input.runId, async () => RunMapper.toStatusLine(await runs.setStatus.execute(input))),
  );

  server.registerTool(
    'close_session',
    {
      description:
        'End the run. "paused" always works: it keeps everything and the run stays resumable. "closed" is final and needs every item rejected, or approved and marked done; otherwise it is refused, listing the open items, and you pause instead.',
      inputSchema: {
        runId: RunId,
        status: z.enum([RUN_STATUS.closed, RUN_STATUS.paused]),
        outcome: z.string().min(1).max(300),
      },
    },
    (input) => host.onRun(input.runId, async () => RunMapper.toClosed(await runs.closeSession.execute(input))),
  );
}
