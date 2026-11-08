import type { ItemOnPage, PageEvent } from '../types.ts';
import type { ClaudeSession } from './session.ts';

interface RunIds {
  runId: string;
  /** The whole run's conversation. */
  threadId: string;
  items: ItemOnPage[];
  url: string;
}

/**
 * A run Claude has open, and what Claude does with it: one method per Hidalgo tool, named
 * for what Claude does. A new tool is a new method here.
 */
export class OpenRun implements RunIds {
  readonly runId: string;
  readonly threadId: string;
  readonly items: ItemOnPage[];
  readonly url: string;

  constructor(
    private readonly claude: ClaudeSession,
    ids: RunIds,
  ) {
    this.runId = ids.runId;
    this.threadId = ids.threadId;
    this.items = ids.items;
    this.url = ids.url;
  }

  /**
   * Waits for the user in the background, as Claude does, and resolves with what the page
   * sends. A wait still open when the test ends is dropped, not reported.
   */
  waitForTheUser(): Promise<PageEvent[]> {
    const waiting = this.call('wait_for_events').then((answer: { events: PageEvent[] }) => answer.events);
    waiting.catch(() => undefined);
    return waiting;
  }

  say(threadId: string, text: string) {
    return this.call('send_message', { threadId, text });
  }

  reply(to: PageEvent, text: string) {
    return this.call('send_message', { replyTo: to['seq'], text });
  }

  revise(itemId: string, patch: Record<string, unknown>) {
    return this.call('update_item', { itemId, patch });
  }

  async draw(spec: unknown): Promise<string> {
    const { diagramId } = await this.call('create_diagram', { spec });
    return diagramId;
  }

  markDone(itemId: string, note = 'created ABC-142') {
    return this.call('mark_done', { itemId, note });
  }

  setStatus(line: string) {
    return this.call('set_status', { line });
  }

  close(outcome = 'done') {
    return this.call('close_session', { status: 'closed', outcome });
  }

  pause(outcome = 'later') {
    return this.call('close_session', { status: 'paused', outcome });
  }

  resume() {
    return this.claude.call('open_session', { skill: 'card', project: 'Storefront', subject: 's', resume: this.runId });
  }

  private call(tool: string, args: Record<string, unknown> = {}) {
    return this.claude.call(tool, { runId: this.runId, ...args });
  }
}
