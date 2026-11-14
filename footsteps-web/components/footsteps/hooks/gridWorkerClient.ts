export function createGridWorker() {
  const worker = new Worker(new URL('./gridWorker.ts', import.meta.url));
  // Configure once before requests; cache keys then remain year-only and isolated.
  worker.postMessage({ settlements: new URLSearchParams(window.location.search).get('settlements') === '1' });
  return worker;
}
