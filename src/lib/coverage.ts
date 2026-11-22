import { area, booleanPointInPolygon, difference, dissolve, featureCollection, intersect, point } from '@turf/turf';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { CLASSES, TARGET_MINUTES, THRESHOLDS } from '../config.ts';
import type { Carreau, ClassId, CoverageFeatureCollection } from '../types.ts';
import type { IsochroneFeature } from './api.ts';

type Poly = Feature<Polygon | MultiPolygon>;

const dissolveT = dissolve as unknown as (input: unknown) => FeatureCollection;
const differenceT = difference as unknown as (input: unknown) => Poly;
const intersectT = intersect as unknown as (input: unknown) => Poly;
const insideT = booleanPointInPolygon as unknown as (p: unknown, poly: unknown) => boolean;
const areaT = area as unknown as (input: unknown) => number;

export function classFeatures(collection: CoverageFeatureCollection, ids: ClassId[]): Poly[] {
  return collection.features.filter((feature) => ids.includes(feature.properties.class)) as Poly[];
}

function flatten(items: Poly[]): Feature<Polygon>[] {
  return items.flatMap((item) =>
    item.geometry.type === 'Polygon'
      ? [item as Feature<Polygon>]
      : item.geometry.coordinates.map(
          (coordinates) =>
            ({ type: 'Feature', properties: item.properties, geometry: { type: 'Polygon', coordinates } }) as Feature<Polygon>,
        ),
  );
}

function mergePolys(items: Poly[]): Poly | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  try {
    const result = dissolveT(featureCollection(flatten(items) as never));
    const coordinates: MultiPolygon['coordinates'] = [];
    for (const feature of result.features) {
      const geometry = feature.geometry;
      if (geometry?.type === 'Polygon') coordinates.push(geometry.coordinates);
      if (geometry?.type === 'MultiPolygon') coordinates.push(...geometry.coordinates);
    }
    return coordinates.length
      ? { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates } }
      : null;
  } catch {
    return items[0];
  }
}

function clip(zone: Poly | null, boundary: Poly): Poly | null {
  if (!zone) return null;
  try {
    return intersectT(featureCollection([zone, boundary] as never)) ?? zone;
  } catch {
    return zone;
  }
}

function subtract(zone: Poly | null, previous: Poly | null): Poly | null {
  if (!zone) return null;
  if (!previous) return zone;
  try {
    return differenceT(featureCollection([zone, previous] as never)) ?? zone;
  } catch {
    return zone;
  }
}

export function simulatedCoverage(
  base: CoverageFeatureCollection,
  simulated: IsochroneFeature[],
  boundary: Poly,
): CoverageFeatureCollection {
  const zones: (Poly | null)[] = [];
  let baseAcc: Poly | null = null;
  let simAcc: Poly | null = null;
  THRESHOLDS.forEach((minutes, index) => {
    baseAcc = mergePolys([
      ...(baseAcc ? [baseAcc] : []),
      ...classFeatures(base, [CLASSES[index].id]),
    ]);
    const matching = simulated.filter(
      (feature) => Math.abs(Number(feature.properties?.value) - minutes * 60) < 30,
    );
    simAcc = mergePolys([...(simAcc ? [simAcc] : []), ...matching]);
    zones.push(clip(mergePolys([...(baseAcc ? [baseAcc] : []), ...(simAcc ? [simAcc] : [])]), boundary));
  });

  const features: Feature<Polygon | MultiPolygon, { class: ClassId }>[] = [];
  let previous: Poly | null = null;
  zones.forEach((zone, index) => {
    const ring = subtract(zone, previous);
    if (ring) features.push({ ...ring, properties: { class: CLASSES[index].id } });
    if (zone) previous = zone;
  });
  const last = subtract(boundary, previous);
  if (last) features.push({ ...last, properties: { class: CLASSES[CLASSES.length - 1].id } });
  return featureCollection(features as never) as unknown as CoverageFeatureCollection;
}

export type CoverageStats = { population: number; share: number; area: number };

export function coverageStats(
  collection: CoverageFeatureCollection,
  carreaux: Carreau[],
  boundary: Poly,
): CoverageStats {
  const targetIds = CLASSES.filter((item) => item.max <= TARGET_MINUTES).map((item) => item.id);
  const zone = mergePolys(classFeatures(collection, targetIds));
  const population = carreaux.reduce(
    (sum, carreau) => sum + (zone && insideT(point(carreau.p), zone) ? carreau.pop : 0),
    0,
  );
  const coveredArea = zone ? areaT(zone) : 0;
  const deptArea = areaT(boundary);
  return { population, area: coveredArea, share: deptArea > 0 ? coveredArea / deptArea : 0 };
}
