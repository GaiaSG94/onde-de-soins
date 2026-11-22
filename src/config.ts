import type { CareType } from './types.ts';

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export const THRESHOLDS = [10, 20, 30, 45, 60] as const;

export const CLASSES = [
  { id: '0-10', label: 'under 10 min', color: '#F4F27A', max: 10 },
  { id: '10-20', label: '10 to 20 min', color: '#F9C54D', max: 20 },
  { id: '20-30', label: '20 to 30 min', color: '#F28B49', max: 30 },
  { id: '30-45', label: '30 to 45 min', color: '#D9566A', max: 45 },
  { id: '45-60', label: '45 to 60 min', color: '#9C3D8F', max: 60 },
  { id: '60+', label: 'over 60 min', color: '#5B3A8C', max: Infinity },
] as const;

export type ClassId = (typeof CLASSES)[number]['id'];

export const CARE_TYPES: { id: CareType; label: string; short: string; icon: string }[] = [
  { id: 'maternite', label: 'Maternity', short: 'Maternity', icon: 'maternite' },
  { id: 'urgences', label: 'Emergency', short: 'Emergency', icon: 'urgences' },
  { id: 'medecin', label: 'General practitioner', short: 'GP', icon: 'medecin' },
];

export const SIM_LABELS: Record<CareType, string> = {
  maternite: 'a maternity ward',
  urgences: 'an emergency department',
  medecin: 'a health centre',
};

export const DEFAULT_OPACITY = 0.62;
export const DEPARTMENT = { code: '58', name: 'Nièvre' };
export const DEPARTMENT_CENTER: [number, number] = [3.52, 47.05];
export const DEPARTMENT_ZOOM = 8.4;
export const NEIGHBOR_KM = 60;
export const NEAREST_COUNT = 5;
export const TARGET_MINUTES = 30;

export const DATA_URLS: Record<CareType | 'boundary' | 'establishments' | 'carreaux' | 'communes', string> = {
  boundary: '/data/nieve.geojson',
  establishments: '/data/etablissements.json',
  carreaux: '/data/carreaux.json',
  communes: '/data/communes.json',
  maternite: '/data/maternite.geojson',
  urgences: '/data/urgences.geojson',
  medecin: '/data/medecin.geojson',
};
