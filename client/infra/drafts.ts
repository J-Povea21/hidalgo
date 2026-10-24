/**
 * What the user typed or picked but hasn't sent, kept in this browser per run,
 * so a reload, a dropped connection or a moved page loses nothing. Storage can
 * be unavailable (private windows); then drafts simply live in memory.
 */
const mem = new Map<string, string>();

export function loadDraft<T>(runId: string, key: string, fallback: T): T {
  const k = `wb:${runId}:${key}`;
  try {
    const v = localStorage.getItem(k);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    const v = mem.get(k);
    return v === undefined ? fallback : (JSON.parse(v) as T);
  }
}

export function saveDraft(runId: string, key: string, value: unknown): void {
  const k = `wb:${runId}:${key}`;
  const empty = value === '' || value === undefined || (typeof value === 'object' && value !== null && !Object.keys(value).length);
  try {
    if (empty) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(value));
  } catch {
    if (empty) mem.delete(k);
    else mem.set(k, JSON.stringify(value));
  }
}
