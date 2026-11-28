import type { GroundingFacts } from '../layers/grounding';
import EvidenceNearby from './EvidenceNearby';
import PersonDay, { type DayRequest } from './PersonDay';
import Portrait from './Portrait';
import { AVATAR_3D } from './avatarLazy';
import { FIGURE_NOTE, type CardFact, type Person, type PersonCard } from '../layers/people';
import { FactList, useInfoNotes } from './CardFacts';
import type { IconName } from '@/lib/icons';
import { CloseIcon } from '@/components/ui/icons';
import { LOOKS, WayOfLife, type WayOfLifeValue } from '@/lib/waysOfLife';
import { avatarFromParams } from '@/lib/avatar';
import { useLazy } from '@/lib/lazyModule';
import { useState } from 'react';

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
  person?: PersonCard | null;
  /** Facts for 'Imagine their day' (present when a person is selected). */
  day?: DayRequest | null;
  /** The selected person, for their illustrated portrait. */
  portrait?: { person: Person; year: number; lat: number } | null;
  /** The clicked place and slider year, for the dated sites nearby. */
  place?: { lat: number; lon: number; year: number } | null;
  onClose: () => void;
}) {
  const count = (n: number) => Math.round(n).toLocaleString();
  // `?avatar=3d`: the 3D figure instead of the drawing (docs/ops/avatar.md). The drawing shows until its code is in.
  const [avatar3d] = useState(() => typeof window !== 'undefined' && avatarFromParams(window.location.search));
  const Avatar = useLazy(AVATAR_3D, avatar3d && !!portrait)?.default;
  const personInfo = useInfoNotes('How this person is imagined');
  const cellInfo = useInfoNotes('How these counts are estimated');
  const personNotes = person
    ? [
        `Head count: ${modelled ? 'modelled' : 'a HYDE estimate'}. Age, role and place in camp are drawn from a modelled age structure for their way of life.`,
        ...person.notes,
        FIGURE_NOTE,
      ]
    : [];
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
              {portrait && (Avatar ? <Avatar {...portrait} /> : <Portrait {...portrait} />)}
              <div className="min-w-0 pt-0.5">
                <div className="flex items-start justify-between gap-1">
                  <p className="ov-title text-[var(--ov-warm)]">{person.title}</p>
                  {personInfo.button}
                </div>
                <FactList facts={person.facts} className="mt-1.5" />
              </div>
            </div>
            {personInfo.panel(personNotes)}
            {day && <PersonDay request={day} modelled={modelled} />}
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
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="ov-eyebrow">{modelled ? 'This ~55 km block' : 'This ~10 km cell'}</h3>
              {cellInfo.button}
            </div>
            <FactList facts={cellFacts(facts, modelled, count)} />
            {cellInfo.panel([
              `${facts.year < 1 ? `${Math.abs(facts.year)} BCE` : `${facts.year} CE`} · centre ${facts.latitude.toFixed(3)}°, ${facts.longitude.toFixed(3)}°.`,
              facts.confidence,
              modelled
                ? "Counts are the model's, not observations. Zero means the model puts no one here, not confirmed absence. The model has no land use, so everyone is drawn as a forager. Band placements are illustrative."
                : 'Counts are decoded HYDE estimates. Zero means no population recorded in this image, not confirmed absence. Way of life is read from HYDE cropland and grazing in the cell, not recorded for any one group. Group placements are illustrative.',
            ])}
          </div>
        ) : (
          <p className="ov-body">Population image for this year is not loaded yet.</p>
        )}

        {place && <EvidenceNearby lat={place.lat} lon={place.lon} year={place.year} />}
      </div>
    </section>
  );
}

/** An icon per way of life, for the cell's facts. */
const WAY_ICON: Record<WayOfLifeValue, IconName> = {
  [WayOfLife.Forager]: 'forager',
  [WayOfLife.Farmer]: 'farmer',
  [WayOfLife.Herder]: 'herder',
  [WayOfLife.Urban]: 'town',
};

/** The cell's counts as icon rows; the caveats sit behind the ⓘ. */
function cellFacts(facts: GroundingFacts, modelled: boolean, count: (n: number) => string): CardFact[] {
  return [
    { icon: 'people', text: `≈ ${count(facts.people)} ${modelled ? 'in this block' : 'in this cell'}`, label: 'People here' },
    { icon: 'spread', text: `≈ ${count(facts.neighbourhoodPeople)} around (3×3)`, label: 'Neighbourhood' },
    facts.way === null
      ? { icon: 'people', text: 'No one recorded', label: 'Way of life' }
      : { icon: WAY_ICON[facts.way], text: LOOKS[facts.way].name, label: 'Way of life' },
  ];
}
