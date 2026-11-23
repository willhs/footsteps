// The 3D person (`?avatar=3d`) loads on first use, never with the page (lib/lazyModule.ts, docs/ops/first-load.md).
// One Lazy for the card (GroundingPanel) and the prefetch after first people (FootstepsViz), so they share one download.
import { lazy } from '@/lib/lazyModule';

export const AVATAR_3D = lazy(() => import('./Avatar3D'));
