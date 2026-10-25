/**
 * What the user typed or picked but hasn't sent, kept in the browser per run, so a reload,
 * a dropped connection or a moved page loses nothing. When the browser refuses storage
 * (a private window, blocked site data) the values live in memory for the tab's life.
 */
import type { DraftStore } from '@client/core/ports.ts';

/** Drafts outlive the tab (localStorage); tab values, like which item is on screen, don't (sessionStorage). */
type Lifetime = 'drafts' | 'tab';

/** Shared by every store: what couldn't be kept in the browser. */
const inMemory = new Map<string, string>();

export class BrowserDraftStore implements DraftStore {
  constructor(
    private readonly runId: string,
    private readonly lifetime: Lifetime = 'drafts',
  ) {}

  load<T>(key: string, fallback: T): T {
    const stored = this.read(this.storageKey(key));
    if (stored === null) {
      return fallback;
    }
    const value: T = JSON.parse(stored);
    return value;
  }

  save(key: string, value: unknown): void {
    const storageKey = this.storageKey(key);
    if (isEmpty(value)) {
      this.remove(storageKey);
    } else {
      this.write(storageKey, JSON.stringify(value));
    }
  }

  private storageKey(key: string): string {
    return `wb:${this.lifetime}:${this.runId}:${key}`;
  }

  private storage(): Storage {
    return this.lifetime === 'drafts' ? localStorage : sessionStorage;
  }

  private read(storageKey: string): string | null {
    try {
      return this.storage().getItem(storageKey);
    } catch {
      return inMemory.get(storageKey) ?? null;
    }
  }

  private write(storageKey: string, text: string): void {
    try {
      this.storage().setItem(storageKey, text);
    } catch {
      inMemory.set(storageKey, text);
    }
  }

  private remove(storageKey: string): void {
    try {
      this.storage().removeItem(storageKey);
    } catch {
      inMemory.delete(storageKey);
    }
  }
}

/** An empty text or an empty set of picks is nothing to keep. */
function isEmpty(value: unknown): boolean {
  if (value === '' || value === undefined) {
    return true;
  }
  return typeof value === 'object' && value !== null && Object.keys(value).length === 0;
}
