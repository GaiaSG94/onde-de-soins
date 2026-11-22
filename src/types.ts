export type CareType = 'maternite' | 'urgences' | 'medecin';

export type ClassId = '0-10' | '10-20' | '20-30' | '30-45' | '45-60' | '60+';

export type Etablissement = {
  id: string;
  name: string;
  type: CareType;
  coordinates: [number, number];
  source: string;
};

export type Carreau = {
  p: [number, number];
  pop: number;
};

export type Commune = {
  nom: string;
  code: string;
  population: number;
  centre: [number, number];
};

export type CoverageFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { class: ClassId }
>;

export type TravelTimes = Record<CareType, number | null>;

export type Mode = 'live' | 'estimate';
