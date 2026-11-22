import { NEAREST_COUNT } from '../config.ts';
import type { CareType, Etablissement, Mode, TravelTimes } from '../types.ts';

type OrsResponse<T> = { data: T; mode: Mode };

async function request<T>(url: string, init?: RequestInit): Promise<OrsResponse<T>> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `Network error ${response.status}`);
  }
  const mode = (response.headers.get('X-ORS-Mode') ?? 'estimate') as Mode;
  return { data: (await response.json()) as T, mode };
}

export function postOrs<T>(path: string, body: unknown): Promise<OrsResponse<T>> {
  return request<T>(`/api/ors/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function getOrs<T>(path: string, params: Record<string, string>): Promise<OrsResponse<T>> {
  const url = new URL(`/api/ors/${path}`, window.location.origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return request<T>(url.toString());
}

function distanceKm(a: [number, number], b: [number, number]): number {
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearestSites(point: [number, number], sites: Etablissement[]): Etablissement[] {
  return [...sites]
    .sort((a, b) => distanceKm(point, a.coordinates) - distanceKm(point, b.coordinates))
    .slice(0, NEAREST_COUNT);
}

type MatrixResponse = { durations: number[][] };

export async function fetchTravelTimes(
  point: [number, number],
  establishments: Etablissement[],
  types: CareType[],
): Promise<{ times: TravelTimes; mode: Mode }> {
  const times: TravelTimes = { maternite: null, urgences: null, medecin: null };
  let mode: Mode = 'live';
  await Promise.all(
    types.map(async (type) => {
      const sites = nearestSites(point, establishments.filter((item) => item.type === type));
      if (sites.length === 0) return;
      const locations = [point, ...sites.map((site) => site.coordinates)];
      const result = await postOrs<MatrixResponse>('matrix/driving-car', {
        locations,
        sources: [0],
        destinations: sites.map((_, index) => index + 1),
        metrics: ['duration'],
      });
      const durations = result.data.durations?.[0] ?? [];
      const valid = durations.filter((value) => Number.isFinite(value));
      times[type] = valid.length ? Math.round(Math.min(...valid) / 60) : null;
      if (result.mode === 'estimate') mode = 'estimate';
    }),
  );
  return { times, mode };
}

export type IsochroneFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

export async function fetchSimulationIsochrones(
  point: [number, number],
): Promise<{ features: IsochroneFeature[]; mode: Mode }> {
  const result = await postOrs<GeoJSON.FeatureCollection>('isochrones/driving-car', {
    locations: [point],
    range: [600, 1200, 1800, 2700, 3600],
    range_type: 'time',
    units: 'km',
    smoothing: 25,
  });
  const features = (result.data.features ?? []).filter(
    (feature) => feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon',
  ) as IsochroneFeature[];
  return { features, mode: result.mode };
}

export type GeocodeResult = { label: string; name: string; code: string; coordinates: [number, number] };

export async function geocode(query: string): Promise<GeocodeResult[]> {
  try {
    const result = await getOrs<GeoJSON.FeatureCollection<GeoJSON.Point>>('geocode/autocomplete', {
      text: query,
      size: '6',
    });
    return (result.data.features ?? []).map((feature) => {
      const properties = feature.properties ?? {};
      return {
        label: String(properties.label ?? properties.name ?? query),
        name: String(properties.name ?? query),
        code: String(properties.postcode ?? ''),
        coordinates: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]],
      };
    });
  } catch {
    return [];
  }
}
