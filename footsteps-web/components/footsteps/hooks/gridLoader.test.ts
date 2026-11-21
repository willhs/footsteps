// The worker answers a year twice: its decoded grid first, then the full snapshot with units. The far-out firelight
// (loadGridData) must not wait for the units; loadGrid still waits for everything.
type Listener = ((event: { data: unknown }) => void) | null;
const sent: unknown[] = [];
const worker = { onmessage: null as Listener, onerror: null, postMessage: (m: unknown) => sent.push(m), terminate() {} };
jest.mock('./gridWorkerClient', () => ({ createGridWorker: () => worker }));

import { loadGrid, loadGridData } from './gridLoader';

const grid = (year: number) => ({ year, length: 1 }) as never;
const reply = (data: unknown) => worker.onmessage?.({ data });
const settled = async <T,>(p: Promise<T>) => {
  let done = false;
  p.then(() => (done = true), () => (done = true));
  await new Promise((r) => setTimeout(r, 0));
  return done;
};

it('gives the grid as soon as it is decoded, before the units', async () => {
  const data = loadGridData(-1000);
  const full = loadGrid(-1000);
  expect(sent).toEqual([{ year: -1000 }]); // one request for both
  reply({ year: -1000, data: grid(-1000) });
  await expect(data).resolves.toEqual(grid(-1000));
  expect(await settled(full)).toBe(false);
  // Asked again while the units build: answered from the early grid, no new request.
  await expect(loadGridData(-1000)).resolves.toEqual(grid(-1000));
  reply({ year: -1000, snapshot: { year: -1000, data: grid(-1000) } });
  await expect(full).resolves.toMatchObject({ year: -1000 });
  expect(sent).toHaveLength(1);
});

it('still answers from the full snapshot if no early grid comes', async () => {
  const data = loadGridData(0);
  reply({ year: 0, snapshot: { year: 0, data: grid(0) } });
  await expect(data).resolves.toEqual(grid(0));
});

it('rejects the grid when the year fails', async () => {
  const data = loadGridData(100);
  reply({ year: 100, error: 'HTTP 404' });
  await expect(data).rejects.toThrow('HTTP 404');
});
