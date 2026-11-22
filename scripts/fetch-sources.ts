import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { simplify } from '@turf/turf';
import type { CareType, Commune, Etablissement } from '../src/types.ts';
import { CACHE_DIR, cachedJson, DATA_DIR, writeJson } from './lib/io.ts';

const code = process.env.DEPARTEMENT_CODE ?? '58';
const name = process.env.DEPARTEMENT_NAME ?? 'Nièvre';
const NEIGHBORS = ['58', '21', '89', '45', '03', '71', '41', '18', '23', '63'];
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

type CommuneApi = {
  nom: string;
  code: string;
  population: number | null;
  centre?: { coordinates: number[] };
  contour?: Polygon | MultiPolygon;
};
type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};
type Maternite = { annee: string; nom_mat: string; com: string; fi_et: string; type: string };

async function fetchBoundary(): Promise<Feature<Polygon | MultiPolygon>> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', `${name}, France`);
  url.searchParams.set('format', 'geojson');
  url.searchParams.set('polygon_geojson', '1');
  url.searchParams.set('limit', '1');
  const result = await cachedJson<{ features: Feature<Polygon | MultiPolygon>[] }>('nominatim', url.toString());
  const feature = result.features.find((f) => ['Polygon', 'MultiPolygon'].includes(f.geometry?.type ?? ''));
  if (!feature) throw new Error(`Contour introuvable pour ${name}`);
  return simplify(feature, { tolerance: 0.008, highQuality: true }) as Feature<Polygon | MultiPolygon>;
}

async function fetchCommunes(): Promise<{ list: Commune[]; raw: CommuneApi[] }> {
  const url = new URL('https://geo.api.gouv.fr/communes');
  url.searchParams.set('codeDepartement', code);
  url.searchParams.set('fields', 'nom,code,population,centre,contour');
  url.searchParams.set('format', 'json');
  const raw = await cachedJson<CommuneApi[]>('communes', url.toString());
  const list = raw
    .filter((c) => c.centre && c.population != null)
    .map((c) => ({
      nom: c.nom,
      code: c.code,
      population: c.population ?? 0,
      centre: [c.centre!.coordinates[0], c.centre!.coordinates[1]] as [number, number],
    }));
  return { list, raw };
}

async function overpass(query: string, name: string): Promise<OverpassElement[]> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const url = `${endpoint}?data=${encodeURIComponent(query)}`;
      const result = await cachedJson<{ elements: OverpassElement[] }>(name, url);
      return result.elements;
    } catch (error) {
      lastError = error;
      console.warn(`${endpoint} indisponible, nouvel essai…`);
    }
  }
  throw lastError;
}

async function fetchOsm(bbox: [number, number, number, number]): Promise<Etablissement[]> {
  const [s, w, n, e] = [bbox[0] - 0.5, bbox[1] - 0.7, bbox[2] + 0.5, bbox[3] + 0.7].map((v) =>
    v.toFixed(3),
  );
  const box = `${s},${w},${n},${e}`;
  const queries = [
    `[out:json][timeout:180];(nwr["amenity"~"hospital|clinic"]( ${box} );nwr["healthcare"~"^hospital$|^emergency$"]( ${box} );nwr["emergency"="yes"]["amenity"="hospital"]( ${box} ););out center tags;`,
    `[out:json][timeout:180];(nwr["amenity"="doctors"]( ${box} );nwr["healthcare"="doctor"]( ${box} ););out center tags;`,
  ];
  const elements = (await Promise.all(queries.map((q, i) => overpass(q, `overpass-${i}`)))).flat();
  const output: Etablissement[] = [];
  const seen = new Set<string>();
  for (const element of elements) {
    const coordinates: [number, number] | undefined = element.lat
      ? [element.lon!, element.lat]
      : element.center
        ? [element.center.lon, element.center.lat]
        : undefined;
    if (!coordinates || !element.tags) continue;
    const tags = element.tags;
    const name = tags.name ?? `${tags.amenity ?? 'Facility'} ${element.id}`;
    const label = `${name} ${tags['healthcare:speciality'] ?? ''}`.toLowerCase();
    const isHospital = tags.amenity === 'hospital' || tags.amenity === 'clinic' || tags.healthcare === 'hospital';
    const types: CareType[] = [];
    if (isHospital && (tags.emergency === 'yes' || tags.healthcare === 'emergency' || /urgenc/.test(label) || tags.amenity === 'hospital'))
      types.push('urgences');
    if (tags.amenity === 'doctors' || tags.healthcare === 'doctor') types.push('medecin');
    if (/maternit|obstetric|maison de naissance/.test(label)) types.push('maternite');
    for (const type of types) {
      const id = `osm-${element.id}-${type}`;
      if (seen.has(id)) continue;
      seen.add(id);
      output.push({ id, name, type, coordinates, source: 'OSM' });
    }
  }
  return output;
}

async function fetchMaternities(): Promise<Etablissement[]> {
  const base = 'https://data.drees.solidarites-sante.gouv.fr/api/explore/v2.1/catalog/datasets/fichier_maternites_112021/records';
  const records: Maternite[] = [];
  for (let offset = 0; offset < 600; offset += 100) {
    const url = `${base}?where=annee%3D%222024%22&limit=100&offset=${offset}`;
    const page = await cachedJson<{ results: Maternite[] }>(`drees-${offset}`, url);
    records.push(...(page.results ?? []));
    if ((page.results ?? []).length < 100) break;
  }
  const selected = records.filter((r) => NEIGHBORS.includes(r.com.slice(0, 2)));
  if (selected.length === 0) return [];
  const codes = [...new Set(selected.map((r) => r.com))];
  const url = new URL('https://geo.api.gouv.fr/communes');
  url.searchParams.set('codes', codes.join(','));
  url.searchParams.set('fields', 'code,nom,centre');
  const communes = await cachedJson<{ code: string; centre?: { coordinates: number[] } }[]>('maternite-communes', url.toString());
  const centres = new Map(communes.filter((c) => c.centre).map((c) => [c.code, c.centre!.coordinates]));
  return selected.flatMap((r) => {
    const coords = centres.get(r.com);
    return coords
      ? [
          {
            id: `drees-${r.fi_et}`,
            name: r.nom_mat,
            type: 'maternite' as const,
            coordinates: [coords[0], coords[1]] as [number, number],
            source: 'DREES FINESS',
          },
        ]
      : [];
  });
}

async function main(): Promise<void> {
  const boundary = await fetchBoundary();
  const { list: communes, raw } = await fetchCommunes();
  const box = boundary.bbox ?? [-90, -180, 90, 180];
  const [osm, maternities] = await Promise.all([
    fetchOsm([box[1], box[0], box[3], box[2]]),
    fetchMaternities(),
  ]);
  const merge = new Map<string, Etablissement>(osm.map((e) => [e.id, e]));
  maternities.forEach((e) => merge.set(e.id, e));
  const counts = { maternite: 0, urgences: 0, medecin: 0 };
  merge.forEach((e) => counts[e.type]++);

  await writeJson(`${DATA_DIR}nieve.geojson`, {
    type: 'FeatureCollection',
    features: [{ ...boundary, properties: { code, nom: name } }],
  });
  await writeJson(`${DATA_DIR}communes.json`, communes);
  await writeJson(`${DATA_DIR}etablissements.json`, [...merge.values()]);
  await writeJson(`${CACHE_DIR}communes-contours.json`, raw.filter((c) => c.contour));
  console.log(`Sources written: ${merge.size} facilities`, counts);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
