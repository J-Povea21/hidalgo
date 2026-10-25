/**
 * The composition root: builds every adapter, hands them to the modules, and
 * owns the process-level jobs (the HTTP port, heartbeats, cleanup, shutdown).
 */
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { serve, type ServerType } from '@hono/node-server';
import type { RunState } from '@shared/contract.ts';
import { expired, liveEntry } from '@server/runs/domain/live-entry.ts';
import type { PagePublisher } from '@server/common/ports/page-publisher.port.ts';
import type { Limits } from '@server/page-events/domain/limits.ts';
import type { EventSignal } from '@server/page-events/domain/ports/event-signal.port.ts';
import { MemorySignal } from '@server/page-events/infrastructure/memory-signal.ts';
import { buildModules, type Modules } from './modules.ts';
import { FsEventLog } from '@server/common/infrastructure/fs/event-log.ts';
import { FsImageStore } from '@server/page-events/infrastructure/fs/image-store.ts';
import { FsLiveIndex, ownStart } from '@server/runs/infrastructure/fs/live-index.ts';
import { FsRunStore } from '@server/common/infrastructure/fs/run-store.ts';
import { createApp } from '@server/common/infrastructure/http/app.ts';
import { PageHub } from '@server/common/infrastructure/http/hub.ts';
import { MemoryRunLock, RandomIds, SystemClock } from '@server/common/infrastructure/runtime.ts';
import { RUN_STATUS } from '@shared/values.ts';

/** A page seen connected within this long is probably still open and retrying. */
const RECENT_VIEWER_MS = 10 * 60_000;
const REATTACH_WAIT_MS = 17_000;

export interface WorkbenchConfig {
  dataRoot: string;
  clientDir: string;
  limits: Limits;
  retentionDays: number;
  heartbeatMs: number;
  /**
   * How long a resume waits for a page that was connected recently to come back on its own
   * before opening a new tab. Covers the page's longest gap between retries (15 s).
   */
  reattachWaitMs?: number;
  /** How long shutdown waits for the goodbye to reach the pages. 0 in tests. */
  goodbyeGraceMs?: number;
  /** Open the page in the browser; replaced in tests. */
  openBrowser?: (url: string) => void;
  /** The owning Claude Code process; defaults to our parent. Set in tests to act as another session. */
  ownerPid?: number;
}

export const DEFAULT_LIMITS: Limits = {
  imageBytesPerRun: 50 * 1024 * 1024,
  imageWarnBytes: 40 * 1024 * 1024,
  // Under the 30-minute idle limit Claude Code applies to stdio tool calls.
  waitTimeoutMs: 25 * 60 * 1000,
};

/** How each OS opens an address in the default browser; anything else is assumed to have xdg-open. */
const BROWSER_OPENER: Partial<Record<NodeJS.Platform, (url: string) => [string, string[]]>> = {
  darwin: (url) => ['open', [url]],
  win32: (url) => ['cmd', ['/c', 'start', '', url]],
};

export function openInBrowser(url: string): void {
  const [command, args] = BROWSER_OPENER[process.platform]?.(url) ?? ['xdg-open', [url]];
  spawn(command, args, { stdio: 'ignore', detached: true }).unref();
}

export class Workbench {
  readonly clock = new SystemClock();
  /** When this server started: a page last seen before it may still be retrying to reach it. */
  private readonly bornAt = Date.parse(this.clock.now());
  readonly ids = new RandomIds();
  readonly lock = new MemoryRunLock();
  readonly hub = new PageHub();
  readonly store: FsRunStore;
  readonly log: FsEventLog;
  readonly images: FsImageStore;
  readonly live: FsLiveIndex;
  readonly signal: EventSignal;
  readonly page: PagePublisher;
  readonly limits: Limits;
  /** Every module's use cases, wired to the adapters above. */
  readonly modules: Modules;

  private readonly ownerPid: number;
  private readonly startedAt = ownStart();
  private readonly tokens = new Map<string, string>();
  private readonly served = new Set<string>();
  private readonly activeAt = new Map<string, number>();
  private http?: ServerType;
  /** Bound once; concurrent first calls to serve() share this instead of each binding a server. */
  private listening?: Promise<number>;
  private port = 0;
  private heartbeat?: NodeJS.Timeout;

  constructor(private readonly config: WorkbenchConfig) {
    this.limits = config.limits;
    this.ownerPid = config.ownerPid ?? process.ppid;
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
      if (cur) {
        this.hub.publish(cur);
      }
      void this.beat(id);
    };
    this.signal = {
      ring: (id) => bell.ring(id),
      waiting: (id) => bell.waiting(id),
      wait: async (id, ms) => {
        const woken = bell.wait(id, ms);
        announce(id);
        try {
          return await woken;
        } finally {
          announce(id);
        }
      },
    };
    this.page = {
      publish: (run) => {
        this.hub.publish(run);
        void this.beatRun(run);
      },
    };
    this.hub.onViewer = (id) => void this.noteViewer(id);
    this.modules = buildModules(this);
  }

  /** The run's page: this server's port, and the run's token in the fragment. */
  pageUrl(runId: string): string {
    const token = this.tokens.get(runId);
    if (!token) {
      throw new Error(`run ${runId} has no token loaded`);
    }
    return `http://127.0.0.1:${this.port}/#run=${encodeURIComponent(runId)}&t=${token}`;
  }

  /** Binds the page's port on first use, preferring the one a resumed run used before. */
  async serve(runId: string): Promise<void> {
    const token = await this.store.token(runId);
    if (!token) {
      throw new Error(`run ${runId} has no token and can't be served`);
    }
    this.tokens.set(runId, token);
    this.listening ??= this.store
      .port(runId)
      .then((preferred) => this.listen(preferred ?? 0).catch(() => this.listen(0)));
    this.port = await this.listening;
    await this.store.rememberServing(runId, this.port, this.ownerPid);
    this.served.add(runId);
    await this.beat(runId);
    this.heartbeat ??= setInterval(() => {
      for (const id of this.served) {
        void this.beat(id);
      }
    }, this.config.heartbeatMs);
  }

  private listen(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const app = createApp({
        port: () => this.port,
        // Only runs this server serves: it never signs or accepts a token it merely finds on disk.
        token: async (id) => (this.served.has(id) ? this.tokens.get(id) : undefined),
        hub: this.hub,
        ensureState: async (id) => {
          if (this.hub.current(id)) {
            return;
          }
          const run = await this.store.load(id);
          if (run) {
            this.hub.publish(run);
          }
        },
        recordEvent: (id, event) => this.modules.pageEvents.recordPageEvent.execute({ runId: id, event }),
        imageFile: (id, name) => this.images.path(id, name),
        liveRuns: () => this.live.alive(),
        claudeListening: (id) => this.signal.waiting(id),
        claudeActiveAt: (id) => this.activeAt.get(id),
        clientDir: this.config.clientDir,
      });
      const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info: AddressInfo) => {
        this.http = server;
        resolve(info.port);
      });
      server.once('error', reject);
    });
  }

  /** Rewrites the run's live entry. Never throws: a missed heartbeat is retried on the next one. */
  private async beatRun(run: RunState): Promise<void> {
    if (!this.served.has(run.id) || !this.port) {
      return;
    }
    try {
      await this.live.write(
        liveEntry(
          run,
          {
            port: this.port,
            pid: process.pid,
            processStartedAt: this.startedAt,
            url: this.pageUrl(run.id),
            ownerPid: this.ownerPid,
            claudeListening: this.signal.waiting(run.id),
          },
          this.clock.now(),
        ),
      );
    } catch {
      // the next heartbeat tries again
    }
  }

  private async beat(runId: string): Promise<void> {
    const run = this.hub.current(runId) ?? (await this.store.load(runId));
    if (run) {
      await this.beatRun(run);
    }
    if (this.hub.viewers(runId) > 0) {
      await this.noteViewer(runId);
    }
  }

  private noteViewer(runId: string): Promise<void> {
    return this.store.noteViewer(runId, this.clock.now()).catch(() => undefined);
  }

  /**
   * How many pages are connected to the run, giving one that was connected to the previous
   * server recently the time to reconnect by itself: a resume should reuse that tab, not open
   * a second one while the first sits between retries. A page this server saw leave is gone.
   */
  async reattach(runId: string): Promise<number> {
    if (this.hub.viewers(runId) > 0) {
      return this.hub.viewers(runId);
    }
    const seen = Date.parse((await this.store.lastViewer(runId)) ?? '');
    if (!(seen < this.bornAt) || Date.parse(this.clock.now()) - seen > RECENT_VIEWER_MS) {
      return 0;
    }
    await this.hub.waitForViewer(runId, this.config.reattachWaitMs ?? REATTACH_WAIT_MS);
    return this.hub.viewers(runId);
  }

  /**
   * Serves a run any tool touches, so a page left open from before a restart
   * reconnects (on the run's old port when it's free) and sees the change.
   */
  async ensureServed(runId: string): Promise<void> {
    if (this.served.has(runId)) {
      return;
    }
    const run = await this.store.load(runId);
    if (run && run.status !== RUN_STATUS.closed) {
      await this.serve(runId);
    }
  }

  /**
   * After a /mcp reconnect, Claude Code starts a new workbench under the same
   * process: serve again the runs that process had open, so their tabs come
   * back by themselves. Only one port can be reclaimed per server; other tabs
   * say the run moved and get a fresh page on resume.
   */
  async reserveOwnRuns(): Promise<string[]> {
    const ids = await this.store.ownedBy(this.ownerPid);
    for (const id of ids) {
      await this.serve(id).catch(() => undefined);
    }
    return ids;
  }

  /** Claude just called a tool on the run: the page shows "working" for a while after. */
  markActive(runId: string): void {
    this.activeAt.set(runId, Date.now());
  }

  open(url: string): void {
    (this.config.openBrowser ?? openInBrowser)(url);
  }

  /** Closed runs past retention are deleted; open and paused runs are the user's to decide. */
  async sweep(): Promise<string[]> {
    const gone = expired(await this.store.list(), this.clock.now(), this.config.retentionDays);
    for (const id of gone) {
      await this.store.remove(id);
    }
    return gone;
  }

  /** The session ended normally: tell every page, take the live entries down, stop serving. */
  async shutdown(reason: string): Promise<void> {
    this.hub.goodbye(reason);
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
    }
    for (const id of this.served) {
      await this.live.remove(id).catch(() => undefined);
    }
    const grace = this.config.goodbyeGraceMs ?? 150;
    if (grace) {
      await new Promise((resolve) => setTimeout(resolve, grace));
    }
    this.http?.close();
  }

  get boundPort(): number {
    return this.port;
  }
}
