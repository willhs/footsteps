import { WayOfLife, cssRgb, type WayOfLifeValue } from '@/lib/waysOfLife';

/** The map's sign for a way of life, for the legend: the same shapes the group marks take at middle zoom
 * (MorphScatterplotLayer: a fire for a band, a house for a village, a tent for a herding camp, three roofs for a town). */
export default function WaySign({ way, size = 12 }: { way: WayOfLifeValue; size?: number }) {
  const fill = cssRgb(way);
  return (
    <svg width={size} height={size} viewBox="-1 -1 2 2" aria-hidden="true" className="mr-1.5 inline-block align-[-1px]">
      {way === WayOfLife.Forager && (
        <>
          <circle r="0.9" fill={fill} opacity="0.25" />
          <circle r="0.5" fill={fill} />
          <circle r="0.2" fill="#fff8e6" />
        </>
      )}
      {way === WayOfLife.Farmer && (
        <>
          <path d="M-0.62 -0.02 H0.62 V0.78 H-0.62 Z M-0.9 0.04 L0 -0.85 L0.9 0.04 Z" fill={fill} />
          <rect x="-0.14" y="0.22" width="0.28" height="0.56" fill="#fff8e6" />
        </>
      )}
      {way === WayOfLife.Herder && (
        <path d="M0 -0.85 L0.9 0.75 H0.24 L0 0.15 L-0.24 0.75 H-0.9 Z" fill={fill} />
      )}
      {way === WayOfLife.Urban && (
        <path d="M-0.78 -0.05 H-0.22 V0.85 H-0.78 Z M-0.25 -0.45 H0.35 V0.85 H-0.25 Z M0.34 0.25 H0.82 V0.85 H0.34 Z" fill={fill} />
      )}
    </svg>
  );
}
