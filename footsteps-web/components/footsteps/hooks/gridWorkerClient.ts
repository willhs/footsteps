export function createGridWorker() {
  const worker = new Worker(new URL('./gridWorker.ts', import.meta.url));
  // Configure once before requests; cache keys then remain year-only and isolated.
  const params = new URLSearchParams(window.location.search);
  worker.postMessage({ settlements: params.get('settlements') === '1' || params.get('seasons') === '1', sites: params.get('sites') !== '0' });
  return worker;
}
