'use client';

import { ReactNode } from 'react';

interface ToggleButtonProps {
  pressed: boolean;
  onClick: () => void;
  label: string;
  title?: string;
  activeClassName: string;
  children: ReactNode;
}

export const TOGGLE_CONTAINER_TW =
  'inline-flex items-center gap-0 rounded-full bg-gray-700/70 p-0 backdrop-blur-md shadow-lg ring-1 ring-gray-600/40';

const BUTTON_TW =
  'w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full leading-none text-2xl transition-colors duration-200';

export default function ToggleButton({
  pressed,
  onClick,
  label,
  title,
  activeClassName,
  children,
}: ToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`${BUTTON_TW} ${
        pressed ? activeClassName : 'text-gray-200 hover:text-white hover:bg-white/10'
      }`}
      title={title ?? label}
      aria-pressed={pressed}
      aria-label={label}
    >
      {children}
    </button>
  );
}

