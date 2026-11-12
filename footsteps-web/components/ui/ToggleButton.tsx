'use client';

import { ReactNode } from 'react';

interface ToggleButtonProps {
  pressed: boolean;
  onClick: () => void;
  label: string;
  title?: string;
  /** Extra classes when pressed (the shared pressed style comes from .ov-seg-btn). */
  activeClassName?: string;
  children: ReactNode;
}

/** Container for a row of ToggleButtons: a segmented control. */
export const TOGGLE_CONTAINER_TW = 'ov-seg';

export default function ToggleButton({
  pressed,
  onClick,
  label,
  title,
  activeClassName = '',
  children,
}: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ov-seg-btn ${pressed ? activeClassName : ''}`}
      title={title ?? label}
      aria-pressed={pressed}
      aria-label={label}
    >
      {children}
    </button>
  );
}
