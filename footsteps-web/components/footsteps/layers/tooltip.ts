import {
  buildTooltipDataFromBinary,
  type PickingInfo,
} from '@/lib/binaryTileUtils';

export { type PickingInfo };

export function buildTooltipData(info: PickingInfo, year: number) {
  return buildTooltipDataFromBinary(info, year);
}
