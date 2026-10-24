/**
 * The composition root: builds every adapter, hands them to the slices, and
 * owns the process-level jobs (the HTTP port, heartbeats, cleanup, shutdown).
 */
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { serve, type ServerType } from '@hono/node-server';
import type { RunState } from '../../shared/contract.ts';
import { expired, liveEntry } from '../features/live-index/live-index.ts';
import type { EventSignal, Limits, PageAddress, PagePublisher } from '../kernel/ports.ts';
import { FsEventLog } from './fs/event-log.ts';
import { FsImageStore } from './fs/image-store.ts';
import { FsLiveIndex, ownStart } from './fs/live-index.ts';
import { FsRunStore } from './fs/run-store.ts';
import { createApp } from './http/app.ts';
import { PageHub } from './http/hub.ts';
import { MemorySignal, randomIds, systemClock } from './runtime.ts';

export interface WorkbenchConfig {
  dataRoot: string;
  clientDir: string;
  limits: Limits;
  retentionDays: number;
  heartbeatMs: number;
  /** Open the page in the browser; replaced in tests. */
  openBrowser?: (url: string) => void;
}

export const DEFAULT_LIMITS: Limits = {
  imageBytesPerRun: 50 * 1024 * 1024,
  imageWarnBytes: 40 * 1024 * 1024,
  // Under the 30-minute idle limit Claude Code applies to stdio tool calls.
  waitTimeoutMs: 25 * 60 * 1000,
};

export function openInBrowser(url: string): void {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  spawn(cmd as string, args as string[], { stdio: 'ignore', detached: true }).unref();
}

export class Workbench {
  readonly clock = systemClock;
  readonly ids = randomIds;
  readonly store: FsRunStore;
  readonly log: FsEventLog;
  readonly images: FsImageStore;
  readonly live: FsLiveIndex;
  readonly hub = new PageHub();
  readonly signal: EventSignal;
  readonly page: PagePublisher;
  readonly address: PageAddress;
  readonly limits: Limits;

  private http?: ServerType;
  private port = 0;
  private served = new Set<string>();
  private heartbeat?: NodeJS.Timeout;
  private readonly startedAt = ownStart();

  constructor(private readonly config: WorkbenchConfig) {
    this.limits = config.limits;
    this.store = new FsRunStore(config.dataRoot);
    const folderOf = (id: string) => this.store.folder(id);
    this.log = new FsEventLog(folderOf);
    this.images = new FsImageStore(folderOf);
    this.live = new FsLiveIndex(join(config.dataRoot, 'live'), this.clock);

    // A wait starting or ending changes "whose turn" for the page and what the Stop hook must
    // see. Republish and rewrite the live entry the moment it registers, not on the next tick:
    // the state pushed just before the wait still carried waiting=false.
    const bell = new MemorySignal();
    const announce = (id: string) => {
      const cur = this.hub.current(id);
      if (cur) this.hub.publish(cur);
      void this.beat(id);
    };
    this.signal = {
      ring: (id) => bell.ring(id),
      waiting: (id) => bell.waiting(id),
      wait: async (id, ms) => {
        const p = bell.wait(id, ms);
        announce(id);
        try { return await p; } finally { announce(id); }
      },
    };
    this.page = { publish: (run) => { this.hub.publish(run); void this.beatRun(run); } };
    this.address = { url: (runId) => this.urlOf(runId) };
  }

  private urlOf(runId: string): string {
    const token = this.tokens.get(runId);
    if (!token) throw new Error(`run ${runId} has no token loaded`);
    return `http://127.0.0.1:${this.port}/#run=${encodeURIComponent(runId)}&t=${token}`;
  }

  private tokens = new Map<string, string>();

  /** Binds the page's port on first use, preferring the one a resumed run used before. */
  async serve(runId: string): Promise<void> {
    const token = await this.store.token(runId);
    if (token) this.tokens.set(runId, token);
    await this.images.open(runId);
    if (!this.http) {
      const preferred = (await this.store.port(runId)) ?? 0;
      this.port = await this.listen(preferred).catch(() => this.listen(0));
    }
    await this.store.rememberPort(runId, this.port);
    this.served.add(runId);
    await this.beat(runId);
    this.heartbeat ??= setInterval(() => { for (const id of this.served) void this.beat(id); }, this.config.heartbeatMs);
  }

  private listen(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const app = createApp({
        port: () => this.port,
        // Only runs this server serves: it never signs or accepts a token it merely finds on disk.
        token: async (id) => (this.served.has(id) ? this.tokens.get(id) : undefined),
        hub: this.hub,
        ensureState: async (id) => {
          if (this.hub.current(id)) return;
          const run = await this.store.load(id);
          if (run) this.hub.publish(run);
        },
        recordEvent: this.recordEvent,
        imageFile: async (id, name) => { await this.images.open(id); return this.images.path(id, name); },
        liveRuns: () => this.live.alive(),
        waiting: (id) => this.signal.waiting(id),
        clientDir: this.config.clientDir,
      });
      const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info: AddressInfo) => resolve(info.port));
      server.once('error', reject);
      this.http = server;
    });
  }

  /** Set by the composition in main.ts once the slices are wired. */
  recordEvent: (runId: string, body: unknown) => Promise<{ seq: number; imageWarning?: string }> = async () => {
    throw new Error('not wired');
  };

  private async beatRun(run: RunState): Promise<void> {
    if (!this.served.has(run.id) || !this.port) return;
    await this.live.write(liveEntry(run, {
      port: this.port, pid: process.pid, processStartedAt: this.startedAt, url: this.urlOf(run.id),
      ownerPid: process.ppid, awaiting: this.signal.waiting(run.id),
    }, this.clock.now())).catch(() => undefined);
  }

  private async beat(runId: string): Promise<void> {
    const run = this.hub.current(runId) ?? (await this.store.load(runId));
    if (run) await this.beatRun(run);
  }

  open(url: string): void {
    (this.config.openBrowser ?? openInBrowser)(url);
  }

  /** Closed runs past retention are deleted; open and paused runs are the user's to decide. */
  async sweep(): Promise<string[]> {
    const gone = expired(await this.store.list(), this.clock.now(), this.config.retentionDays);
    for (const id of gone) await this.store.remove(id);
    return gone;
  }

  /** The session ended normally: tell every page, take the live entries down, stop serving. */
  async shutdown(reason: string): Promise<void> {
    this.hub.goodbye(reason);
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const id of this.served) await this.live.remove(id).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 150)); // let the goodbye reach the pages
    this.http?.close();
  }

  get boundPort(): number {
    return this.port;
  }
}
