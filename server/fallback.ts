import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';

const METERS_PER_MINUTE = 850;

export type IsochroneRequest = {
  locations: number[][] | number[];
  range: number[];
  range_type?: string;
};

export type MatrixRequest = {
  locations: number[][];
  sources?: number[] | string;
  destinations?: number[] | string;
  metrics?: string[];
};

type OrsFeatureProperties = {
  group_index: number;
  value: number;
  center: number[];
};

function toLonLat(input: number[] | number[][]): number[] {
  return Array.isArray(input[0]) ? (input as number[][])[0] : (input as number[]);
}

function destination(lon: number, lat: number, bearingDeg: number, meters: number): number[] {
  const r = 6371008.8;
  const br = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const angular = meters / r;
  const nextLat = Math.asin(
    Math.sin(latRad) * Math.cos(angular) + Math.cos(latRad) * Math.sin(angular) * Math.cos(br),
  );
  const nextLon =
    lonRad +
    Math.atan2(
      Math.sin(br) * Math.sin(angular) * Math.cos(latRad),
      Math.cos(angular) - Math.sin(latRad) * Math.sin(nextLat),
    );
  return [(+((nextLon * 180) / Math.PI).toFixed(6)), +((nextLat * 180) / Math.PI).toFixed(6)];
}

export function haversineKm(a: number[], b: number[]): number {
  const r = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function circle(lon: number, lat: number, minutes: number): Polygon {
  const radius = minutes * METERS_PER_MINUTE;
  const ring = Array.from({ length: 65 }, (_, i) => destination(lon, lat, (i * 360) / 64, radius));
  ring[64] = ring[0];
  return { type: 'Polygon', coordinates: [ring] };
}

export function fallbackIsochrones(body: IsochroneRequest): FeatureCollection {
  const center = toLonLat(body.locations);
  const ranges = body.range ?? [10, 20, 30, 45, 60];
  const minutes = ranges.map((v) => (body.range_type === 'distance' ? v / 1000 / 0.85 : v / 60));
  const features: Feature<Polygon, OrsFeatureProperties>[] = minutes.map((minute, groupIndex) => ({
    type: 'Feature',
    geometry: circle(center[0], center[1], minute),
    properties: { group_index: groupIndex, value: ranges[groupIndex], center },
  }));
  return { type: 'FeatureCollection', features };
}

export function fallbackMatrix(body: MatrixRequest): {
  durations: number[][];
  distances: number[][];
} {
  const locations = body.locations;
  const sources = Array.isArray(body.sources) ? body.sources : locations.map((_, i) => i);
  const destinations = Array.isArray(body.destinations)
    ? body.destinations
    : locations.map((_, i) => i);
  const durations = sources.map((s) =>
    destinations.map((d) => {
      const km = haversineKm(locations[s], locations[d]);
      return Math.round((km / 45) * 3600 + 60);
    }),
  );
  const distances = sources.map((s) =>
    destinations.map((d) => Math.round(haversineKm(locations[s], locations[d]) * 1000)),
  );
  return { durations, distances };
}

type CommuneApi = {
  nom: string;
  code: string;
  population: number | null;
  centre?: { coordinates: number[] };
};

export async function fallbackGeocode(query: string): Promise<FeatureCollection> {
  if (query.trim().length < 2) return { type: 'FeatureCollection', features: [] };
  const url = new URL('https://geo.api.gouv.fr/communes');
  url.searchParams.set('nom', query.trim());
  url.searchParams.set('fields', 'nom,code,population,centre');
  url.searchParams.set('limit', '6');
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`geocoding unavailable (${response.status})`);
  const communes = (await response.json()) as CommuneApi[];
  const features: Feature<Point>[] = communes
    .filter((c) => c.centre)
    .map((c) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: c.centre!.coordinates },
      properties: {
        label: `${c.nom} (${c.code.slice(0, 2)})`,
        name: c.nom,
        code: c.code,
        population: c.population ?? 0,
      },
    }));
  return { type: 'FeatureCollection', features };
}
