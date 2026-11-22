import type { IncomingMessage, ServerResponse } from 'node:http';
import { fallbackGeocode, fallbackIsochrones, fallbackMatrix } from './fallback.ts';
import { valhallaIsochrones, valhallaMatrix } from './freeRouting.ts';

function orsBase(): string {
  return (process.env.ORS_BASE_URL ?? 'https://api.openrouteservice.org').replace(/\/$/, '');
}

const TTL_MS = 6 * 60 * 60 * 1000;
const ALLOWED = /^(geocode|isochrones|matrix)\/[a-z-]+$/;
const cache = new Map<string, { at: number; body: unknown; mode: string; provider: string }>();

export function orsApiKey(): string | undefined {
  const key = process.env.ORS_API_KEY?.trim();
  return key && !key.includes('VOTRE_') && key !== 'ors-test-key' ? key : undefined;
}

function send(res: ServerResponse, status: number, body: unknown, mode: string, provider: string): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-ORS-Mode', mode);
  res.setHeader('X-Routing-Provider', provider);
  res.setHeader('Content-Length', Buffer.byteLength(payload));
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

async function liveRequest(
  path: string,
  method: string,
  query: URLSearchParams,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL(`${orsBase()}/v2/${path}`);
  query.forEach((value, key) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: orsApiKey()!,
      Accept: 'application/json, application/geo+json',
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`ORS ${response.status}`);
  return response.json();
}

async function freeRequest(path: string, query: URLSearchParams, body: Record<string, unknown>) {
  if (path.startsWith('geocode/')) return fallbackGeocode(query.get('text') ?? '');
  if (path.startsWith('isochrones/')) return valhallaIsochrones(body as never);
  if (path.startsWith('matrix/')) return valhallaMatrix(body as never);
  throw new Error(`endpoint non pris en charge : ${path}`);
}

function estimateRequest(path: string, query: URLSearchParams, body: Record<string, unknown>) {
  if (path.startsWith('geocode/')) return fallbackGeocode(query.get('text') ?? '');
  if (path.startsWith('isochrones/')) return fallbackIsochrones(body as never);
  if (path.startsWith('matrix/')) return fallbackMatrix(body as never);
  throw new Error(`endpoint non pris en charge : ${path}`);
}

async function resolve(
  path: string,
  method: string,
  query: URLSearchParams,
  body: Record<string, unknown>,
): Promise<{ body: unknown; mode: string; provider: string }> {
  if (orsApiKey()) {
    try {
      return { body: await liveRequest(path, method, query, body), mode: 'live', provider: 'ors' };
    } catch {
      /* bascule sur le moteur gratuit */
    }
  }
  try {
    return { body: await freeRequest(path, query, body), mode: 'live', provider: 'valhalla' };
  } catch {
    return { body: estimateRequest(path, query, body), mode: 'estimate', provider: 'estimate' };
  }
}

export async function handleOrsRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname.replace(/^\/api\/ors\//, '').replace(/\/$/, '');
  const method = req.method === 'POST' ? 'POST' : 'GET';
  if (!ALLOWED.test(path)) {
    send(res, 400, { error: 'Endpoint not allowed' }, 'none', 'none');
    return;
  }

  const body = method === 'POST' ? await readBody(req).catch(() => ({})) : {};
  const cacheKey = `${method}:${path}:${url.search}:${JSON.stringify(body)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL_MS) {
    send(res, 200, cached.body, cached.mode, cached.provider);
    return;
  }

  try {
    const result = await resolve(path, method, url.searchParams, body);
    if (cache.size > 400) cache.clear();
    cache.set(cacheKey, { ...result, at: Date.now() });
    send(res, 200, result.body, result.mode, result.provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'erreur inconnue';
    send(res, 502, { error: message }, 'none', 'none');
  }
}
