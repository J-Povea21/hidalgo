/**
 * CSS class names the components toggle, as constants (styles.css defines them),
 * and `classes()` to join them: `classes('iconbtn', open && CLASS.on)`.
 */
export const CLASS = {
  /** A toggle button whose panel is showing. */
  on: 'on',
  /** The drawer is expanded. */
  open: 'open',
  /** The item still has questions open. */
  pending: 'pending',
  /** Claude is working on something sent from this item. */
  working: 'working',
  /** A file is being dragged over the composer. */
  dragging: 'drag',
  /** The next question or item slides in from the right, or from the left. */
  slideFromRight: 'in-right',
  slideFromLeft: 'in-left',
  /** The toast is on screen. */
  shown: 'show',
  /** The progress segment of the item on screen. */
  current: 'cur',
  /** A question dot whose answer is picked. */
  answered: 'answered',
  /** Provenance under a list of assumptions gets some room above it. */
  afterList: 'after',
} as const;

/** Which way the next question or item comes in, from where we are now. */
export function slideToward(target: number, current: number): string {
  return target > current ? CLASS.slideFromRight : CLASS.slideFromLeft;
}

/** Joins the class names that are set, skipping `false`, `undefined` and empty strings. */
export function classes(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
