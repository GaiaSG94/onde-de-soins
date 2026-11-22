import { CARE_TYPES } from '../config.ts';
import type { CareType } from '../types.ts';

type Props = { active: CareType; onChange: (type: CareType) => void };

export function DestinationSwitch({ active, onChange }: Props) {
  return (
    <div className="destination-switch" role="group" aria-label="Choisir une destination de soins">
      {CARE_TYPES.map((type) => (
        <button
          key={type.id}
          type="button"
          className={`destination-button ${active === type.id ? 'is-active' : ''}`}
          aria-pressed={active === type.id}
          onClick={() => onChange(type.id)}
        >
          {type.label}
        </button>
      ))}
    </div>
  );
}
