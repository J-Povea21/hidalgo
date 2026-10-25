/**
 * Entry point: an MCP server on stdio, started by Claude Code for the session.
 * When Claude Code closes our stdin (the session ended, in any client), we say
 * goodbye to the pages, take our live entries down, and exit.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './mcp/tools.ts';
import { dataRoot } from './paths.ts';
import { DEFAULT_LIMITS, Workbench } from './workbench.ts';

const here = dirname(fileURLToPath(import.meta.url));

const wb = new Workbench({
  dataRoot: dataRoot(),
  clientDir: join(here, 'client'),
  limits: DEFAULT_LIMITS,
  retentionDays: 7,
  heartbeatMs: 30_000,
  // WORKBENCH_OPEN=0 serves the page without opening a browser (smoke tests, headless checks).
  ...(process.env['WORKBENCH_OPEN'] === '0'
    ? { openBrowser: (url: string) => process.stderr.write(`workbench page: ${url}\n`) }
    : {}),
});

const server = new McpServer(
  { name: 'workbench', version: '0.1.0' },
  {
    instructions:
      "Workbench shows a skill's work to the user in a local page and carries their answers, messages and verdicts back. " +
      "open_session first; add_items and ask to show work; wait_for_events whenever it's the user's turn; mark_done after acting on an approval; close_session at the end.",
  },
);
registerTools(server, wb);

let ending = false;
async function end(reason: string): Promise<void> {
  if (ending) return;
  ending = true;
  await wb.shutdown(reason).catch(() => undefined);
  process.exit(0);
}
const SESSION_ENDED = 'The Claude session ended. Your work is saved; run the skill again in this project to resume.';
process.stdin.on('end', () => void end(SESSION_ENDED));
process.stdin.on('close', () => void end(SESSION_ENDED));
process.on('SIGTERM', () => void end('The Claude session was stopped. Your work is saved.'));

await wb.sweep().catch(() => undefined);
await server.connect(new StdioServerTransport());
// After a /mcp reconnect: bring back the pages this Claude Code process had open.
await wb.reserveOwnRuns().catch(() => undefined);
