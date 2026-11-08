/** What the browser tests pass around. */
import type { CardSpec } from './data.ts';

/** An item Claude put on the page: its id, its revision, and its conversation. */
export interface ItemOnPage {
  id: string;
  rev: number;
  threadId: string;
}

/** What the page sent, as Claude receives it from wait_for_events or with a tool result. */
export type PageEvent = Record<string, any>;

/** How Claude opens a run: its project, the subject in the tab title, and the cards it shows. */
export interface RunOptions {
  project?: string;
  subject?: string;
  cards?: CardSpec[];
}

/** Which item status a verdict badge shows. */
export type BadgeStatus = 'approved' | 'rejected' | 'pending' | 'done';

/** What the tests leave on the page's window, so code run in the page can read it typed. */
declare global {
  interface Window {
    /** Content-Security-Policy violations the page saw (support/fixtures.ts). */
    __csp?: string[];
    /** Set by hostile Markdown if it ever ran (conversations.spec.ts). */
    __ran?: number;
  }
}
