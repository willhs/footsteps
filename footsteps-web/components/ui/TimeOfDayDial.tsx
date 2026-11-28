'use client';

import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { DIAL_PAGE_HOURS, DIAL_STEP_HOURS, SKY_PHASE_ICON, formatHour, snapHour, wrapHour, type SkyPhase } from '@/lib/timeOfDay';

/** The dial's size, CSS pixels. */
const DIAL_SIZE_PX = 60;
/** The handle (the sun or moon) rides this far in from the dial's edge. */
const HANDLE_INSET_PX = 8;
/** Degrees round the dial per hour. */
const DEGREES_PER_HOUR = 360 / 24;

// The face: midnight at the bottom, noon at the top, morning on the left and evening on the right, as the sun climbs and sets.
// Muted, so it reads as a clock face and not as data.
const FACE_GRADIENT = `conic-gradient(from 180deg,
  #10142a 0deg, #10142a 60deg,
  #4a3a4f 82deg, #6d5d6a 100deg,
  #56718a 130deg, #5f7f99 180deg, #56718a 230deg,
  #6d5a5f 260deg, #4a3747 278deg,
  #10142a 300deg, #10142a 360deg)`;

/** Clockwise degrees from the top for an hour (noon at the top). */
const angleOf = (hour: number) => (wrapHour(hour) * DEGREES_PER_HOUR + 180) % 360;

/** The hour under a point, from its offset from the dial's centre (screen y grows downwards). */
function hourAt(dx: number, dy: number) {
  const fromTop = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return snapHour((fromTop + 180) / DEGREES_PER_HOUR);
}

/**
 * A round dial for the hour of the day the map shows. Drag the sun or moon round it, click a spot, or use the arrow keys.
 * `phase` (night, dawn, day or dusk at the view's centre) picks its icon.
 */
export default function TimeOfDayDial({ hour, phase, onChange }: { hour: number; phase: SkyPhase; onChange: (hour: number) => void }) {
  const face = useRef<HTMLDivElement>(null);

  const follow = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const box = face.current?.getBoundingClientRect();
      if (!box) return;
      onChange(hourAt(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2)));
    },
    [onChange],
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    follow(event);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) follow(event);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowRight: DIAL_STEP_HOURS,
      ArrowUp: DIAL_STEP_HOURS,
      ArrowLeft: -DIAL_STEP_HOURS,
      ArrowDown: -DIAL_STEP_HOURS,
      PageUp: DIAL_PAGE_HOURS,
      PageDown: -DIAL_PAGE_HOURS,
    };
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    onChange(snapHour(hour + step));
  };

  const radius = DIAL_SIZE_PX / 2 - HANDLE_INSET_PX;
  const angle = (angleOf(hour) * Math.PI) / 180;
  const handleX = Math.sin(angle) * radius;
  const handleY = -Math.cos(angle) * radius;
  const label = formatHour(hour);

  return (
    <div
      ref={face}
      role="slider"
      tabIndex={0}
      aria-label="Time of day (local sun time where you are looking)"
      aria-valuemin={0}
      aria-valuemax={24}
      aria-valuenow={hour}
      aria-valuetext={`${label}, ${phase}`}
      title="Time of day where you are looking: drag the sun round. People sleep, work and travel by it."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      className="relative shrink-0 cursor-grab touch-none select-none rounded-full border border-[var(--ov-border)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ov-warm)] active:cursor-grabbing"
      style={{ width: DIAL_SIZE_PX, height: DIAL_SIZE_PX, background: FACE_GRADIENT }}
    >
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] tabular-nums text-[var(--ov-text)]"
        style={{ fontFamily: 'var(--ov-mono)' }}
      >
        {label}
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 text-[13px] leading-none"
        style={{ transform: `translate(-50%, -50%) translate(${handleX}px, ${handleY}px)` }}
      >
        <Icon name={SKY_PHASE_ICON[phase]} />
      </span>
    </div>
  );
}
