import { useEffect } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Layer } from '@deck.gl/core';
import { GeoJsonLayer, IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import { DEFAULT_OPACITY } from '../config.ts';
import { classColor } from '../lib/colors.ts';
import { coverageColor, crossIcon } from '../lib/deck.ts';
import { PULSE_PERIOD, useMapEngine, usePulse, useSimulationMarker } from '../hooks/useMapEngine.ts';
import type { CareType, CoverageFeatureCollection, Etablissement } from '../types.ts';

type Props = {
  coverage: CoverageFeatureCollection | null;
  establishments: Etablissement[];
  careType: CareType;
  point: [number, number] | null;
  simulationPoint: [number, number] | null;
  simulationType: CareType | null;
  opacity?: number;
  pulseKey: number;
  onMapClick: (coordinates: [number, number]) => void;
  onReady: (map: MapLibreMap | null) => void;
};

const RED_ICON = crossIcon('#DC2626');
const BLUE_ICON = crossIcon('#1D4ED8');
const GREEN_ICON = crossIcon('#0F766E');

function coverageLayer(coverage: CoverageFeatureCollection, opacity: number, beforeId?: string) {
  return new GeoJsonLayer({
    id: 'coverage-rings',
    data: coverage,
    beforeId,
    filled: true,
    stroked: false,
    getFillColor: (feature: GeoJSON.Feature) =>
      coverageColor(classColor((feature.properties as { class?: '60+' })?.class ?? '60+'), opacity),
    pickable: false,
    updateTriggers: { getFillColor: [opacity, coverage] },
  });
}

function establishmentLayers(sites: Etablissement[], careType: CareType, simulationPoint: [number, number] | null, beforeId?: string): Layer[] {
  const layers: Layer[] = [
    new IconLayer({
      id: 'care-sites',
      data: sites,
      beforeId,
      iconAtlas: careType === 'medecin' ? BLUE_ICON : RED_ICON,
      iconMapping: { marker: { x: 0, y: 0, width: 48, height: 48, anchorX: 24, anchorY: 24 } },
      getIcon: () => 'marker',
      getPosition: (site: Etablissement) => site.coordinates,
      getSize: 22,
      sizeUnits: 'pixels',
      pickable: false,
    }),
  ];
  if (simulationPoint) {
    layers.push(
      new IconLayer({
        id: 'simulated-site',
        data: [{ coordinates: simulationPoint }],
        beforeId,
        iconAtlas: GREEN_ICON,
        iconMapping: { marker: { x: 0, y: 0, width: 48, height: 48, anchorX: 24, anchorY: 24 } },
        getIcon: () => 'marker',
        getPosition: (item: { coordinates: [number, number] }) => item.coordinates,
        getSize: 30,
        sizeUnits: 'pixels',
        pickable: false,
      }),
    );
  }
  return layers;
}

function pulseLayers(point: [number, number], elapsed: number, beforeId?: string): Layer[] {
  const phases = [elapsed / PULSE_PERIOD, ((elapsed / PULSE_PERIOD - 150 / PULSE_PERIOD) % 1 + 1) % 1];
  return phases.map((phase, index) =>
    new ScatterplotLayer({
      id: `pulse-${index}`,
      data: [point],
      beforeId,
      radiusUnits: 'meters',
      filled: false,
      stroked: true,
      getPosition: (p: [number, number]) => p,
      getRadius: 2000 + phase * 88000,
      getLineColor: [59, 7, 100, Math.round(235 * (1 - phase) ** 1.4)],
      getLineWidth: 4,
      lineWidthUnits: 'pixels',
      pickable: false,
      updateTriggers: { getRadius: [phase], getLineColor: [phase] },
    }),
  );
}

export function MapView({ coverage, establishments, careType, point, simulationPoint, simulationType, opacity = DEFAULT_OPACITY, pulseKey, onMapClick, onReady }: Props) {
  const engine = useMapEngine(onMapClick, onReady);
  const pulse = usePulse(pulseKey, point);
  useSimulationMarker(engine.mapRef, simulationPoint);

  useEffect(() => {
    if (!engine.ready || !engine.overlayRef.current || !coverage) return;
    const sites = establishments.filter((site) => site.type === careType);
    const layers: Layer[] = [
      coverageLayer(coverage, opacity, engine.beforeId),
      ...establishmentLayers(sites, careType, simulationPoint, engine.beforeId),
      ...(point && pulse !== null ? pulseLayers(point, pulse, engine.beforeId) : []),
    ];
    engine.overlayRef.current.setProps({ layers });
  }, [engine.ready, engine.beforeId, engine.overlayRef, coverage, establishments, careType, point, simulationPoint, simulationType, opacity, pulse]);

  return <div ref={engine.container} className="map-canvas" aria-label="Travel time map" />;
}
