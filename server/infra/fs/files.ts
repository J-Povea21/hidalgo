/** Small filesystem helpers: user-only permissions and writes that are never seen half done. */
import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

/** Writes to a temporary file, flushes it, and renames it over the target. */
export async function writeAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await ensureDir(dirname(file));
  const tmp = join(dirname(file), `.${randomBytes(6).toString('hex')}.tmp`);
  const fh = await open(tmp, 'w', 0o600);
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, file);
}

/** Appends one line and flushes it to disk before returning. */
export async function appendLine(file: string, line: string): Promise<void> {
  await ensureDir(dirname(file));
  const fh = await open(file, 'a', 0o600);
  try {
    await fh.appendFile(`${line}\n`);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

export async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function removeTree(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

/** A folder-safe version of a project name ("Mi Titulo" → "mi-titulo"). */
export const slug = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'project';
