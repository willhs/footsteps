import type { GroundingFacts } from '../layers/grounding';
import PersonDay, { type DayRequest } from './PersonDay';
import Portrait from './Portrait';
import type { Person } from '../layers/people';

export default function GroundingPanel({
  facts,
  group,
  person,
  day,
  portrait,
  onClose,
}: {
  facts: GroundingFacts | null;
  /** The clicked mark, at close zoom: what it stands for, not where it really was. */
  group?: { label: string; people: number; placed: boolean } | null;
  /** A clicked individual (street-level zoom): imagined from the head count. */
  person?: { title: string; detail: string } | null;
  /** Facts for 'Imagine their day' (present when a person is selected). */
  day?: DayRequest | null;
  /** The selected person, for their illustrated portrait. */
  portrait?: { person: Person; year: number; lat: number } | null;
  onClose: () => void;
}) {
  const count = (n: number) => Math.round(n).toLocaleString();
  return (
    <section aria-label="What we know here" className="absolute bottom-44 left-4 z-20 max-w-xs rounded bg-black/85 p-4 text-xs leading-relaxed text-white/85">
      <button type="button" aria-label="Close grounding facts" onClick={onClose} className="float-right ml-4 px-1">×</button>
      <h2 className="mb-2 text-sm font-semibold text-white">What we know here</h2>
      {person && (
        <div className="mb-3 border-b border-white/15 pb-3">
          <div className="flex gap-3">
            {portrait && <Portrait {...portrait} />}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#ffe2aa]">{person.title}</p>
              <p className="text-white">{person.detail}</p>
            </div>
          </div>
          <p className="mt-1 text-white/55">
            Imagined: the head count is a HYDE estimate; this person&apos;s age, role and place in
            camp are drawn from a typical pre-modern population.
          </p>
          {day && <PersonDay request={day} />}
        </div>
      )}
      {group && (
        <p className="mb-2 text-white">
          {group.placed
            ? `${group.label} of about ${count(group.people)} people. Where it sits inside its cell is illustrative.`
            : `${group.label}: about ${count(group.people)} people in one ~10 km cell.`}
        </p>
      )}
      {facts ? <>
        <p>{facts.year < 1 ? `${Math.abs(facts.year)} BCE` : `${facts.year} CE`} · cell centre {facts.latitude.toFixed(3)}°, {facts.longitude.toFixed(3)}°</p>
        <dl className="my-2 grid grid-cols-2 gap-x-3">
          <dt>People in cell</dt><dd>≈ {count(facts.people)}</dd>
          <dt>3×3 neighbourhood</dt><dd>≈ {count(facts.neighbourhoodPeople)}</dd>
          <dt>Density class</dt><dd>{facts.densityClass}</dd>
        </dl>
        <p>{facts.confidence}</p>
        <p className="mt-2 text-white/60">Counts are decoded HYDE estimates. Zero means no population recorded in this image, not confirmed absence. Band/village placements are illustrative.</p>
      </> : <p>Population image for this year is not loaded yet.</p>}
    </section>
  );
}
