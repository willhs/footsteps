import { decodeYearGrid, type YearGrid } from './gridData';
import { buildUnitMorph, type MorphPoints } from './unitMorph';
import type { Units } from '../layers/units';

declare const self: DedicatedWorkerGlobalScope;
export type GridReply =
  | { year: number; snapshot: YearGrid }
  | { year: number; error: string }
  | { id: string; morph: MorphPoints }
  | { id: string; error: string };
type Request =
  | { year: number }
  | { id: string; fromYear: number; toYear: number; zoomBucket: number };
// Retain only compact unit endpoints in the worker; render buffers transfer to
// the UI. This cache is independent of the UI's five decoded snapshots.
const units = new Map<number, Units>();
function remember(year: number, source: Units) {
  units.delete(year);
  units.set(year, source);
  if (units.size > 4) units.delete(units.keys().next().value!);
}
async function endpoints(year: number): Promise<Units> {
  const cached = units.get(year);
  if (cached) return cached;
  const snapshot = await decodeYearGrid(year);
  remember(year, snapshot.units);
  return snapshot.units;
}
function buffers(arrays: ArrayBufferView[]) {
  return [...new Set(arrays.map((array) => array.buffer))].filter(
    (buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer,
  );
}
self.onmessage = ({ data }: MessageEvent<Request>) => {
  if ('id' in data) {
    void Promise.all([endpoints(data.fromYear), endpoints(data.toYear)])
      .then(([from, to]) => {
        const morph = buildUnitMorph(from, to, data.zoomBucket);
        self.postMessage(
          { id: data.id, morph } satisfies GridReply,
          buffers(
            Object.values(morph.attributes).map((attribute) => attribute.value),
          ),
        );
      })
      .catch((error: unknown) =>
        self.postMessage({
          id: data.id,
          error: error instanceof Error ? error.message : String(error),
        } satisfies GridReply),
      );
    return;
  }
  const { year } = data;
  void decodeYearGrid(year)
    .then((snapshot) => {
      remember(year, snapshot.units);
      const arrays = [
        snapshot.data.positions,
        snapshot.data.people,
        snapshot.data.cellIds,
        snapshot.gridPoints.attributes.getRadius.value,
        snapshot.gridPoints.attributes.getFillColor.value,
      ];
      const publicSnapshot: YearGrid = {
        ...snapshot,
        units: { length: snapshot.units.length, counts: snapshot.units.counts },
      };
      self.postMessage(
        { year, snapshot: publicSnapshot } satisfies GridReply,
        buffers(arrays),
      );
    })
    .catch((error: unknown) =>
      self.postMessage({
        year,
        error: error instanceof Error ? error.message : String(error),
      } satisfies GridReply),
    );
};
