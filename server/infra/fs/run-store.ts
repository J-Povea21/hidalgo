/**
 * Runs on disk: `runs/<project>/<run id>/run.json` holds the state and the
 * run's token. The token stays here and in memory: no tool returns it, and the
 * state the page receives never includes it.
 */
import { randomBytes } from 'node:crypto';
import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunState } from '@shared/contract.ts';
import type { RunStore } from '@server/kernel/ports.ts';
import { readJson, removeTree, slug, writeAtomic } from './files.ts';

/** `ownerPid`: the Claude Code process last serving the run, so a /mcp reconnect can serve it again. */
interface RunFile { token: string; port?: number; ownerPid?: number; state: RunState }

export class FsRunStore implements RunStore {
  /** run id → its folder, learned on save or found by scanning. */
  private dirs = new Map<string, string>();
  private files = new Map<string, RunFile>();

  constructor(private readonly root: string) {}

  private async dirOf(runId: string): Promise<string | undefined> {
    const known = this.dirs.get(runId);
    if (known) return known;
    for (const project of await readdir(join(this.root, 'runs')).catch(() => [] as string[])) {
      const dir = join(this.root, 'runs', project, runId);
      if (await access(join(dir, 'run.json')).then(() => true, () => false)) {
        this.dirs.set(runId, dir);
        return dir;
      }
    }
    return undefined;
  }

  async folder(runId: string): Promise<string | undefined> {
    return this.dirOf(runId);
  }

  private async file(runId: string): Promise<RunFile | undefined> {
    const cached = this.files.get(runId);
    if (cached) return cached;
    const dir = await this.dirOf(runId);
    const f = dir ? await readJson<RunFile>(join(dir, 'run.json')) : undefined;
    if (f) this.files.set(runId, f);
    return f;
  }

  async load(runId: string): Promise<RunState | undefined> {
    const f = await this.file(runId);
    return f && structuredClone(f.state);
  }

  async save(run: RunState): Promise<void> {
    const dir = (await this.dirOf(run.id)) ?? join(this.root, 'runs', slug(run.project), run.id);
    this.dirs.set(run.id, dir);
    const prev = await this.file(run.id);
    const next: RunFile = {
      token: prev?.token ?? randomBytes(32).toString('base64url'),
      ...(prev?.port ? { port: prev.port } : {}),
      ...(prev?.ownerPid ? { ownerPid: prev.ownerPid } : {}),
      state: run,
    };
    await writeAtomic(join(dir, 'run.json'), JSON.stringify(next));
    this.files.set(run.id, next);
  }

  async list(project?: string): Promise<RunState[]> {
    const projects = project ? [slug(project)] : await readdir(join(this.root, 'runs')).catch(() => [] as string[]);
    const runs: RunState[] = [];
    for (const p of projects) {
      for (const id of await readdir(join(this.root, 'runs', p)).catch(() => [] as string[])) {
        const f = await readJson<RunFile>(join(this.root, 'runs', p, id, 'run.json'));
        if (f) runs.push(f.state);
      }
    }
    return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async remove(runId: string): Promise<void> {
    const dir = await this.dirOf(runId);
    if (dir) await removeTree(dir);
    this.dirs.delete(runId);
    this.files.delete(runId);
  }

  /** The run's token, created with the run and stable across resumes. */
  async token(runId: string): Promise<string | undefined> {
    return (await this.file(runId))?.token;
  }

  /** The port the run was last served on, so a restored tab can reconnect. */
  async port(runId: string): Promise<number | undefined> {
    return (await this.file(runId))?.port;
  }

  /** Where and for whom the run is served now: its port for a restored tab, its owner for a reconnect. */
  async rememberServing(runId: string, port: number, ownerPid: number): Promise<void> {
    const f = await this.file(runId);
    const dir = await this.dirOf(runId);
    if (!f || !dir || (f.port === port && f.ownerPid === ownerPid)) return;
    const next = { ...f, port, ownerPid };
    await writeAtomic(join(dir, 'run.json'), JSON.stringify(next));
    this.files.set(runId, next);
  }

  /**
   * When a page was last seen connected to the run, in its own small file: it is written on
   * every heartbeat, and run.json is not, so the state file never churns for it.
   */
  async noteViewer(runId: string, at: string): Promise<void> {
    const dir = await this.dirOf(runId);
    if (dir) await writeAtomic(join(dir, 'viewer.json'), JSON.stringify({ at }));
  }

  async lastViewer(runId: string): Promise<string | undefined> {
    const dir = await this.dirOf(runId);
    return dir ? (await readJson<{ at: string }>(join(dir, 'viewer.json')))?.at : undefined;
  }

  /** Runs not closed that this Claude Code process was serving before its workbench restarted. */
  async ownedBy(ownerPid: number): Promise<string[]> {
    const ids: string[] = [];
    for (const project of await readdir(join(this.root, 'runs')).catch(() => [] as string[])) {
      for (const id of await readdir(join(this.root, 'runs', project)).catch(() => [] as string[])) {
        const f = await readJson<RunFile>(join(this.root, 'runs', project, id, 'run.json'));
        if (f && f.ownerPid === ownerPid && f.state.status !== 'closed') ids.push(id);
      }
    }
    return ids;
  }
}
