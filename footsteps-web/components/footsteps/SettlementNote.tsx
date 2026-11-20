'use client';

import { useEffect, useState } from 'react';

const PIN_KEY = 'footsteps.settlementNote.pinned';

/**
 * The `?settlements=1` explainer: one line until tapped. Tapping opens it for now;
 * "Pin" keeps it open on later visits (remembered per viewer), "Close" folds it away.
 */
export function SettlementNote({ season }: { season: 'off' | 'june' | 'december' }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(PIN_KEY) === '1') setPinned(true);
    } catch {}
  }, []);
  const savePinned = (value: boolean) => {
    setPinned(value);
    try {
      localStorage.setItem(PIN_KEY, value ? '1' : '0');
    } catch {}
  };
  const expanded = open || pinned;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        data-testid="settlement-note-toggle"
        className="ov-panel ov-note pointer-events-auto absolute left-4 top-20 z-10 flex items-center gap-1.5 px-3 py-1.5 text-[var(--ov-text-2)] hover:text-[var(--ov-text)]"
      >
        <strong className="font-semibold">Settlement experiment · modelled</strong>
        <span aria-hidden>ⓘ</span>
        <span className="sr-only">Show details</span>
      </button>
    );
  }

  return (
    <div
      className="ov-panel pointer-events-auto absolute left-4 top-20 z-10 max-w-xs px-3.5 py-3"
      data-testid="settlement-note"
    >
      <div className="flex items-center justify-between gap-3">
        <strong className="ov-note text-[var(--ov-text)]">Settlement experiment · modelled</strong>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => savePinned(!pinned)}
            aria-pressed={pinned}
            data-testid="settlement-note-pin"
            className="ov-note text-[var(--ov-text-3)] hover:text-[var(--ov-text)]"
          >
            {pinned ? 'Pinned' : 'Pin'}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              savePinned(false);
            }}
            aria-label="Close"
            data-testid="settlement-note-close"
            className="ov-note text-[var(--ov-text-3)] hover:text-[var(--ov-text)]"
          >
            ✕
          </button>
        </span>
      </div>
      <ul className="ov-note mt-1.5 space-y-1 text-[var(--ov-text-2)]">
        <li>Cities: named, with local population budgets (modelled).</li>
        <li>Group sizes and clusters: scenarios from ethnographic analogs, not known settlements.</li>
        <li>Foragers: mobile bands, gatherings and semi-settled groups (imagined mix).</li>
        <li>Where a group sits: flat ground near fresh water or coast, never in the sea (modelled rule, imagined spot).</li>
        <li>Households: about 4–5 people each, round a group&apos;s spot (imagined layout).</li>
        <li>Hover a place to tint its regional group, a few hundred people (people modelled, edge imagined).</li>
        <li>Farm layouts: scattered, hamlet or villages apart, by analog society (modelled; places imagined).</li>
        {season !== 'off' && (
          <li>Seasonal rounds ({season === 'june' ? 'June' : 'December'}): foragers gather and herders shift; head counts stay the same (illustrative).</li>
        )}
      </ul>
    </div>
  );
}
