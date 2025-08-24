'use client';

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
  const schemes: ColorScheme[] = ['cyan', 'white', 'black', 'violet'];

  return (
    <div className={`flex justify-center gap-1 ${className || ''}`} role="group" aria-label="Color scheme">
      {schemes.map((scheme) => {
        const schemeData = COLOR_SCHEMES[scheme];
        const isActive = colorScheme === scheme;
        
        // Get the highest intensity color for the button preview
        const previewColor = schemeData.colors.highest;
        const rgbString = `rgb(${previewColor[0]}, ${previewColor[1]}, ${previewColor[2]})`;
        
        // Special border handling for white scheme to ensure visibility
        const getBorderClass = () => {
          if (scheme === 'white') {
            return isActive ? 'border-blue-400' : 'border-gray-300';
          }
          return isActive ? 'border-blue-400' : 'border-gray-600';
        };

        return (
          <button
            key={scheme}
            onClick={() => onSchemeChange(scheme)}
            title={`${schemeData.name} - Click to use this color scheme for human dots`}
            className={`w-3 h-3 rounded-full border ${getBorderClass()}`}
            style={{ backgroundColor: rgbString }}
            aria-label={schemeData.name}
          />
        );
      })}
    </div>
  );
}
