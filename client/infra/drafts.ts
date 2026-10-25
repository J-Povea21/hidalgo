/**
 * What the user typed or picked but hasn't sent, kept in this browser per run,
 * so a reload, a dropped connection or a moved page loses nothing. Storage can
 * be unavailable (private windows); then drafts simply live in memory.
 */
const mem = new Map<string, string>();

export function loadDraft<T>(runId: string, key: string, fallback: T): T {
  const storageKey = `wb:${runId}:${key}`;
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === null ? fallback : (JSON.parse(stored) as T);
  } catch {
    const stored = mem.get(storageKey);
    return stored === undefined ? fallback : (JSON.parse(stored) as T);
  }
}

export function saveDraft(runId: string, key: string, value: unknown): void {
  const storageKey = `wb:${runId}:${key}`;
  const empty =
    value === '' || value === undefined || (typeof value === 'object' && value !== null && !Object.keys(value).length);
  try {
    if (empty) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    if (empty) mem.delete(storageKey);
    else mem.set(storageKey, JSON.stringify(value));
  }
}

/** A value for this tab only (sessionStorage), e.g. which item is on screen; same fallback as drafts. */
export function loadTabValue<T>(runId: string, key: string, fallback: T): T {
  const storageKey = `wb:${runId}:${key}`;
  try {
    const stored = sessionStorage.getItem(storageKey);
    return stored === null ? fallback : (JSON.parse(stored) as T);
  } catch {
    const stored = mem.get(`tab:${storageKey}`);
    return stored === undefined ? fallback : (JSON.parse(stored) as T);
  }
}

export function saveTabValue(runId: string, key: string, value: unknown): void {
  const storageKey = `wb:${runId}:${key}`;
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    mem.set(`tab:${storageKey}`, JSON.stringify(value));
  }
}
