'use client';

// Turn the features behind flags on and off from the map controls, remembered in this browser (lib/flagChoices.ts). Most features
// read their flag once at load, so a change waits for "Reload to apply", which keeps the view and year; a `live` one (other humans)
// changes at once.
import { flags } from '@/lib/flags';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { MENU_FLAGS, rememberChoice, withFlag, type MenuFlag } from '@/lib/flagChoices';

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const GROUPS: MenuFlag['group'][] = ['Close-up', 'People', 'Data', 'Extras'];

export default function FeaturesMenu({
  live,
  viewParams,
}: {
  /** Features that change without a reload: their current value and setter. */
  live: Record<string, { on: boolean; set: (on: boolean) => void }>;
  /** The view and year to keep across the reload. */
  viewParams: () => Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  // On as loaded (from the URL, where remembered choices were written at load) and as chosen since.
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const now = Object.fromEntries(MENU_FLAGS.map((f) => [f.name, flags().enabled(f.name)]));
    setLoaded(now);
    setChosen(now);
  }, []);

  const isOn = (f: MenuFlag) => (f.live && live[f.name] ? live[f.name].on : Boolean(chosen[f.name]));
  const onCount = MENU_FLAGS.filter((f) => isOn(f)).length;
  const pending = useMemo(() => MENU_FLAGS.some((f) => !f.live && chosen[f.name] !== loaded[f.name]), [chosen, loaded]);

  const toggle = (f: MenuFlag) => {
    const on = !isOn(f);
    rememberChoice(storage(), f, on);
    if (f.live && live[f.name]) {
      live[f.name].set(on);
      window.history.replaceState(null, '', withFlag(new URL(window.location.href), f, on));
      return;
    }
    setChosen((c) => ({ ...c, [f.name]: on }));
  };

  const reload = () => {
    const url = new URL(window.location.href);
    for (const f of MENU_FLAGS) if (!f.live) withFlag(url, f, Boolean(chosen[f.name]));
    for (const [k, v] of Object.entries(viewParams())) url.searchParams.set(k, v);
    window.location.assign(url.toString());
  };

  return (
    <>
      <div className="flex items-center justify-end gap-3">
        <span className="ov-eyebrow hidden sm:block sm:mr-auto" aria-hidden="true">
          Features
        </span>
        <button
          type="button"
          className="ov-seg-btn border border-[var(--ov-border)]"
          aria-expanded={open}
          aria-controls="features-menu"
          onClick={() => setOpen((o) => !o)}
          title="Turn imagined scenes, extra data layers and other new features on or off; remembered in this browser"
        >
          {onCount ? `${onCount} on` : 'Off'} {open ? '▴' : '▾'}
        </button>
      </div>
      {open && (
        <div id="features-menu" className="flex max-h-[55vh] flex-col gap-1.5 overflow-y-auto pr-1 sm:w-[232px]">
          {GROUPS.map((group) => (
            <Fragment key={group}>
              <span className="ov-eyebrow mt-1">{group}</span>
              {MENU_FLAGS.filter((f) => f.group === group).map((f) => (
                <label key={f.name} className="flex cursor-pointer items-start gap-2 text-xs leading-snug" title={f.hint}>
                  <input type="checkbox" className="mt-0.5 shrink-0" checked={isOn(f)} onChange={() => toggle(f)} />
                  <span>
                    {f.label}
                    {!f.live && chosen[f.name] !== loaded[f.name] && <span className="opacity-60"> · on reload</span>}
                  </span>
                </label>
              ))}
            </Fragment>
          ))}
          {pending && (
            <button type="button" className="ov-seg-btn mt-1 border border-[var(--ov-border)]" aria-pressed="true" onClick={reload}>
              Reload to apply
            </button>
          )}
        </div>
      )}
    </>
  );
}
