/**
 * The timings, screens and colours the browser tests depend on. Where the product defines
 * the value, it is derived from the product's own constant, so the two can't drift apart.
 */
import { devices } from '@playwright/test';
import { ACTIVE_FOR_MS } from '@client/domain/state.ts';
import { TURN_COLOR } from '@client/features/tab/useTab.ts';
import { RETRY } from '@client/infra/live-feed.ts';

/** Under the server's 15 s keep-alive: a push that lagged would only arrive with the next one. */
export const PROMPTLY = { timeout: 3_000 };

/** Longer than the page's widest gap between reconnect attempts. */
export const WITHIN_A_RECONNECT = { timeout: RETRY.longestGapMs };

/** The first diagram on a page loads Mermaid and draws: allow for both. */
export const DIAGRAM_DRAWN = { timeout: 15_000 };

/** One step of the fake clock that is surely past the page's next reconnect attempt. */
export const PAST_A_RETRY_MS = RETRY.longestGapMs + 1_000;

/** Past the time after Claude's last tool call during which the page still says it is working. */
export const PAST_ACTIVE_WINDOW_MS = ACTIVE_FOR_MS + 1_000;

/** How long a tool call may take before the test gives up on it. */
export const TOOL_TIMEOUT_MS = 60_000;

/** The favicon dot's colour per turn, as the page draws it. */
export const FAVICON = TURN_COLOR;

/** The screens the layout is checked on: Playwright's own device sizes. */
export const SCREENS = {
  laptop: devices['Desktop Chrome'].viewport,
  phone: devices['iPhone 13'].viewport,
};

/** The accessibility rules axe applies: WCAG 2.2 AA and its best practices. */
export const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
