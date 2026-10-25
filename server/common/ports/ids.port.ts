/** New ids for runs, items, threads and messages, each starting with its prefix. */
export abstract class Ids {
  abstract next(prefix: string): string;
}
