import type { MutableRefObject } from 'react';
import { computeFadeMs, handleTileLoad, triggerCrossfade } from './crossfade';
import { NEW_YEAR_FADE_MS, YEAR_FADE_MS } from '../hooks/useYearCrossfade';

describe('crossfade helpers', () => {
  it('computes fade duration based on state', () => {
    const ref = { current: true } as MutableRefObject<boolean>;
    expect(computeFadeMs(true, ref)).toBe(NEW_YEAR_FADE_MS);
    expect(computeFadeMs(false, ref)).toBe(YEAR_FADE_MS);
    ref.current = false;
    expect(computeFadeMs(true, ref)).toBe(0);
  });

  it('handles tile load state', () => {
    const hasTileRef = { current: false } as MutableRefObject<boolean>;
    let loading = true;
    const setTileLoading = (l: boolean) => {
      loading = l;
    };
    handleTileLoad(true, hasTileRef, setTileLoading);
    expect(loading).toBe(false);
    expect(hasTileRef.current).toBe(true);
  });

  it('triggers crossfade', () => {
    let loading = true;
    let crossfaded = false;
    triggerCrossfade(
      (l) => {
        loading = l;
      },
      () => {
        crossfaded = true;
      },
    );
    expect(loading).toBe(false);
    expect(crossfaded).toBe(true);
  });
});
