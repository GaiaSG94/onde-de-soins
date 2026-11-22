import { useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Commune } from '../types.ts';

type Props = { map: MapLibreMap | null; communes: Commune[]; onSelect: (commune: Commune) => void; loading: boolean };

export function SearchBox({ map, communes, onSelect, loading }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<Commune[]>([]);
  const timer = useRef<number | undefined>(undefined);

  const results = query.trim().length < 2
    ? []
    : communes
        .filter((commune) => commune.nom.toLowerCase().normalize('NFD').includes(query.toLowerCase().normalize('NFD')))
        .slice(0, 5);

  function handleChange(value: string) {
    setQuery(value);
    setOpen(true);
    window.clearTimeout(timer.current);
    if (map && value.trim().length >= 3) {
      timer.current = window.setTimeout(async () => {
        const response = await fetch(`/api/ors/geocode/autocomplete?text=${encodeURIComponent(value)}&size=5`);
        if (!response.ok) return;
        const data = (await response.json()) as GeoJSON.FeatureCollection<GeoJSON.Point>;
        setRemote(
          (data.features ?? []).map((feature) => ({
            nom: String(feature.properties?.name ?? ''),
            code: String(feature.properties?.postcode ?? ''),
            population: 0,
            centre: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]],
          })),
        );
      }, 450);
    } else {
      setRemote([]);
    }
  }

  function choose(commune: Commune) {
    setQuery(commune.nom);
    setOpen(false);
    onSelect(commune);
    map?.flyTo({ center: commune.centre, zoom: 10, duration: 900 });
  }

  const shown = results.length ? results : remote;

  return (
    <div className="search-box">
      <label htmlFor="commune-search">Search for a town</label>
      <div className="search-input-wrap">
        <span className="search-icon" aria-hidden="true">⌕</span>
        <input
          id="commune-search"
          type="search"
          autoComplete="off"
          placeholder="e.g. Nevers, Cosne-Cours-sur-Loire…"
          value={query}
          disabled={loading}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'Enter' && shown[0]) choose(shown[0]);
          }}
        />
      </div>
      {open && shown.length > 0 && (
        <ul className="search-results" role="listbox">
          {shown.map((commune) => (
            <li key={`${commune.code}-${commune.nom}`}>
              <button type="button" role="option" aria-selected={false} onClick={() => choose(commune)}>
                <span>{commune.nom}</span>
                {commune.population > 0 && <small>{commune.population.toLocaleString('en-US')} res.</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
