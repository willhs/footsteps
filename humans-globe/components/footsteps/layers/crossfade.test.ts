import type { MutableRefObject } from 'react';
import { computeFadeMs, handleTileLoad, triggerCrossfade } from './crossfade';
import { NEW_YEAR_FADE_MS, YEAR_FADE_MS } from '../hooks/useYearCrossfade';
import { createHumanLayerFactory } from './humanLayer';

jest.mock('@deck.gl/geo-layers', () => ({
  MVTLayer: class {
    props: Record<string, unknown>;
    constructor(props: Record<string, unknown>) {
      this.props = props;
    }
  },
}));

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

  it('crossfades when a tile error occurs after a tile loads', () => {
    const startCrossfade = jest.fn();
    const setTileLoading = jest.fn();
    const factory = createHumanLayerFactory({
      is3DMode: false,
      layerViewState: null,
      isZooming: false,
      isPanning: false,
      isYearCrossfading: false,
      newLayerReadyRef: { current: false } as MutableRefObject<boolean>,
      newLayerHasTileRef: { current: true } as MutableRefObject<boolean>,
      callbacks: {
        startCrossfade,
        setTileLoading,
        setTooltipData: jest.fn(),
      },
      metrics: {
        setFeatureCount: jest.fn(),
        setTotalPopulation: jest.fn(),
      },
    });
    const layer = factory(1500, 0, 1, 'test', true);
    layer.props.onTileError(new Error('boom'));
    expect(startCrossfade).toHaveBeenCalled();
  });

  it('does not crossfade on tile error if no tiles have loaded', () => {
    const startCrossfade = jest.fn();
    const setTileLoading = jest.fn();
    const factory = createHumanLayerFactory({
      is3DMode: false,
      layerViewState: null,
      isZooming: false,
      isPanning: false,
      isYearCrossfading: false,
      newLayerReadyRef: { current: false } as MutableRefObject<boolean>,
      newLayerHasTileRef: { current: false } as MutableRefObject<boolean>,
      callbacks: {
        startCrossfade,
        setTileLoading,
        setTooltipData: jest.fn(),
      },
      metrics: {
        setFeatureCount: jest.fn(),
        setTotalPopulation: jest.fn(),
      },
    });
    const layer = factory(1500, 0, 1, 'test', true);
    layer.props.onTileError(new Error('boom'));
    expect(startCrossfade).not.toHaveBeenCalled();
  });
});
