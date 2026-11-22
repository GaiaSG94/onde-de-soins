import { area, booleanPointInPolygon, difference, dissolve, featureCollection, intersect, point } from '@turf/turf';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { ClassId } from '../../src/config.ts';
import type { Carreau } from '../../src/types.ts';

export type Poly = Feature<Polygon | MultiPolygon>;
export type PolyCollection = FeatureCollection<Polygon | MultiPolygon>;

const dissolveT = dissolve as unknown as (input: unknown) => FeatureCollection;
const differenceT = difference as unknown as (input: unknown) => Poly;
const intersectT = intersect as unknown as (input: unknown) => Poly;
const insideT = booleanPointInPolygon as unknown as (p: unknown, poly: unknown) => boolean;
const areaT = area as unknown as (input: unknown) => number;

export function asCollection(polys: Poly[]): PolyCollection {
  return featureCollection(polys as never) as unknown as PolyCollection;
}

function flatten(polys: Poly[]): Feature<Polygon>[] {
  return polys.flatMap((poly) =>
    poly.geometry.type === 'Polygon'
      ? [poly as Feature<Polygon>]
      : poly.geometry.coordinates.map(
          (coordinates) =>
            ({ type: 'Feature', properties: poly.properties, geometry: { type: 'Polygon', coordinates } }) as Feature<Polygon>,
        ),
  );
}

export function dissolveAll(polys: Poly[]): Poly | null {
  if (polys.length === 0) return null;
  if (polys.length === 1) return polys[0];
  try {
    const merged = dissolveT(asCollection(flatten(polys)));
    const coordinates: MultiPolygon['coordinates'] = [];
    for (const feature of merged.features) {
      const geometry = feature.geometry;
      if (geometry?.type === 'Polygon') coordinates.push(geometry.coordinates);
      if (geometry?.type === 'MultiPolygon') coordinates.push(...geometry.coordinates);
    }
    return coordinates.length
      ? { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates } }
      : null;
  } catch {
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: polys.flatMap((poly) =>
          poly.geometry.type === 'Polygon' ? [poly.geometry.coordinates] : poly.geometry.coordinates,
        ),
      },
    };
  }
}

function safeDifference(a: Poly, b: Poly | null): Poly | null {
  if (!b) return a;
  try {
    return differenceT(featureCollection([a, b] as never)) ?? null;
  } catch {
    return a;
  }
}

function safeIntersect(a: Poly, b: Poly): Poly | null {
  try {
    return intersectT(featureCollection([a, b] as never)) ?? null;
  } catch {
    return a;
  }
}

export function buildRings(boundary: Poly, groups: Poly[][], classes: ClassId[]): PolyCollection {
  const zones: (Poly | null)[] = [];
  let acc: Poly | null = null;
  for (const group of groups) {
    const merged = dissolveAll(group);
    if (merged) {
      acc = acc ? dissolveAll([acc, merged]) : merged;
      zones.push(acc ? safeIntersect(acc, boundary) : null);
    } else {
      zones.push(acc);
    }
  }

  const features: Feature<Polygon | MultiPolygon, { class: ClassId }>[] = [];
  let previous: Poly | null = null;
  zones.forEach((zone, index) => {
    const ring = zone ? safeDifference(zone, previous) : null;
    if (ring) features.push({ ...ring, properties: { class: classes[index] } });
    if (zone) previous = zone;
  });
  const remainder = safeDifference(boundary, previous);
  if (remainder) features.push({ ...remainder, properties: { class: classes[classes.length - 1] } });
  return asCollection(features) as FeatureCollection<Polygon | MultiPolygon, { class: ClassId }>;
}

export function populationIn(carreaux: Carreau[], zone: Poly | PolyCollection | null): number {
  if (!zone) return 0;
  const polys = zone.type === 'FeatureCollection' ? zone.features : [zone];
  return carreaux.reduce(
    (total, carreau) =>
      total + (polys.some((poly) => insideT(point(carreau.p), poly)) ? carreau.pop : 0),
    0,
  );
}

export function areaKm2(zone: Poly | PolyCollection | null): number {
  if (!zone) return 0;
  const polys = zone.type === 'FeatureCollection' ? zone.features : [zone];
  return polys.reduce((total, poly) => total + Math.abs(areaT(poly)), 0);
}

export function selectClass(collection: PolyCollection, id: ClassId): Poly | null {
  return (collection.features.find((feature) => feature.properties?.class === id) as Poly | undefined) ?? null;
}

export function unionFeatures(a: Poly | null, b: Poly | null): Poly | null {
  if (!a) return b;
  if (!b) return a;
  return dissolveAll([a, b]);
}
