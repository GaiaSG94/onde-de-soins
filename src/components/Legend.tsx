import { CLASSES, CARE_TYPES } from '../config.ts';
import type { CareType } from '../types.ts';

type Props = { careType: CareType };

export function Legend({ careType }: Props) {
  const label = CARE_TYPES.find((type) => type.id === careType)?.label ?? '';
  return (
    <aside className="legend" aria-label="Travel time legend">
      <p className="legend-title">Time to: <strong>{label.toLowerCase()}</strong></p>
      <ul className="legend-items">
        {CLASSES.map((item) => (
          <li key={item.id}>
            <span className="legend-swatch" style={{ background: item.color }} aria-hidden="true" />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
