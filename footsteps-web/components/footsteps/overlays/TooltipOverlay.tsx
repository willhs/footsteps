'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import PopulationTooltip from './PopulationTooltip';

export interface TooltipData {
  population: number;
  coordinates: [number, number];
  year: number;
  settlementType?: string;
  clickPosition: { x: number; y: number };
}

interface TooltipContextValue {
  setTooltipData: (data: TooltipData | null) => void;
}

const TooltipContext = createContext<TooltipContextValue | undefined>(undefined);

export function useTooltipOverlay() {
  const ctx = useContext(TooltipContext);
  if (!ctx) {
    throw new Error('useTooltipOverlay must be used within TooltipOverlay');
  }
  return ctx.setTooltipData;
}

export default function TooltipOverlay({ children }: { children: ReactNode }) {
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);

  return (
    <TooltipContext.Provider value={{ setTooltipData }}>
      {children}
      <PopulationTooltip
        data={tooltipData}
        onClose={() => setTooltipData(null)}
      />
    </TooltipContext.Provider>
  );
}

