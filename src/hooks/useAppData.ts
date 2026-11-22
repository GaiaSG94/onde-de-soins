import { useEffect, useState } from 'react';
import { DATA_URLS } from '../config.ts';
import type { Carreau, Commune, CoverageFeatureCollection, Etablissement } from '../types.ts';

type BoundaryCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

export type AppData = {
  boundary: BoundaryCollection['features'][number] | null;
  establishments: Etablissement[];
  communes: Commune[];
  carreaux: Carreau[];
  coverage: Record<'maternite' | 'urgences' | 'medecin', CoverageFeatureCollection | null>;
  loading: boolean;
  error: string | null;
};

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Data not found: ${url}`);
  return (await response.json()) as T;
}

export function useAppData(): AppData {
  const [data, setData] = useState<AppData>({
    boundary: null,
    establishments: [],
    communes: [],
    carreaux: [],
    coverage: { maternite: null, urgences: null, medecin: null },
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [boundary, establishments, communes, carreaux, maternite, urgences, medecin] =
          await Promise.all([
            loadJson<BoundaryCollection>(DATA_URLS.boundary),
            loadJson<Etablissement[]>(DATA_URLS.establishments),
            loadJson<Commune[]>(DATA_URLS.communes),
            loadJson<Carreau[]>(DATA_URLS.carreaux),
            loadJson<CoverageFeatureCollection>(DATA_URLS.maternite),
            loadJson<CoverageFeatureCollection>(DATA_URLS.urgences),
            loadJson<CoverageFeatureCollection>(DATA_URLS.medecin),
          ]);
        if (controller.signal.aborted) return;
        setData({
          boundary: boundary.features[0] ?? null,
          establishments,
          communes,
          carreaux,
          coverage: { maternite, urgences, medecin },
          loading: false,
          error: null,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setData((previous) => ({
          ...previous,
          loading: false,
          error: error instanceof Error ? error.message : 'Loading error',
        }));
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  return data;
}
