'use client';

import ToggleButton, { TOGGLE_CONTAINER_TW } from './ToggleButton';
import { COLOR_SCHEMES, type ColorScheme } from '../footsteps/layers/color';

interface ColorSchemeToggleProps {
  colorScheme: ColorScheme;
  onSchemeChange: (scheme: ColorScheme) => void;
  className?: string;
}

export default function ColorSchemeToggle({
  colorScheme,
  onSchemeChange,
  className,
}: ColorSchemeToggleProps) {
  const schemes: ColorScheme[] = ['orange', 'cyan', 'magenta', 'white', 'red'];

  return (
    <div className={className}>
      <div className="text-xs text-gray-400 mb-2">Human Colors:</div>
      <div className={`${TOGGLE_CONTAINER_TW} flex-wrap gap-1`} role="group" aria-label="Color scheme">
        {schemes.map((scheme) => {
          const schemeData = COLOR_SCHEMES[scheme];
          const isActive = colorScheme === scheme;
          
          // Get the highest intensity color for the button preview
          const previewColor = schemeData.colors.highest;
          const rgbString = `rgb(${previewColor[0]}, ${previewColor[1]}, ${previewColor[2]})`;
          
          return (
            <ToggleButton
              key={scheme}
              pressed={isActive}
              onClick={() => onSchemeChange(scheme)}
              label={schemeData.name}
              title={`${schemeData.name} - Click to use this color scheme for human dots`}
              activeClassName="ring-2 ring-blue-400 scale-105"
              className="text-xs px-2 py-1 min-w-0 flex items-center gap-1"
            >
              <div 
                className="w-3 h-3 rounded-full border border-gray-600"
                style={{ backgroundColor: rgbString }}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">
                {scheme === 'orange' ? 'Def' : scheme.charAt(0).toUpperCase()}
              </span>
            </ToggleButton>
          );
        })}
      </div>
    </div>
  );
}