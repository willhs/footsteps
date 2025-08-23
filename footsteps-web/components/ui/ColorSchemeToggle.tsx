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
  const schemes: ColorScheme[] = ['white', 'cyan', 'violet', 'black'];

  return (
    <div className={className}>
      <div className={`${TOGGLE_CONTAINER_TW} gap-0.5`} role="group" aria-label="Color scheme">
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
              activeClassName="ring-1 ring-blue-400"
              className="p-0.5 min-w-0"
            >
              <div 
                className="w-4 h-4 rounded-full border border-gray-600"
                style={{ backgroundColor: rgbString }}
                aria-hidden="true"
              />
            </ToggleButton>
          );
        })}
      </div>
    </div>
  );
}