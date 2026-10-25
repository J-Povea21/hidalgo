/** Text and picks the user hasn't sent yet, kept per run so a reload loses nothing. */
export abstract class DraftStore {
  abstract load<T>(key: string, fallback: T): T;
  abstract save(key: string, value: unknown): void;
}
