import type { ReactNode } from 'react';

/** One labelled row in the map controls panel. The label hides on phones to
 * save width; the control inside keeps its own aria-label and tooltip. */
export default function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-3">
      <span className="ov-eyebrow hidden sm:block sm:mr-auto" aria-hidden="true">
        {label}
      </span>
      {children}
    </div>
  );
}
