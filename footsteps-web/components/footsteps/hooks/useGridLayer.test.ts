import { act, renderHook, waitFor } from '@testing-library/react';
import useGridLayer, { loadGrid } from './useGridLayer';
import type { Units } from '../layers/units';

// Exercise the hook's layer inputs without requiring WebGL in jsdom.
jest.mock('../layers/GridYearLayer', () => ({
  __esModule: true,
  default: class {
    props: Record<string, unknown>;
    constructor(props: Record<string, unknown>) {
      this.props = props;
    }
    get id() {
      return this.props.id;
    }
    clone(props: Record<string, unknown>) {
      return new (this.constructor as new (
        p: Record<string, unknown>,
      ) => typeof this)({ ...this.props, ...props });
    }
  },
}));

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};
const fetchMock = jest.fn();
const bitmapClose = jest.fn();
jest.mock('./gridWorkerClient', () => ({
  createGridWorker: () => {
    const { decodeYearGrid } = jest.requireActual('./gridData');
    const { buildUnitMorph } = jest.requireActual('./unitMorph');
    const years = new Map<number, Units>();
    const worker = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      postMessage(
        request:
          | { year: number }
          | {
              id: string;
              fromYear: number;
              toYear: number;
              zoomBucket: number;
            },
      ) {
        if ('id' in request) {
          worker.onmessage?.({
            data: {
              id: request.id,
              morph: buildUnitMorph(
                years.get(request.fromYear)!,
                years.get(request.toYear)!,
                request.zoomBucket,
              ),
            },
          });
          return;
        }
        const { year } = request;
        void decodeYearGrid(year)
          .then((snapshot: { units: Units }) => {
            years.set(year, snapshot.units);
            worker.onmessage?.({ data: { year, snapshot } });
          })
          .catch((error: Error) => {
            worker.onmessage?.({ data: { year, error: error.message } });
          });
      },
      terminate() {},
    };
    return worker;
  },
}));
beforeAll(() => {
  global.fetch = fetchMock;
  global.createImageBitmap = jest
    .fn()
    .mockResolvedValue({ width: 2, height: 1, close: bitmapClose });
  global.OffscreenCanvas = class {
    getContext() {
      return {
        drawImage() {},
        getImageData: () => ({
          data: new Uint8ClampedArray([60, 0, 0, 255, 80, 0, 0, 255]),
        }),
      };
    }
  } as unknown as typeof OffscreenCanvas;
});
beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async () => ({
    ok: true,
    blob: async () => new Blob(),
  }));
});

test('deduplicates decoded snapshots, preserves seeded placements, retries failures and bounds the cache', async () => {
  const pending = loadGrid(-10000);
  expect(loadGrid(-10000)).toBe(pending);
  const a = await pending;
  expect(await loadGrid(-10000)).toBe(a);
  expect(a.data.length).toBe(2);
  expect(a.units.length).toBeGreaterThan(2);
  const b = await loadGrid(-9000);
  expect(b.units.counts).toEqual(a.units.counts);
  expect(bitmapClose).toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
  await expect(loadGrid(-8000)).rejects.toThrow('Grid -8000: HTTP 503');
  expect((await loadGrid(-8000)).data.positions).toEqual(
    new Float32Array([-90, 0, 90, 0]),
  );
  for (const year of [-7000, -6000, -5000, -4000]) await loadGrid(year);
  const reloaded = await loadGrid(-10000);
  expect(reloaded).not.toBe(a);
  expect(reloaded.units.counts).toEqual(a.units.counts);
});

test('prefetches neighbours, retains data while loading, ignores stale requests and changes only opacity during a fade', async () => {
  const setFeatureCount = jest.fn();
  const setTotalPopulation = jest.fn();
  const setMetricsLoading = jest.fn();
  const { result, rerender } = renderHook(
    ({ year }) =>
      useGridLayer({
        year,
        enabled: true,
        style: 'units',
        setFeatureCount,
        setTotalPopulation,
        setMetricsLoading,
      }),
    { initialProps: { year: 0 } },
  );
  await flush();
  await flush();
  const layer = () => result.current[0] as { props: Record<string, unknown> };
  act(() => (layer().props.onReady as () => void)());
  await waitFor(() => expect(layer().props.opacity).toBe(1));
  expect(layer().props.id).toBe('units-0');
  expect(layer().props.opacity).toBe(1);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
    expect.arrayContaining(['/grid/humans_-1000.png', '/grid/humans_100.png']),
  );
  const initialData = layer().props.data;
  jest.useFakeTimers();
  rerender({ year: 100 });
  await act(async () => {
    await Promise.resolve();
  });
  expect(
    result.current.map(
      (l) => (l as { props: { visible: boolean } }).props.visible,
    ),
  ).toEqual([true, false]);
  expect(layer().props.opacity).toBe(1);
  act(() =>
    (
      result.current[1] as unknown as { props: { onReady: () => void } }
    ).props.onReady(),
  );
  act(() => jest.advanceTimersByTime(150));
  expect(result.current).toHaveLength(2);
  expect(layer().props.data).toBe(initialData);
  const opacities = result.current.map((l) =>
    Math.pow((l as { props: { opacity: number } }).props.opacity, 1 / 2.2),
  );
  expect(opacities[1]).toBeCloseTo(0.5, 1);
  expect(opacities[0] + opacities[1]).toBeCloseTo(1, 8);
  act(() => jest.advanceTimersByTime(180));
  expect(layer().props.id).toBe('units-100');
  expect(layer().props.opacity).toBe(1);
  jest.useRealTimers();
  let resolveOld!: (v: unknown) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  rerender({ year: 700 });
  expect(layer().props.id).toBe('units-100');
  rerender({ year: 900 });
  await flush();
  const population =
    setTotalPopulation.mock.calls[
      setTotalPopulation.mock.calls.length - 1
    ]?.[0];
  await act(async () => {
    resolveOld({ ok: true, blob: async () => new Blob() });
  });
  expect(
    setTotalPopulation.mock.calls[
      setTotalPopulation.mock.calls.length - 1
    ]?.[0],
  ).toBe(population);
  expect(setTotalPopulation).toHaveBeenCalledTimes(3);
  expect(
    setFeatureCount.mock.calls[setFeatureCount.mock.calls.length - 1]?.[0],
  ).toBe((await loadGrid(900)).units.length);
});
