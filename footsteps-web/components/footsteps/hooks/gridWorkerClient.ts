import { settlementsFromParams } from '@/lib/settlements';
import { pastWaterParam } from '@/lib/pastWater';
import { spreadParam } from '@/lib/adjustedSpread';
import { iceParam } from '@/lib/iceSheets';

export function createGridWorker() {
  const worker = new Worker(new URL('./gridWorker.ts', import.meta.url));
  // Configure once before requests; cache keys then remain year-only and isolated.
  const params = new URLSearchParams(window.location.search);
  worker.postMessage({ settlements: settlementsFromParams(params), sites: params.get('sites') !== '0', pastWater: pastWaterParam(window.location.search), spread: spreadParam(window.location.search), ice: iceParam(window.location.search) });
  return worker;
}
