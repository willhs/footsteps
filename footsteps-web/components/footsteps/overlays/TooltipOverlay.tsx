'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

export interface TooltipData {
  population: number;
  coordinates: [number, number];
  year: number;
  settlementType?: string;
  clickPosition: { x: number; y: number };
}

interface TooltipContextValue {
  tooltipData: TooltipData | null;
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

/** The clicked dot's data, drawn in the left column by FootstepsViz (no floating popup). */
export function useTooltipData() {
  const ctx = useContext(TooltipContext);
  if (!ctx) throw new Error('useTooltipData must be used within TooltipOverlay');
  return ctx.tooltipData;
}

export default function TooltipOverlay({ children }: { children: ReactNode }) {
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);

  return (
    <TooltipContext.Provider value={{ tooltipData, setTooltipData }}>{children}</TooltipContext.Provider>
  );
}

