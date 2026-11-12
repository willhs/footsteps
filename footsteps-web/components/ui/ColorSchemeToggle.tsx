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
    <div className={`flex items-center gap-2 px-1 ${className || ''}`} role="group" aria-label="Color scheme">
      {schemes.map((scheme) => {
        const schemeData = COLOR_SCHEMES[scheme];
        const isActive = colorScheme === scheme;

        // Preview the highest-intensity colour of the scheme
        const previewColor = schemeData.colors.highest;
        const rgbString = `rgb(${previewColor[0]}, ${previewColor[1]}, ${previewColor[2]})`;

        return (
          <button
            type="button"
            key={scheme}
            onClick={() => onSchemeChange(scheme)}
            title={`${schemeData.name} dots`}
            className="ov-swatch"
            style={{ backgroundColor: rgbString }}
            aria-label={schemeData.name}
            aria-pressed={isActive}
          />
        );
      })}
    </div>
  );
}
