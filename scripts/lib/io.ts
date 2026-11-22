import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CACHE_DIR = fileURLToPath(new URL('../../.cache/', import.meta.url));
export const DATA_DIR = fileURLToPath(new URL('../../public/data/', import.meta.url));

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value)}\n`, 'utf8');
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function cachedText(
  name: string,
  url: string,
  options: RequestInit = {},
  ttlMs = 7 * 24 * 3600 * 1000,
): Promise<string> {
  await mkdir(CACHE_DIR, { recursive: true });
  const key = createHash('sha256').update(`${name}:${url}:${JSON.stringify(options)}`).digest('hex');
  const file = `${CACHE_DIR}${key}.txt`;
  try {
    const { mtime, size } = await stat(file);
    if (size > 0 && Date.now() - mtime.getTime() < ttlMs) return readFile(file, 'utf8');
  } catch {
    /* pas de cache */
  }
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(120000),
    headers: { 'User-Agent': 'onde-de-soins/1.0', Accept: '*/*', ...options.headers },
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status} sur ${url}`);
  const text = await response.text();
  await writeFile(file, text, 'utf8');
  return text;
}

export async function cachedJson<T>(name: string, url: string, options?: RequestInit): Promise<T> {
  return JSON.parse(await cachedText(name, url, options)) as T;
}

export function parseDelimited(text: string, separator: string, startLine = 0): string[][] {
  return text
    .split(/\r?\n/)
    .slice(startLine)
    .filter((line) => line.length > 0)
    .map((line) => line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, '')));
}
