import type { GroundingFacts } from '../layers/grounding';
import EvidenceNearby from './EvidenceNearby';
import PersonDay, { type DayRequest } from './PersonDay';
import Portrait from './Portrait';
import type { Person } from '../layers/people';
import { CloseIcon } from '@/components/ui/icons';
import { cssRgb, LOOKS } from '@/lib/waysOfLife';

export default function GroundingPanel({
  facts,
  modelled = false,
  group,
  person,
  day,
  portrait,
  place,
  onClose,
}: {
  facts: GroundingFacts | null;
  /** The year is before HYDE: counts are the model's, not measured. */
  modelled?: boolean;
  /** The clicked mark, at close zoom: what it stands for, not where it really was. */
  group?: { label: string; people: number; placed: boolean } | null;
  /** A clicked individual (street-level zoom): imagined from the head count. */
  person?: { title: string; detail: string } | null;
  /** Facts for 'Imagine their day' (present when a person is selected). */
  day?: DayRequest | null;
  /** The selected person, for their illustrated portrait. */
  portrait?: { person: Person; year: number; lat: number } | null;
  /** The clicked place and slider year, for the dated sites nearby. */
  place?: { lat: number; lon: number; year: number } | null;
  onClose: () => void;
}) {
  const count = (n: number) => Math.round(n).toLocaleString();
  return (
    <section
      aria-label="What we know here"
      className="ov-panel ov-panel-strong pointer-events-auto min-h-0 overflow-y-auto overscroll-contain p-0"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--ov-divider)] bg-[rgba(14,15,19,0.97)] py-2 pl-4 pr-2">
        <h2 className="ov-eyebrow">What we know here</h2>
        <button type="button" aria-label="Close grounding facts" title="Close" onClick={onClose} className="ov-icon-btn">
          <CloseIcon />
        </button>
      </header>

      <div className="flex flex-col gap-4 px-4 pb-4 pt-3">
        {person && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3.5">
              {portrait && <Portrait {...portrait} />}
              <div className="min-w-0 pt-0.5">
                <p className="ov-title text-[var(--ov-warm)]">{person.title}</p>
                <p className="ov-body mt-1 text-[var(--ov-text)]">{person.detail}</p>
              </div>
            </div>
            <p className="ov-note">
              Imagined: the head count is {modelled ? 'modelled' : 'a HYDE estimate'}; this person&apos;s age, role and place in
              camp are drawn from a typical pre-modern population.
            </p>
            {day && <PersonDay request={day} />}
          </div>
        )}

        {group && (
          <p className="ov-body text-[var(--ov-text)]">
            {group.placed
              ? `${group.label} of about ${count(group.people)} people. Where it sits inside its cell is illustrative.`
              : `${group.label}: about ${count(group.people)} people in one ~10 km cell.`}
          </p>
        )}

        {facts ? (
          <div className={person || group ? 'border-t border-[var(--ov-divider)] pt-3' : ''}>
            <h3 className="ov-eyebrow mb-1">{modelled ? 'This ~55 km block, modelled' : 'This ~10 km cell'}</h3>
            <p className="ov-note mb-2 tabular-nums">
              {facts.year < 1 ? `${Math.abs(facts.year)} BCE` : `${facts.year} CE`} · centre{' '}
              {facts.latitude.toFixed(3)}°, {facts.longitude.toFixed(3)}°
            </p>
            <dl className="ov-kv ov-body">
              <dt>{modelled ? 'People in block' : 'People in cell'}</dt>
              <dd>≈ {count(facts.people)}</dd>
              <dt>3×3 neighbourhood</dt>
              <dd>≈ {count(facts.neighbourhoodPeople)}</dd>
              <dt>Way of life</dt>
              <dd>
                {facts.way === null ? (
                  'No one recorded'
                ) : (
                  <span style={{ color: cssRgb(facts.way) }}>{LOOKS[facts.way].name}</span>
                )}
              </dd>
            </dl>
            <p className="ov-body mt-3">{facts.confidence}</p>
            <p className="ov-note mt-2">
              {modelled
                ? 'Counts are the model\'s, not observations. Zero means the model puts no one here, not confirmed absence. The model has no land use, so everyone is drawn as a forager. Band placements are illustrative.'
                : 'Counts are decoded HYDE estimates. Zero means no population recorded in this image, not confirmed absence. Way of life is read from HYDE cropland and grazing in the cell, not recorded for any one group. Group placements are illustrative.'}
            </p>
          </div>
        ) : (
          <p className="ov-body">Population image for this year is not loaded yet.</p>
        )}

        {place && <EvidenceNearby lat={place.lat} lon={place.lon} year={place.year} />}
      </div>
    </section>
  );
}
