import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_OPACITY } from './config.ts';
import { DestinationSwitch } from './components/DestinationSwitch.tsx';
import { Legend } from './components/Legend.tsx';
import { MapControls } from './components/MapControls.tsx';
import { MapView } from './components/MapView.tsx';
import { Panel } from './components/Panel.tsx';
import { useAppData } from './hooks/useAppData.ts';
import { fetchSimulationIsochrones, fetchTravelTimes, type IsochroneFeature } from './lib/api.ts';
import { coverageStats, simulatedCoverage } from './lib/coverage.ts';
import type { CareType, Commune, Mode, TravelTimes } from './types.ts';

type Simulation = { type: CareType; coordinates: [number, number]; name: string };

function nearestCommune(coordinates: [number, number], communes: Commune[]): Commune | null {
  let best: Commune | null = null;
  let bestDistance = Infinity;
  for (const commune of communes) {
    const dx = (commune.centre[0] - coordinates[0]) * 0.72;
    const dy = commune.centre[1] - coordinates[1];
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = commune;
    }
  }
  return best;
}

export default function App() {
  const data = useAppData();
  const [map, setMap] = useState<import('maplibre-gl').Map | null>(null);
  const [careType, setCareType] = useState<CareType>('maternite');
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null);
  const [commune, setCommune] = useState<Commune | null>(null);
  const [times, setTimes] = useState<TravelTimes>({ maternite: null, urgences: null, medecin: null });
  const [mode, setMode] = useState<Mode>('live');
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);
  const [pulseKey, setPulseKey] = useState(0);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [simulatedFeatures, setSimulatedFeatures] = useState<IsochroneFeature[]>([]);
  const [busy, setBusy] = useState(false);

  const selectPoint = useCallback(
    async (point: [number, number], forcedCommune?: Commune | null) => {
      setCoordinates(point);
      setCommune(forcedCommune ?? nearestCommune(point, data.communes));
      setSimulation(null);
      setSimulatedFeatures([]);
      setPulseKey((value) => value + 1);
      setBusy(true);
      try {
        const result = await fetchTravelTimes(
          point,
          data.establishments,
          ['maternite', 'urgences', 'medecin'],
        );
        setTimes(result.times);
        setMode(result.mode);
      } catch {
        setTimes({ maternite: null, urgences: null, medecin: null });
        setMode('estimate');
      } finally {
        setBusy(false);
      }
    },
    [data.communes, data.establishments],
  );

  const handleCommune = useCallback(
    (value: Commune) => {
      void selectPoint(value.centre, value);
    },
    [selectPoint],
  );

  const handleSimulation = useCallback(async () => {
    if (simulation) {
      setSimulation(null);
      setSimulatedFeatures([]);
      return;
    }
    if (!coordinates) return;
    setBusy(true);
    try {
      const result = await fetchSimulationIsochrones(coordinates);
      setSimulatedFeatures(result.features);
      setSimulation({ type: careType, coordinates, name: commune?.nom ?? 'ce point' });
      if (result.mode === 'estimate') setMode('estimate');
    } finally {
      setBusy(false);
    }
  }, [simulation, coordinates, careType, commune]);

  const handleCareType = useCallback((type: CareType) => {
    setCareType(type);
    setSimulation(null);
    setSimulatedFeatures([]);
  }, []);

  const baseCoverage = data.coverage[careType];
  const currentCoverage = useMemo(() => {
    if (!baseCoverage || !data.boundary) return baseCoverage;
    if (!simulation || simulation.type !== careType || simulatedFeatures.length === 0) return baseCoverage;
    return simulatedCoverage(baseCoverage, simulatedFeatures, data.boundary);
  }, [baseCoverage, data.boundary, simulation, simulatedFeatures, careType]);

  const before = useMemo(
    () =>
      baseCoverage && data.boundary
        ? coverageStats(baseCoverage, data.carreaux, data.boundary)
        : null,
    [baseCoverage, data.boundary, data.carreaux],
  );
  const after = useMemo(
    () =>
      currentCoverage && data.boundary
        ? coverageStats(currentCoverage, data.carreaux, data.boundary)
        : before,
    [currentCoverage, data.boundary, data.carreaux, before],
  );

  if (data.error) {
    return <div className="fatal-error">Unable to load data: {data.error}</div>;
  }

  return (
    <main className="app-shell">
      <MapView
        coverage={currentCoverage}
        establishments={data.establishments}
        careType={careType}
        point={coordinates}
        simulationPoint={simulation?.coordinates ?? null}
        simulationType={simulation?.type ?? null}
        opacity={opacity}
        pulseKey={pulseKey}
        onMapClick={(point) => void selectPoint(point)}
        onReady={setMap}
      />

      <DestinationSwitch active={careType} onChange={handleCareType} />
      <MapControls map={map} />
      <Legend careType={careType} />

      <Panel
        map={map}
        communes={data.communes}
        commune={commune}
        coordinates={coordinates}
        times={times}
        careType={careType}
        simulationActive={Boolean(simulation)}
        simulationType={simulation?.type ?? null}
        before={before}
        after={after}
        opacity={opacity}
        onOpacityChange={setOpacity}
        onSelectCommune={handleCommune}
        onSimulate={() => void handleSimulation()}
        mode={mode}
        loading={busy || data.loading}
      />

      <div className="credit">© OpenStreetMap contributors · Valhalla / OpenRouteService</div>
    </main>
  );
}
