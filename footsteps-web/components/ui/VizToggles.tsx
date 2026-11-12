'use client';

import type { ReactNode } from 'react';
import ToggleButton, { TOGGLE_CONTAINER_TW } from './ToggleButton';
import TerrainToggle from './TerrainToggle';
import ColorSchemeToggle from './ColorSchemeToggle';
import ControlRow from './ControlRow';
import { GlobeIcon, MapIcon } from './icons';
import { type ColorScheme } from '../footsteps/layers/color';

interface VizTogglesProps {
  showTerrain: boolean;
  onToggle: (enabled: boolean) => void;
  is3DMode: boolean;
  onModeChange: (is3D: boolean) => void;
  colorScheme: ColorScheme;
  onColorSchemeChange: (scheme: ColorScheme) => void;
  /** The dot colour only applies to the Dots view; hide it elsewhere. */
  showColorScheme?: boolean;
  className?: string;
  /** Extra rows (use ControlRow) appended to the panel. */
  children?: ReactNode;
}

/** The map controls panel (top right): one surface, one labelled row per setting. */
export default function VizToggles({
  showTerrain,
  onToggle,
  is3DMode,
  onModeChange,
  colorScheme,
  onColorSchemeChange,
  showColorScheme = true,
  className,
  children,
}: VizTogglesProps) {
  return (
    <div
      role="group"
      aria-label="Map controls"
      className={`ov-panel flex flex-col gap-2 p-2 sm:min-w-[232px] sm:p-3 ${className || ''}`}
    >
      <ControlRow label="View">
        <div className={TOGGLE_CONTAINER_TW} role="group" aria-label="View mode">
          <ToggleButton pressed={!is3DMode} onClick={() => onModeChange(false)} label="Map view" title="Flat map">
            <MapIcon />
          </ToggleButton>
          <ToggleButton pressed={is3DMode} onClick={() => onModeChange(true)} label="Globe view" title="3D globe">
            <GlobeIcon />
          </ToggleButton>
        </div>
      </ControlRow>

      <ControlRow label="Background">
        <TerrainToggle showTerrain={showTerrain} onToggle={onToggle} />
      </ControlRow>

      {showColorScheme && (
        <ControlRow label="Dot colour">
          <ColorSchemeToggle colorScheme={colorScheme} onSchemeChange={onColorSchemeChange} />
        </ControlRow>
      )}

      {children}
    </div>
  );
}
