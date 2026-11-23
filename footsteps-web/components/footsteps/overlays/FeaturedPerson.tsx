import type { Person } from '../layers/people';
import { describePerson } from '../layers/people';
import Portrait from './Portrait';

/** At street zoom, the left column shows a person in frame without a click (lib/featuredPerson.ts picks them). A click on
 * the card opens their full panel (grounding facts, "Imagine their day"), as clicking them on the map does. */
export default function FeaturedPerson({
  person,
  year,
  routineMs,
  onOpen,
}: {
  person: Person;
  year: number;
  routineMs?: number;
  onOpen: () => void;
}) {
  const { title, detail } = describePerson(person, routineMs);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="featured-person"
      className="ov-panel pointer-events-auto shrink-0 px-3.5 py-3 text-left transition-colors hover:bg-[var(--ov-hover,rgba(255,255,255,0.04))]"
      aria-label={`Someone here: ${title}. Open their details`}
    >
      <p className="ov-note mb-2 text-[var(--ov-text-3)]">Someone in view · imagined</p>
      <div className="flex gap-3">
        <Portrait person={person} year={year} lat={person.position[1]} />
        <div className="min-w-0">
          <p className="ov-title text-[var(--ov-warm)]">{title}</p>
          <p className="ov-body mt-1 text-[var(--ov-text)]">{detail}</p>
          <p className="ov-note mt-2 text-[var(--ov-text-3)]">Click for their day · or click anyone on the map</p>
        </div>
      </div>
    </button>
  );
}
