/** What the tests leave on the page's window, so code run in the page can read it typed. */
export {};

declare global {
  interface Window {
    /** Content-Security-Policy violations the page saw (support/test.ts). */
    __csp?: string[];
    /** Set by hostile Markdown if it ever ran (conversations.spec.ts). */
    __ran?: number;
  }
}
