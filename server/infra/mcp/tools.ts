/**
 * The workbench as MCP tools. Each validates its input, calls its slice, and
 * returns compact JSON. Every tool that acts on a run also hands back any page
 * events not yet delivered, so input reaches Claude mid-run without a wait.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CardFields, DiagramSpec, QuestionSpec } from '../../../shared/contract.ts';
import { addItems } from '../../features/add-items/add-items.ts';
import { ask } from '../../features/ask/ask.ts';
import { closeSession } from '../../features/close-session/close-session.ts';
import { createDiagram } from '../../features/create-diagram/create-diagram.ts';
import { listRuns } from '../../features/list-runs/list-runs.ts';
import { markDone } from '../../features/mark-done/mark-done.ts';
import { openSession } from '../../features/open-session/open-session.ts';
import { sendMessage } from '../../features/send-message/send-message.ts';
import { setStatus } from '../../features/set-status/set-status.ts';
import { updateItem } from '../../features/update-item/update-item.ts';
import { takeEvents, waitForEvents } from '../../features/wait-for-events/wait-for-events.ts';
import { WorkbenchError } from '../../kernel/errors.ts';
import type { Workbench } from '../workbench.ts';

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };

const ok = (body: unknown): Result => ({ content: [{ type: 'text', text: JSON.stringify(body) }] });
const err = (e: unknown): Result => {
  const w = e instanceof WorkbenchError ? e : undefined;
  const body = w ? { error: w.code, message: w.message, ...(w.details ? { details: w.details } : {}) } : { error: 'internal', message: String((e as Error)?.message ?? e) };
  return { content: [{ type: 'text', text: JSON.stringify(body) }], isError: true };
};

const RunId = z.string().describe('The run id open_session returned.');
const ItemInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('card'), fields: CardFields, questions: z.array(QuestionSpec).optional() }),
]);

export function registerTools(server: McpServer, wb: Workbench): void {
  const deps = {
    store: wb.store, page: wb.page, log: wb.log, clock: wb.clock, ids: wb.ids, signal: wb.signal,
    images: wb.images, limits: wb.limits, address: wb.address, live: wb.live,
  };

  /** Runs the slice, then attaches whatever the user did since the last delivery. */
  const withEvents = async (runId: string, act: () => Promise<unknown>): Promise<Result> => {
    try {
      const result = await act();
      const events = await takeEvents(deps, runId);
      return ok(events.length ? { ...(result as object), events } : result);
    } catch (e) {
      return err(e);
    }
  };

  server.registerTool('open_session', {
    description: 'Start a workbench run (or resume one) and open its page in the browser. Returns the run id. Resuming replays anything the user did while no server was running.',
    inputSchema: {
      skill: z.string().describe('The skill using the page, e.g. "card".'),
      project: z.string().describe('Project name from references/projects.json, e.g. "MiPlan".'),
      subject: z.string().max(60).describe('Short subject for the tab title, e.g. "OfficesExist validator".'),
      resume: z.string().optional().describe('Id of an unfinished run to resume (see list_runs).'),
    },
  }, async (input) => {
    try {
      const { run, resumed } = await openSession(deps, input);
      await wb.serve(run.id);
      const url = wb.address.url(run.id);
      wb.open(url);
      const events = resumed ? await takeEvents(deps, run.id) : [];
      return ok({ runId: run.id, resumed, opened: true, ...(events.length ? { events } : {}) });
    } catch (e) {
      return err(e);
    }
  });

  server.registerTool('list_runs', {
    description: "The project's runs that aren't closed, with their items' titles, read-only. Use it to offer a resume and, before drafting, to catch drafts another session hasn't put on the board yet.",
    inputSchema: { project: z.string(), includeClosed: z.boolean().optional() },
  }, async (input) => {
    try { return ok({ runs: await listRuns(deps, input) }); } catch (e) { return err(e); }
  });

  server.registerTool('add_items', {
    description: "Add items to the run's page in one call. Each is checked against its kind's schema; a failure names the reason and adds nothing.",
    inputSchema: { runId: RunId, items: z.array(ItemInput).min(1).max(20) },
  }, (input) => withEvents(input.runId, () => addItems(deps, input).then((added) => ({ added }))));

  server.registerTool('update_item', {
    description: "Change only the given fields of an item (deep merge; arrays replace whole). Bumps the item's revision, which clears any approval of the old one.",
    inputSchema: { runId: RunId, itemId: z.string(), patch: z.record(z.string(), z.unknown()) },
  }, (input) => withEvents(input.runId, () => updateItem(deps, input)));

  server.registerTool('ask', {
    description: "Put questions in an item's carousel. Approve stays blocked on the page until every question is answered. Mark your recommendation with `recommended` (option index).",
    inputSchema: { runId: RunId, itemId: z.string(), questions: z.array(QuestionSpec).min(1).max(10) },
  }, (input) => withEvents(input.runId, () => ask(deps, input)));

  server.registerTool('send_message', {
    description: 'Post a Markdown message. To answer the user, pass replyTo (the event seq) and the server puts it in that event\'s thread; pass threadId only for a new message. Embed a diagram with {{diagram:<id>}}.',
    inputSchema: {
      runId: RunId,
      text: z.string().min(1).max(20_000),
      replyTo: z.number().int().optional(),
      threadId: z.string().optional(),
    },
  }, (input) => withEvents(input.runId, () => sendMessage(deps, input)));

  server.registerTool('create_diagram', {
    description: 'Build a diagram from structure (flow: nodes, groups, edges; sequence: participants, steps). The server writes and escapes the Mermaid, so labels can contain any text. Returns an id to embed as {{diagram:<id>}}.',
    inputSchema: { runId: RunId, spec: DiagramSpec },
  }, (input) => withEvents(input.runId, () => createDiagram(deps, input)));

  server.registerTool('set_status', {
    description: 'The live line the page shows while you work, e.g. "adversary round 1 of 2". Omit line to clear it.',
    inputSchema: { runId: RunId, line: z.string().max(120).optional() },
  }, (input) => withEvents(input.runId, () => setStatus(deps, input)));

  server.registerTool('wait_for_events', {
    description: "Hand the turn to the user and wait for what they do on the page. Returns at once if events are already waiting. Call it whenever you've finished a round: the session's Stop hook won't let a turn end while a run is open and nobody is waiting.",
    inputSchema: { runId: RunId },
  }, async (input) => {
    try { return ok(await waitForEvents(deps, input.runId)); } catch (e) { return err(e); }
  });

  server.registerTool('mark_done', {
    description: 'Record that an approved item now exists outside the workbench (e.g. the ClickUp card was created). Only an item approved at its current revision qualifies.',
    inputSchema: { runId: RunId, itemId: z.string(), note: z.string().min(1).max(300).describe('e.g. "created 86e3abc12"') },
  }, (input) => withEvents(input.runId, () => markDone(deps, input)));

  server.registerTool('close_session', {
    description: 'End the run. "closed" needs every item rejected, or approved and marked done; items the user left pending allow only "paused", which stays resumable. Refused otherwise, listing the open items.',
    inputSchema: { runId: RunId, status: z.enum(['closed', 'paused']), outcome: z.string().min(1).max(300) },
  }, (input) => withEvents(input.runId, () => closeSession(deps, input)));
}
