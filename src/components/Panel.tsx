import { CLASSES, SIM_LABELS, TARGET_MINUTES } from '../config.ts';
import { classForMinutes } from '../lib/colors.ts';
import type { CoverageStats } from '../lib/coverage.ts';
import type { CareType, Commune, Mode, TravelTimes } from '../types.ts';
import { SearchBox } from './SearchBox.tsx';
import type { Map as MapLibreMap } from 'maplibre-gl';

type Props = {
  map: MapLibreMap | null;
  communes: Commune[];
  commune: Commune | null;
  coordinates: [number, number] | null;
  times: TravelTimes;
  careType: CareType;
  simulationActive: boolean;
  simulationType: CareType | null;
  before: CoverageStats | null;
  after: CoverageStats | null;
  opacity: number;
  onOpacityChange: (value: number) => void;
  onSelectCommune: (commune: Commune) => void;
  onSimulate: () => void;
  mode: Mode;
  loading: boolean;
};

function Logo() {
  return (
    <div className="brand">
      <div className="brand-mark" aria-hidden="true">
        <span /><span /><span />
      </div>
      <div>
        <h1>Onde de soins</h1>
        <p>Map of medical deserts</p>
      </div>
    </div>
  );
}

function TimeRow({ type, minutes, active }: { type: CareType; minutes: number | null; active: boolean }) {
  const label = CLASSES.find((item) => item.id === (minutes === null ? '60+' : classForMinutes(minutes)));
  const color = label?.color ?? '#5B3A8C';
  const names: Record<CareType, string> = {
    maternite: 'Maternity',
    urgences: 'Emergency',
    medecin: 'General practitioner',
  };
  return (
    <div className={`time-row ${active ? 'is-active' : ''}`}>
      <span className="time-dot" style={{ background: color }} aria-hidden="true" />
      <span className="time-label">{names[type]}</span>
      <span className="time-value">{minutes === null ? '—' : minutes}</span>
      <span className="time-unit">{minutes === null ? '' : 'min'}</span>
    </div>
  );
}

export function Panel(props: Props) {
  const {
    map, communes, commune, coordinates, times, careType, simulationActive, simulationType,
    before, after, opacity, onOpacityChange, onSelectCommune, onSimulate, mode, loading,
  } = props;
  const gain = before && after ? after.population - before.population : 0;
  const buttonLabel = simulationActive
    ? 'Remove simulation'
    : `Simulate ${SIM_LABELS[careType]}${commune ? ` in ${commune.nom}` : coordinates ? ' here' : ''}`;
  const shareBefore = before ? Math.round(before.share * 100) : 0;
  const shareAfter = after ? Math.round(after.share * 100) : 0;

  return (
    <section className="panel" aria-label="Healthcare access information">
      <Logo />
      <SearchBox map={map} communes={communes} onSelect={onSelectCommune} loading={loading} />

      <div className="place">
        <h2>{commune?.nom ?? 'Click the map'}</h2>
        <p>
          {commune
            ? `${commune.population.toLocaleString('en-US')} residents · ${commune.code.slice(0, 2)}`
            : coordinates
              ? `${coordinates[1].toFixed(4)}° N, ${coordinates[0].toFixed(4)}° E`
              : 'Pick a point to reveal travel times.'}
        </p>
        {mode === 'estimate' && (
          <p className="estimate-badge">Local estimate — the free routing service is temporarily unavailable</p>
        )}
      </div>

      <div className="section">
        <h3>Driving time</h3>
        <div className="time-list">
          {(['maternite', 'urgences', 'medecin'] as CareType[]).map((type) => (
            <TimeRow key={type} type={type} minutes={times[type]} active={careType === type} />
          ))}
        </div>
      </div>

      <button
        type="button"
        className={`simulate-button ${simulationActive ? 'is-active' : ''}`}
        onClick={onSimulate}
        disabled={loading || (!coordinates && !simulationActive)}
      >
        {buttonLabel}
      </button>
      {simulationActive && simulationType && simulationType !== careType && (
        <p className="simulation-note">Active simulation: {SIM_LABELS[simulationType]}.</p>
      )}

      <div className="section coverage">
        <h3>Area within {TARGET_MINUTES} min</h3>
        <p className="coverage-line">
          <span>{shareBefore} %</span>
          {after && <span className="coverage-arrow">→ {shareAfter} %</span>}
        </p>
        {simulationActive && gain !== 0 && (
          <p className="coverage-gain">{gain > 0 ? '+' : ''}{gain.toLocaleString('en-US')} residents</p>
        )}
      </div>

      <div className="section">
        <label className="slider-label" htmlFor="opacity">Colour intensity</label>
        <input
          id="opacity"
          type="range"
          min="0.2"
          max="1"
          step="0.02"
          value={opacity}
          onChange={(event) => onOpacityChange(Number(event.target.value))}
        />
      </div>

      <p className="sources">
        Sources: FINESS / DREES, OpenStreetMap, INSEE Filosofi. Free routing: Valhalla
        (FOSSGIS) or OpenRouteService. Basemap © OpenStreetMap contributors.
      </p>
    </section>
  );
}
