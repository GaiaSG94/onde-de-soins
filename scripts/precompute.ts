import { booleanPointInPolygon, point } from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { CLASSES, TARGET_MINUTES } from '../src/config.ts';
import type { CareType, Carreau, Commune, Etablissement } from '../src/types.ts';
import { buildRings, populationIn, type Poly, type PolyCollection } from './lib/geo.ts';
import { CACHE_DIR, DATA_DIR, readJson, writeJson } from './lib/io.ts';
import { emptyGroups, engine, fetchIsochrones } from './lib/ors.ts';

type Boundary = Feature<Polygon | MultiPolygon>;

function thin(items: Etablissement[], limit: number): Etablissement[] {
  if (items.length <= limit) return items;
  const cells = new Set<string>();
  const kept: Etablissement[] = [];
  for (const item of items) {
    const cell = `${Math.round(item.coordinates[0] / 0.025)}:${Math.round(item.coordinates[1] / 0.025)}`;
    if (cells.has(cell)) continue;
    cells.add(cell);
    kept.push(item);
    if (kept.length >= limit) break;
  }
  return kept;
}

async function buildCarreaux(boundary: Boundary, communes: Commune[]): Promise<Carreau[]> {
  const [minX, minY, maxX, maxY] = boundary.bbox ?? [3.1, 46.6, 4.3, 47.7];
  const candidates: [number, number][] = [];
  for (let x = minX; x <= maxX; x += 0.009) {
    for (let y = minY; y <= maxY; y += 0.006) {
      const p = point([x, y]);
      if (booleanPointInPolygon(p, boundary)) candidates.push([+x.toFixed(5), +y.toFixed(5)]);
    }
  }
  const buckets = new Map<string, number[]>();
  const indexToCommune = new Map<number, Commune>();
  candidates.forEach((coord, index) => {
    let best: Commune | undefined;
    let bestDistance = Infinity;
    for (const commune of communes) {
      const dx = (commune.centre[0] - coord[0]) * 0.72;
      const dy = commune.centre[1] - coord[1];
      const d = dx * dx + dy * dy;
      if (d < bestDistance) {
        bestDistance = d;
        best = commune;
      }
    }
    if (!best) return;
    const list = buckets.get(best.code) ?? [];
    list.push(index);
    buckets.set(best.code, list);
    indexToCommune.set(index, best);
  });

  return candidates.flatMap((coord, index) => {
    const commune = indexToCommune.get(index);
    if (!commune) return [];
    const count = buckets.get(commune.code)!.length;
    return [{ p: coord, pop: Math.round(commune.population / count) }];
  });
}

function featureClassOf(collection: PolyCollection, ids: string[]): Poly[] {
  return collection.features.filter((f) => ids.includes(String(f.properties?.class))) as Poly[];
}

async function computeType(
  type: CareType,
  establishments: Etablissement[],
  boundary: Boundary,
  carreaux: Carreau[],
): Promise<{ collection: PolyCollection; population30: number; coverage30: number }> {
  const groups = emptyGroups();
  const sites = thin(
    establishments.filter((item) => item.type === type),
    Number(process.env.MAX_ETABLISSEMENTS ?? 250),
  );
  console.log(`${type}: ${sites.length} facilities`);
  for (const site of sites) {
    const iso = await fetchIsochrones(site.coordinates);
    iso.forEach((group, index) => groups[index].push(...group));
  }
  const collection = buildRings(
    boundary,
    groups,
    CLASSES.map((c) => c.id),
  );
  const under30 = featureClassOf(collection, ['0-10', '10-20', '20-30']);
  const population30 = populationIn(carreaux, { type: 'FeatureCollection', features: under30 });
  return { collection, population30, coverage30: 0 };
}

async function main(): Promise<void> {
  const boundary = (await readJson<{ features: Boundary[] }>(`${DATA_DIR}nieve.geojson`)).features[0];
  const establishments = await readJson<Etablissement[]>(`${DATA_DIR}etablissements.json`);
  const communes = await readJson<Commune[]>(`${DATA_DIR}communes.json`);
  const carreaux = await buildCarreaux(boundary, communes);
  await writeJson(`${DATA_DIR}carreaux.json`, carreaux);
  console.log(`${carreaux.length} population grid cells generated`);

  const stats: Record<string, { population30: number; coverage30: number; sites: number }> = {};
  for (const type of ['maternite', 'urgences', 'medecin'] as CareType[]) {
    const result = await computeType(type, establishments, boundary, carreaux);
    await writeJson(`${DATA_DIR}${type}.geojson`, result.collection);
    stats[type] = {
      population30: result.population30,
      coverage30: 0,
      sites: establishments.filter((e) => e.type === type).length,
    };
  }
  await writeJson(`${CACHE_DIR}stats.json`, stats);
  console.log(
    `Precompute finished (engine: ${engine()})`,
    stats,
  );
  console.log(`Cible : moins de ${TARGET_MINUTES} min`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
