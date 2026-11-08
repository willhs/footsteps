export function createGridWorker() {
  return new Worker(new URL('./gridWorker.ts', import.meta.url));
}
