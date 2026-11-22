import { useEffect, useRef, useState, type RefObject } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { DEPARTMENT_CENTER, DEPARTMENT_ZOOM, MAP_STYLE } from '../config.ts';

export const PULSE_PERIOD = 3200;

export type MapEngine = {
  container: RefObject<HTMLDivElement | null>;
  mapRef: RefObject<MapLibreMap | null>;
  overlayRef: RefObject<MapboxOverlay | null>;
  ready: boolean;
  beforeId: string | undefined;
};

function findBeforeId(map: MapLibreMap): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  const road = layers.find((layer) => layer.type === 'line' && /road|street|highway/i.test(layer.id));
  return road?.id ?? layers.find((layer) => layer.type === 'line')?.id ?? layers.find((layer) => layer.type === 'symbol')?.id;
}

export function useMapEngine(
  onMapClick: (coordinates: [number, number]) => void,
  onReady: (map: MapLibreMap | null) => void,
): MapEngine {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const clickRef = useRef(onMapClick);
  const readyRef = useRef(onReady);
  const [ready, setReady] = useState(false);
  const [beforeId, setBeforeId] = useState<string | undefined>();
  clickRef.current = onMapClick;
  readyRef.current = onReady;

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      center: DEPARTMENT_CENTER,
      zoom: DEPARTMENT_ZOOM,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');
    map.on('load', () => {
      const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
      map.addControl(overlay);
      overlayRef.current = overlay;
      setBeforeId(findBeforeId(map));
      setReady(true);
      readyRef.current(map);
    });
    map.on('click', (event) => clickRef.current([event.lngLat.lng, event.lngLat.lat]));
    map.on('styledata', () => setBeforeId(findBeforeId(map)));
    return () => {
      readyRef.current(null);
      overlayRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return { container, mapRef, overlayRef, ready, beforeId };
}

export function usePulse(pulseKey: number, point: [number, number] | null): number | null {
  const [pulse, setPulse] = useState<number | null>(null);
  useEffect(() => {
    if (!pulseKey || !point) return;
    const start = performance.now();
    let frame = 0;
    const loop = (time: number) => {
      const elapsed = time - start;
      if (elapsed >= PULSE_PERIOD) {
        setPulse(null);
        return;
      }
      setPulse(elapsed);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [pulseKey, point]);
  return pulse;
}

export function useSimulationMarker(
  mapRef: RefObject<MapLibreMap | null>,
  simulationPoint: [number, number] | null,
): void {
  useEffect(() => {
    const marker = new maplibregl.Marker({ element: createLabel(), anchor: 'left' });
    if (!simulationPoint || !mapRef.current) return;
    marker.setLngLat(simulationPoint).addTo(mapRef.current);
    return () => {
      marker.remove();
    };
  }, [simulationPoint, mapRef]);
}

function createLabel(): HTMLDivElement {
  const element = document.createElement('div');
  element.className = 'new-service-label';
  element.textContent = 'New';
  element.setAttribute('role', 'status');
  return element;
}
