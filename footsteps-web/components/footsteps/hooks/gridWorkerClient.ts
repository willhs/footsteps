import { flags } from '@/lib/flags';

export function createGridWorker() {
  const worker = new Worker(new URL('./gridWorker.ts', import.meta.url));
  // Configure once before requests; cache keys then remain year-only and isolated.
  worker.postMessage({ settlements: flags().enabled('settlements'), sites: flags().enabled('sites'), pastWater: flags().enabled('pastwater'), spread: flags().enabled('spread'), ice: flags().enabled('ice') });
  return worker;
}
