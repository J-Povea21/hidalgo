/** Images under `<run>/images/`, named by content hash so the same image is stored once. */
import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImageStore } from '../../kernel/ports.ts';
import { writeAtomic } from './files.ts';

const EXT: Record<string, string> = { webp: 'webp', png: 'png', jpeg: 'jpg', gif: 'gif' };

export class FsImageStore implements ImageStore {
  private dirs = new Map<string, string>();

  constructor(private readonly folderOf: (runId: string) => Promise<string | undefined>) {}

  private async dir(runId: string): Promise<string> {
    const cached = this.dirs.get(runId);
    if (cached) return cached;
    const d = await this.folderOf(runId);
    if (!d) throw new Error(`no folder for run ${runId}`);
    const dir = join(d, 'images');
    this.dirs.set(runId, dir);
    return dir;
  }

  async save(runId: string, dataUrl: string): Promise<string> {
    const m = /^data:image\/(webp|png|jpeg|gif);base64,(.*)$/s.exec(dataUrl);
    if (!m) throw new Error('not an image data URL');
    const bytes = Buffer.from(m[2]!, 'base64');
    const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 24)}.${EXT[m[1]!]}`;
    const file = join(await this.dir(runId), name);
    const exists = await stat(file).then(() => true, () => false);
    if (!exists) await writeAtomic(file, bytes);
    return name;
  }

  async usedBytes(runId: string): Promise<number> {
    const dir = await this.dir(runId);
    const names = await readdir(dir).catch(() => [] as string[]);
    let total = 0;
    for (const n of names) total += (await stat(join(dir, n))).size;
    return total;
  }

  async path(runId: string, name: string): Promise<string> {
    if (!/^[a-f0-9]{24}\.(webp|png|jpg|gif)$/.test(name)) throw new Error('bad image name');
    return join(await this.dir(runId), name);
  }
}
