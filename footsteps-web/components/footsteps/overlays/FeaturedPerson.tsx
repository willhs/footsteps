import type { Person } from '../layers/people';
import { describePerson } from '../layers/people';
import { useState } from 'react';
import Portrait from './Portrait';
import { AVATAR_3D } from './avatarLazy';
import { avatarFromParams } from '@/lib/avatar';
import { useLazy } from '@/lib/lazyModule';

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
  // `?avatar=3d`: the 3D figure, as in the person panel (docs/ops/avatar.md); the drawing shows until its code is in.
  const [avatar3d] = useState(() => typeof window !== 'undefined' && avatarFromParams(window.location.search));
  const Avatar = useLazy(AVATAR_3D, avatar3d)?.default;
  const portrait = { person, year, lat: person.position[1] };
  return (
    // The whole card opens the person's panel (a button stretched under the content), except the figure, which takes
    // its own drags and clicks to turn and zoom (a button inside a button is not allowed, and a drag would open it).
    <div className="ov-panel pointer-events-auto relative shrink-0 px-3.5 py-3">
      <button
        type="button"
        onClick={onOpen}
        data-testid="featured-person"
        className="absolute inset-0 rounded-[inherit] transition-colors hover:bg-[var(--ov-hover,rgba(255,255,255,0.04))]"
        aria-label={`Someone here: ${title}. Open their details`}
      />
      <div className="pointer-events-none relative">
        <p className="ov-note mb-2 text-[var(--ov-text-3)]">Someone in view · imagined</p>
        <div className="flex gap-3">
          {Avatar ? (
            <div className="pointer-events-auto">
              <Avatar {...portrait} />
            </div>
          ) : (
            <Portrait {...portrait} />
          )}
          <div className="min-w-0">
            <p className="ov-title text-[var(--ov-warm)]">{title}</p>
            <p className="ov-body mt-1 text-[var(--ov-text)]">{detail}</p>
            <p className="ov-note mt-2 text-[var(--ov-text-3)]">Click for their day · or click anyone on the map</p>
          </div>
        </div>
      </div>
    </div>
  );
}
