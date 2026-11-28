import { useId, useState } from 'react';
import type { CardFact } from '../layers/people';
import { Icon } from '@/components/ui/Icon';

/** A card's facts as icon + short label rows (a picture first, words second). */
export function FactList({ facts, className = '' }: { facts: CardFact[]; className?: string }) {
  return (
    <ul className={`ov-body flex flex-col gap-0.5 text-[var(--ov-text)] ${className}`}>
      {facts.map((f) => (
        <li key={f.label} className="flex items-baseline gap-1.5" title={f.label}>
          <Icon name={f.icon} className="w-5 shrink-0 text-center" />
          <span>
            <span className="sr-only">{f.label}: </span>
            {f.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A small ⓘ that shows a card's caveats (how it is estimated, what is imagined) only when asked. */
export function useInfoNotes(label: string) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      aria-controls={id}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
      className={`ov-icon-btn h-6 w-6 shrink-0 text-[13px] ${open ? 'text-[var(--ov-text)]' : ''}`}
    >
      <Icon name="info" />
    </button>
  );
  const panel = (notes: string[]) =>
    open && notes.length > 0 ? (
      <ul id={id} className="ov-note mt-2 flex list-disc flex-col gap-1 pl-4 text-[var(--ov-text-3)]">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    ) : null;
  return { button, panel };
}
