const BASE = 'https://valhalla1.openstreetmap.de';
const CLIENT = process.env.VALHALLA_CLIENT_ID ?? 'onde-de-soins-demo';
const MAX_CONTOURS = 4;

type LonLat = [number, number];
type Feature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, GeoJSON.GeoJsonProperties>;

function toValhalla(point: LonLat) {
  return { lat: point[1], lon: point[0] };
}

async function callValhalla(action: string, payload: unknown): Promise<unknown> {
  const url = `${BASE}/${action}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': CLIENT,
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000),
    });
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      continue;
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Valhalla ${response.status}: ${detail.slice(0, 160)}`);
    }
    return response.json();
  }
  throw new Error('Valhalla unavailable after 3 attempts');
}

type MatrixBody = {
  locations: LonLat[];
  sources?: number[] | string;
  destinations?: number[] | string;
};

export async function valhallaMatrix(body: MatrixBody) {
  const indices = body.locations.map((_, index) => index);
  const sources = Array.isArray(body.sources) ? body.sources : indices;
  const destinations = Array.isArray(body.destinations) ? body.destinations : indices;
  const result = (await callValhalla('sources_to_targets', {
    sources: sources.map((index) => toValhalla(body.locations[index])),
    targets: destinations.map((index) => toValhalla(body.locations[index])),
    costing: 'auto',
    units: 'kilometers',
  })) as { sources_to_targets: { time: number; distance: number }[][] };

  return {
    durations: result.sources_to_targets.map((row) => row.map((cell) => Math.round(cell.time))),
    distances: result.sources_to_targets.map((row) =>
      row.map((cell) => Math.round(cell.distance * 1000)),
    ),
  };
}

type IsochroneBody = { locations: LonLat[]; range: number[] };

export function isoPayload(body: IsochroneBody) {
  return {
    locations: body.locations.slice(0, 1).map(toValhalla),
    costing: 'auto',
    contours: body.range.map((seconds) => ({ time: seconds / 60 })),
    polygons: true,
    denoise: 0.1,
  };
}

export function toOrsFeatures(result: { features?: Feature[] }, range: number[]) {
  return (result.features ?? []).map((feature) => {
    const contour = Number(feature.properties?.contour);
    return {
      ...feature,
      properties: {
        ...feature.properties,
        value: contour * 60,
        group_index: range.findIndex((seconds) => seconds / 60 === contour),
      },
    };
  });
}

async function isoChunk(body: IsochroneBody, offset: number) {
  const group = body.range.slice(offset, offset + MAX_CONTOURS);
  const result = (await callValhalla('isochrone', {
    ...isoPayload(body),
    contours: group.map((seconds) => ({ time: seconds / 60 })),
  })) as { features?: Feature[] };
  return toOrsFeatures(result, body.range);
}

export async function valhallaIsochrones(body: IsochroneBody) {
  const features: Feature[] = [];
  for (let offset = 0; offset < body.range.length; offset += MAX_CONTOURS) {
    features.push(...(await isoChunk(body, offset)));
    if (offset + MAX_CONTOURS < body.range.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  return { type: 'FeatureCollection' as const, features };
}
