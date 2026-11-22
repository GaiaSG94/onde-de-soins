import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { THRESHOLDS } from '../../src/config.ts';
import { isoPayload, toOrsFeatures } from '../../server/freeRouting.ts';
import { cachedText } from './io.ts';

export type Poly = Feature<Polygon | MultiPolygon>;
const ORS_BASE = 'https://api.openrouteservice.org/v2';
const VALHALLA_BASE = 'https://valhalla1.openstreetmap.de/isochrone';
const RANGES = THRESHOLDS.map((minutes) => minutes * 60);

type Engine = 'ors' | 'valhalla' | 'demo';

function key(): string | undefined {
  const value = process.env.ORS_API_KEY?.trim();
  return value && !value.includes('VOTRE_') && value !== 'ors-test-key' ? value : undefined;
}

export function engine(): Engine {
  if (process.env.USE_DEMO_ROUTING === '1') return 'demo';
  return key() ? 'ors' : 'valhalla';
}

export function usesLiveRouting(): boolean {
  return engine() !== 'demo';
}

function destination(lon: number, lat: number, bearing: number, meters: number): number[] {
  const r = 6371008.8;
  const br = (bearing * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  const d = meters / r;
  const nextPhi = Math.asin(Math.sin(phi) * Math.cos(d) + Math.cos(phi) * Math.sin(d) * Math.cos(br));
  const nextLambda =
    lambda +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(phi),
      Math.cos(d) - Math.sin(phi) * Math.sin(nextPhi),
    );
  return [(nextLambda * 180) / Math.PI, (nextPhi * 180) / Math.PI];
}

export function analyticIsochrone(center: [number, number], minutes: number): Poly {
  const ring = Array.from({ length: 97 }, (_, i) => {
    const bearing = (i * 360) / 96;
    const anisotropy = 1 + 0.11 * Math.sin((bearing * Math.PI) / 60) + 0.06 * Math.cos((bearing * Math.PI) / 35);
    return destination(center[0], center[1], bearing, minutes * 850 * anisotropy);
  });
  ring[96] = ring[0];
  return {
    type: 'Feature',
    properties: { value: minutes * 60 },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

export function emptyGroups(): Poly[][] {
  return THRESHOLDS.map(() => []);
}

async function pause(): Promise<void> {
  const delay = Number(process.env.ORS_DELAY_MS ?? 1200);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

function pushFeatures(groups: Poly[][], features: Poly[]): void {
  for (const feature of features) {
    const index = RANGES.findIndex((seconds) => Math.abs(seconds - Number(feature.properties?.value)) < 30);
    if (index >= 0) groups[index].push(feature);
  }
}

async function fetchOrs(location: [number, number], groups: Poly[][]): Promise<void> {
  const raw = await cachedText('ors-iso', `${ORS_BASE}/isochrones/driving-car`, {
    method: 'POST',
    headers: {
      Authorization: key()!,
      'Content-Type': 'application/json',
      Accept: 'application/json, application/geo+json',
    },
    body: JSON.stringify({
      locations: [location.map((value) => +value.toFixed(5))],
      range: RANGES,
      range_type: 'time',
      units: 'km',
      smoothing: 25,
    }),
  });
  pushFeatures(groups, ((JSON.parse(raw) as { features?: Poly[] }).features ?? []));
}

async function fetchValhalla(location: [number, number], groups: Poly[][]): Promise<void> {
  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Id': process.env.VALHALLA_CLIENT_ID ?? 'onde-de-soins-demo',
  };
  for (let offset = 0; offset < RANGES.length; offset += 4) {
    const payload = { ...isoPayload({ locations: [location], range: RANGES }), contours: RANGES.slice(offset, offset + 4).map((seconds) => ({ time: seconds / 60 })) };
    const raw = await cachedText('valhalla-iso', VALHALLA_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    pushFeatures(groups, toOrsFeatures(JSON.parse(raw), RANGES));
    await pause();
  }
}

export async function fetchIsochrones(location: [number, number]): Promise<Poly[][]> {
  const groups = emptyGroups();
  const selected = engine();
  if (selected === 'demo') {
    THRESHOLDS.forEach((minutes, index) => groups[index].push(analyticIsochrone(location, minutes)));
  } else if (selected === 'ors') {
    await fetchOrs(location, groups);
    await pause();
  } else {
    await fetchValhalla(location, groups);
  }
  return groups;
}
