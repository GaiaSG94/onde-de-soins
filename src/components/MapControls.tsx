import { useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';

type Props = { map: MapLibreMap | null };

export function MapControls({ map }: Props) {
  const [error, setError] = useState(false);

  function locate() {
    if (!navigator.geolocation) {
      setError(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setError(false);
        map?.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 11,
          duration: 1000,
        });
      },
      () => setError(true),
      { timeout: 8000 },
    );
  }

  return (
    <div className="map-controls" role="group" aria-label="Map controls">
      <button type="button" aria-label="Zoom in" onClick={() => map?.zoomIn()}>＋</button>
      <button type="button" aria-label="Zoom out" onClick={() => map?.zoomOut()}>−</button>
      <button type="button" aria-label="Locate me" onClick={locate} title={error ? 'Location unavailable' : 'Locate me'}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
        </svg>
      </button>
    </div>
  );
}
