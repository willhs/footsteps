// Close-up 3D landscape (default when zoomed in; ?close3d=0 turns it off): one ground mesh per Terrarium elevation tile,
// coloured and planted from the year's data (lib/close3d.ts), drawn under a tilted camera.
import { CompositeLayer, type UpdateParameters } from '@deck.gl/core';
import { TileLayer, _Tileset2D as Tileset2D } from '@deck.gl/geo-layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { PathLayer } from '@deck.gl/layers';
import { loadRivers, riversForTile, RIVER_MIN_PX, RIVER_RGB, type RiverPath, type Rivers } from '@/lib/rivers';
import GroundDetail, { type WeatherRef } from './groundDetail';
import { weatherFor } from '@/lib/weather';
import SkyLight from './skyLight';
import type { SceneLight } from '@/lib/sky';
import { ZOOM } from '../hooks/peopleView';
import { SHAPES } from '@/lib/dwellings';
import type { LakePlane } from '@/lib/pastWater';
import { shelterMeshes, type Shelter } from './shelters';
import type { TreeInstance, TreeClearing } from '@/lib/trees';
type TreeModule = typeof import('./TreeLayer');
import type { LandPatch } from './fields';
import { drapeLand, tileLandKey, type DrapedMesh } from './fieldsDrape';
import { BLOCK_M } from './fields';
import { groundAt, rememberGround } from '@/lib/groundHeights';
import { loadDetailManifest, loadDetailPixels, type DetailPixels } from '@/lib/terrainDetail';
import { coarsenFar, type TileIndex } from '@/lib/demLod';
import {
  CLOSE3D_ZOOM,
  TREE_PX,
  DEM_MAX_REQUESTS,
  DEM_TILE_URLS,
  EXAGGERATION,
  MESH_STEP,
  buildTerrainMesh,
  metersPerPixel,
  plantMeshes,
  plantsForTile,
  terrariumHeights,
  withIce,
  type Bbox,
  type IceCover,
  type Ground,
  type Plant,
  type TerrainMesh,
} from '@/lib/close3d';

type Props = {
  /** The year's ground; null until the era images and habitat lookup are in. Elevation tiles stream meanwhile, so the
   * ground is drawn as soon as both are there instead of the requests waiting for the year's data. */
  ground: Ground | null;
  /** Changes when `ground` describes a different year. */
  groundKey: string;
  /** Colour pyramid on (`?terrain_tiles=1`, lib/terrainDetail.ts): each ground tile takes its colour detail from the pyramid tile
   * over it. Fixed for the page load (it comes from the URL), so tiles never need fetching again when its manifest arrives. */
  colourTiles?: boolean;
  seaLevel: number;
  /** `?pastwater=1`, in a scenario's epoch: its water (lib/pastWater.ts). Its vertices are water at the epoch's own level, not `seaLevel`. */
  lake?: LakePlane | null;
  /** `?ice=1`: the dated ice sheet (lib/iceSheets.ts). Ground under it is ice: white, flat at sea level where it is grounded below the sea. */
  ice?: IceCover | null;
  /** Draw the imagined plant marks (`?plants=1`; off by default). */
  plants?: boolean;
  trees?: boolean;
  /** Present-day rivers (Natural Earth 10m) draped on the ground (lib/rivers.ts); on by default, `?rivers=0` off. */
  rivers?: boolean;
  clearings?: readonly TreeClearing[];
  /** Paint the biome on the ground in the shader (`?ground=1`; off by default). */
  detail?: boolean;
  /** Draw the imagined weather (`?weather=1`; lib/weather.ts): cloud shadows and gusts in the ground shader, with or without `detail`. */
  weather?: boolean;
  /** `?sky=1` (lib/sky.ts): the sun clock's light. The ground is built unshaded and lit, hazed and its water drawn in the shader
   * (layers/skyLight.ts); null or absent keeps the baked hillshade. */
  light?: SceneLight | null;
  /** With `light`: drawn metres the camera is lifted by (hooks/useGroundLift.ts), about the ground's height in view. Tells the tile
   * selection the ground stands that high, so it does not pick tiles as if the ground were at sea level and leave the foreground empty. */
  groundTop?: number;
  /** Dwellings to stand on the ground (`?shelters=1`; layers/shelters.ts). Each sits on the tile height under it, never in water. */
  shelters?: readonly Shelter[];
  /** Fields, gardens and paths round the groups in view (`?fields=1`; layers/fields.ts), draped on each tile (fieldsDrape.ts). `key` changes
   * with the patches, so a tile drapes them again only then. */
  land?: LandSet | null;
};
export type LandSet = { key: string; patches: readonly LandPatch[] };
/** A tile's draped land: the shapes' mesh, and the ground mesh with washes painted in (null: none, draw the plain ground). `key` is the land
 * set and ground it was last checked against; `tileKey` the tile's own patches and ground it was draped from. */
type Draped = { key: string; tileKey: string; solid: object | null; ground: object | null };
/** A field block (fields.ts BLOCK_M) narrower than this many screen pixels on a tile: the tile is not draped, the haze and the ground's own
 * colour stand in, and panning does not spend frames draping land nobody can make out. */
const LAND_MIN_PX = 1.5;
type TileData = { heights: Float32Array; detail: DetailPixels | null };
type Standing = { shelter: Shelter; position: [number, number, number] };
/** `meshProp` is the SimpleMeshLayer `mesh` object, kept so a re-render passes the same object and nothing is uploaded again. */
type Built = { key: string; mesh: TerrainMesh; meshProp: object; plants: Plant[] };

const MESHES = plantMeshes();
const GROUND_DETAIL = new GroundDetail();
const SKY_LIGHT = new SkyLight();
const SHELTER_MESHES = shelterMeshes();
/** A dwelling is never drawn smaller than this on screen (pixels across), however far out: at zoom 12 a hut is a few metres in
 * ~15 m pixels, so it is enlarged to stay readable. Closer in it is its real size. */
const SHELTER_MIN_PX = 6;
/** Metres lifted above the ground mesh so a hut's floor is not cut by the 4-pixel-step relief. */
const SHELTER_LIFT_M = 1;
/** The plant marks' candidate spots per tile: 900 per tile of the old, one zoom finer tiles, so 4× here (same density). */
const PLANT_CANDIDATES = 3600;
const built = new WeakMap<TileData, Built>();
/** Trees per DEM tile: candidates by era key (in random order, so a prefix is an even subsample) and which stand in the current clearings.
 * `rank` changes identity only when the clearings do, so deck rebuilds that one attribute and nothing else. */
const treeBuilt = new WeakMap<TileData, { key: string; trees: TreeInstance[]; clearingsKey: string; rank: (t: TreeInstance, info: { index: number }) => number }>();
const NO_CLEARINGS: readonly TreeClearing[] = [];
/** A tile's rivers, built once per ground key (sea level, past water and ice decide where they break). */
const riverBuilt = new WeakMap<TileData, { key: string; paths: RiverPath[] }>();
const draped = new WeakMap<TileData, Draped>();
const meshProp = (m: DrapedMesh | null) =>
  m && {
    attributes: {
      positions: { value: m.positions, size: 3 },
      normals: { value: m.normals, size: 3 },
      colors: { value: m.colors, size: 3 },
    },
    indices: { value: m.indices, size: 1 },
  };

/** Main-thread milliseconds of mesh building per frame. Tiles that arrive together are built over the next frames instead of in
 * one long task (each tile takes a few ms); a tile not built yet shows the flat map under it for a frame or two. */
const BUILD_BUDGET_MS = 8;
/** A new budget window opens this long after the last one opened (one frame at 60 Hz, a little more). */
const BUILD_WINDOW_MS = 14;
const budget = { start: -Infinity, spent: 0 };
function budgetLeft(now: number): boolean {
  if (now - budget.start > BUILD_WINDOW_MS) {
    budget.start = now;
    budget.spent = 0;
  }
  return budget.spent < BUILD_BUDGET_MS;
}

/** Latitude of the north edge of tile row `y` of `n`. */
const tileLat = (y: number, n: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;

/** deck.gl's tile selection with the far tiles of a tilted view merged into coarser parents (lib/demLod.ts): a far tile is
 * drawn small, so its parent still has as many vertices per screen pixel as a tile at the screen centre. */
class DemTileset extends Tileset2D {
  getTileIndices(opts: Parameters<Tileset2D['getTileIndices']>[0]): TileIndex[] {
    const indices = super.getTileIndices(opts) as TileIndex[];
    const viewport = opts.viewport as unknown as { pitch?: number; zoom: number; project: (p: number[]) => number[] };
    if (!viewport.pitch || indices.length < 4) return indices;
    const zMax = Math.max(...indices.map((t) => t.z));
    // A tile at the screen centre is 512 · 2^(zoom − z) px wide (deck.gl's 512 px world).
    const maxPx = 512 * 2 ** (viewport.zoom - zMax);
    const widthPx = (t: TileIndex) => {
      const n = 2 ** t.z;
      const [w, e] = [(t.x / n) * 360 - 180, ((t.x + 1) / n) * 360 - 180];
      const [north, south] = [tileLat(t.y, n), tileLat(t.y + 1, n)];
      const [a, b, c, d] = [[w, north], [e, north], [w, south], [e, south]].map(([lon, lat]) => viewport.project([lon, lat, 0]));
      if (![a, b, c, d].every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) return Infinity;
      return Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(d[0] - c[0], d[1] - c[1]));
    };
    return coarsenFar(indices, widthPx, maxPx, 2, opts.minZoom ?? 0);
  }
}

async function loadHeights(url: string, signal?: AbortSignal): Promise<TileData> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`DEM ${r.status}`);
  const bitmap = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { heights: terrariumHeights(ctx.getImageData(0, 0, canvas.width, canvas.height).data), detail: null };
}

/** Every dwelling inside a tile, lifted to the tile's ground height there; those on water (at or below sea level) are left out. */
function standingOn(heights: Float32Array, bbox: Bbox, shelters: readonly Shelter[], seaLevel: number): Standing[] {
  const out: Standing[] = [];
  for (const shelter of shelters) {
    const [lon, lat] = shelter.position;
    const h = groundAt(heights, bbox, lon, lat);
    if (h === null || h <= seaLevel) continue;
    out.push({ shelter, position: [lon, lat, h * EXAGGERATION + SHELTER_LIFT_M] });
  }
  return out;
}

export default class Close3DLayer extends CompositeLayer<Props> {
  static layerName = 'Close3DLayer';

  /** One instanced mesh layer per shape: a handful of shapes × the material colours, so it stays cheap. */
  shelterLayers(
    id: string, heights: Float32Array, bbox: Bbox, shelters: readonly Shelter[], seaLevel: number, mpp: number, zoom: number,
  ) {
    const standing = standingOn(heights, bbox, shelters, seaLevel);
    // Fade in with the people (who arrive from peopleIn to peopleFull), and grow so a hut is at least SHELTER_MIN_PX across.
    const t = Math.min(1, Math.max(0, (zoom - ZOOM.peopleIn + 0.4) / (ZOOM.peopleFull - ZOOM.peopleIn)));
    const grow = Math.max(1, (SHELTER_MIN_PX * mpp) / 5);
    return SHAPES.flatMap((shape) => {
      const these = standing.filter((s) => s.shelter.shape === shape);
      if (!these.length) return [];
      return [
        new SimpleMeshLayer<Standing>(this.getSubLayerProps({ id: `${id}-shelters-${shape}` }), {
          id: `${id}-shelters-${shape}`,
          data: these,
          mesh: SHELTER_MESHES[shape],
          getPosition: (s) => s.position,
          getColor: (s) => s.shelter.rgb,
          getScale: (s) => s.shelter.size,
          getOrientation: (s) => [0, 0, s.shelter.yaw],
          sizeScale: grow,
          opacity: t * t * (3 - 2 * t),
          material: { ambient: 0.55, diffuse: 0.7, shininess: 2, specularColor: [10, 10, 10] },
          pickable: true,
          parameters: { depthWriteEnabled: true, depthCompare: 'less-equal' },
        }),
      ];
    });
  }

  declare state: { buildTick: number; rebuildQueued: boolean; weatherRef: WeatherRef; treeModule: TreeModule | null; rivers: Rivers | null };

  /** The tile's fields, gardens and paths (`?fields=1`), draped once per tile and land set under the frame budget, then reused: the shapes'
   * mesh, and the ground mesh again with the washes (grazed grass) painted into its colours. Null while the budget is spent. */
  drapeFor(data: TileData, bbox: Bbox, z: number, land: LandSet, groundKey: string, ground: Built): Draped | null {
    const { seaLevel, lake = null, ice = null } = this.props;
    const key = `${land.key}|${groundKey}`;
    const d = draped.get(data);
    if (d && d.key === key) return d;
    const t0 = performance.now();
    if (!budgetLeft(t0)) {
      this.queueRebuild();
      return null;
    }
    // A new set in view, but this tile's own patches may be the same: then keep its drape.
    const tileKey = `${tileLandKey(land.patches, bbox)}|${groundKey}`;
    if (d && d.tileKey === tileKey) {
      d.key = key;
      budget.spent += performance.now() - t0;
      return d;
    }
    const mesh = drapeLand(data.heights, bbox, z, land.patches, seaLevel, lake, ice);
    let painted: object | null = null;
    if (mesh.paint) {
      const { weight, rgb } = mesh.paint;
      const colors = ground.mesh.colors.slice();
      for (let v = 0; v < weight.length; v++) {
        const w = weight[v];
        if (w > 0) for (let c = 0; c < 3; c++) colors[v * 3 + c] += (rgb[v * 3 + c] - colors[v * 3 + c]) * w;
      }
      const base = ground.meshProp as { attributes: Record<string, unknown>; indices: unknown };
      painted = { attributes: { ...base.attributes, colors: { value: colors, size: 3 } }, indices: base.indices };
    }
    const out = { key, tileKey, solid: meshProp(mesh.solid), ground: painted };
    draped.set(data, out);
    budget.spent += performance.now() - t0;
    return out;
  }

  /** A tile's land, fading in with the people as the dwellings do: the ground again with the washes painted in (the same vertices as the
   * ground, so it lies exactly on it and wins the depth test, drawn after it), then the draped shapes. */
  landLayers(id: string, bbox: Bbox, d: Draped, zoom: number, detail: boolean) {
    const t = Math.min(1, Math.max(0, (zoom - ZOOM.peopleIn + 0.4) / (ZOOM.peopleFull - ZOOM.peopleIn)));
    const fade = t * t * (3 - 2 * t);
    if (fade <= 0) return [];
    const part = (name: string, mesh: object, extra: object) =>
      new SimpleMeshLayer<{ p: [number, number, number] }>({
        ...this.getSubLayerProps({ id: `${id}-${name}` }),
        id: `${id}-${name}`,
        data: [{ p: [bbox.west, bbox.south, 0] }],
        getPosition: (p) => p.p,
        getColor: [255, 255, 255],
        _instanced: false,
        mesh: mesh as never,
        opacity: fade,
        material: { ambient: 1, diffuse: 0, shininess: 1, specularColor: [0, 0, 0] },
        pickable: false,
        ...extra,
      });
    return [
      ...(d.ground ? [part('land-paint', d.ground, { extensions: detail ? GROUND_DETAIL : [], parameters: { depthWriteEnabled: false, depthCompare: 'less-equal' } })] : []),
      ...(d.solid ? [part('land', d.solid, { parameters: { depthWriteEnabled: true, depthCompare: 'less-equal', depthBias: -2, depthBiasSlopeScale: -2 } })] : []),
    ];
  }


  initializeState() {
    this.state = { buildTick: 0, rebuildQueued: false, weatherRef: { current: null }, treeModule: null, rivers: null };
    if (this.props.trees) import('./TreeLayer').then(treeModule => {
      if (this.internalState) this.setState({ treeModule });
    });
    if (this.props.rivers !== false) loadRivers().then(rivers => {
      if (this.internalState) this.setState({ rivers });
    }).catch((error) => console.warn('[rivers] failed to load', error));
  }

  shouldUpdateState({ changeFlags }: UpdateParameters<this>) {
    return Boolean(changeFlags.somethingChanged || changeFlags.viewportChanged);
  }

  /** Some tile went unbuilt this frame (over BUILD_BUDGET_MS): render the tiles again next frame to build it. */
  queueRebuild() {
    if (this.state.rebuildQueued) return;
    this.state.rebuildQueued = true;
    requestAnimationFrame(() => {
      if (!this.internalState) return; // finalized meanwhile
      this.setState({ buildTick: this.state.buildTick + 1, rebuildQueued: false });
    });
  }

  /** Screen pixels a 20 m tree spans at the tile's point nearest the camera (its corners and centre, on the mean ground). */
  treePixels(bbox: Bbox, heights: Float32Array): number {
    const viewport = this.context.viewport;
    const lat = (bbox.north + bbox.south) / 2;
    const step = 20 / (111320 * Math.cos((lat * Math.PI) / 180));
    const h = heights[128 * 256 + 128] * EXAGGERATION;
    let best = 0;
    for (const lon of [bbox.west, (bbox.west + bbox.east) / 2, bbox.east])
      for (const y of [bbox.south, lat, bbox.north]) {
        const [ax, ay] = viewport.project([lon, y, h]);
        const [bx, by] = viewport.project([lon + step, y, h]);
        best = Math.max(best, Math.hypot(bx - ax, by - ay));
      }
    return best;
  }

  /** Coarse camera key: tree LOD is re-judged per tile when the camera moves enough to change it, not every frame. */
  treeViewKey(): string {
    const v = this.context.viewport as unknown as { longitude: number; latitude: number; bearing?: number; pitch?: number };
    return `${Math.round(v.longitude * 400)},${Math.round(v.latitude * 400)},${Math.round((v.bearing ?? 0) / 10)},${Math.round((v.pitch ?? 0) / 5)}`;
  }

  renderLayers() {
    const { zoom, latitude } = this.context.viewport as unknown as { zoom: number; latitude: number };
    if (zoom < CLOSE3D_ZOOM - 0.5) return null;
    const { ground: bare, groundKey, seaLevel, lake = null, ice = null, plants: drawPlants = false, trees = false, clearings = NO_CLEARINGS, detail = false, weather = false, shelters = [], colourTiles = false, light = null, groundTop = 0, land = null } = this.props;
    const lit = light !== null;
    const ground = bare && ice ? withIce(bare, ice) : bare;
    // The weather is the place at the screen centre's, set on every view change: the ground tiles read it each frame without being rebuilt.
    const centre = this.context.viewport as unknown as { longitude: number };
    this.state.weatherRef.current = weather && ground ? weatherFor(ground.precipAt(centre.longitude, latitude), latitude) : null;
    const key = `${groundKey}|${seaLevel.toFixed(1)}|${drawPlants ? 'p' : ''}${detail ? 'g' : ''}${weather ? 'w' : ''}${lit ? 'l' : ''}${lake ? `|${lake.key}` : ''}${ice ? `|${ice.key}` : ''}`;
    const mpp = metersPerPixel(zoom, latitude);
    const clearKey = trees && this.state.treeModule ? this.state.treeModule.clearingsKey(clearings) : '';
    return new TileLayer<TileData>(this.getSubLayerProps({ id: 'dem' }), {
      data: DEM_TILE_URLS,
      TilesetClass: DemTileset,
      tileSize: 256,
      // One zoom coarser than the screen would pick, meshed at MESH_STEP: the same vertex spacing with a quarter of the tiles.
      zoomOffset: -1,
      minZoom: 6,
      maxZoom: 13,
      maxCacheSize: 120,
      maxRequests: DEM_MAX_REQUESTS,
      debounceTime: 100,
      refinementStrategy: 'best-available',
      // Lit (`?sky=1`): the ground may stand far above sea level under a lifted camera; select tiles for that height range.
      ...(lit && groundTop > 0 ? { zRange: [0, groundTop * 1.2] as [number, number] } : {}),
      getTileData: async ({ url, signal, index: { x, y, z }, bbox }) => {
        const colour = colourTiles ? loadDetailManifest().then((m) => loadDetailPixels(m, z, x, y)).catch(() => null) : null;
        const [data, tile] = await Promise.all([loadHeights(url!, signal), colour]);
        if ('west' in bbox) rememberGround(`${z}/${x}/${y}`, bbox as Bbox, data.heights);
        return { ...data, detail: tile };
      },
      updateTriggers: { renderSubLayers: [key, Math.round(zoom * 4), shelters, clearKey, this.state.treeModule, this.state.rivers, this.state.buildTick, trees ? this.treeViewKey() : '', light?.key, land?.key] },
      renderSubLayers: (props) => {
        const data = props.data as TileData | null;
        if (!data || !ground || !('west' in props.tile.bbox)) return null;
        const bbox = props.tile.bbox as Bbox;
        const { x, y, z } = props.tile.index;
        let b = built.get(data);
        if (!b || b.key !== key) {
          const t0 = performance.now();
          if (!budgetLeft(t0)) {
            this.queueRebuild();
            return null;
          }
          // The colour pyramid's tile over this ground tile, when tiles are on (lib/terrainDetail.ts).
          const tileGround = data.detail && ground.withDetail ? ground.withDetail(data.detail) : ground;
          const mesh = buildTerrainMesh(data.heights, bbox, seaLevel, tileGround, MESH_STEP, detail || weather, lake, ice, lit, detail);
          b = {
            key,
            mesh,
            meshProp: {
              attributes: {
                positions: { value: mesh.positions, size: 3 },
                normals: { value: mesh.normals, size: 3 },
                colors: { value: mesh.colors, size: 3 },
                // [dryCold, layer] per vertex for the GroundDetail shader (biome detail and wind); the layer marks open water for SkyLight.
                ...(mesh.texCoords ? { texCoords: { value: mesh.texCoords, size: 2 } } : {}),
              },
              indices: { value: mesh.indices, size: 1 },
            },
            plants: drawPlants ? plantsForTile(data.heights, bbox, [x, y, z], seaLevel, tileGround, PLANT_CANDIDATES) : [],
          };
          built.set(data, b);
          budget.spent += performance.now() - t0;
        }
        const { meshProp, plants } = b;
        // Screen pixels per 20 m at the tile's nearest point: tree thinning and whether fields are worth draping here.
        const px20 = (trees && zoom >= 11 && this.state.treeModule) || land?.patches.length ? this.treePixels(bbox, data.heights) : 0;
        const landHere = land?.patches.length && px20 * (BLOCK_M / 20) >= LAND_MIN_PX ? this.drapeFor(data, bbox, z, land, key, b) : null;
        const ground3d = new SimpleMeshLayer<{ p: [number, number, number] }>({
          ...this.getSubLayerProps({ id: `${props.id}-ground` }),
          id: `${props.id}-ground`,
          data: [{ p: [bbox.west, bbox.south, 0] }],
          getPosition: (d) => d.p,
          getColor: [255, 255, 255],
          _instanced: false,
          mesh: meshProp as never,
          extensions: [...(detail || weather ? [GROUND_DETAIL] : []), ...(lit ? [SKY_LIGHT] : [])],
          groundBiome: detail,
          weatherRef: weather ? this.state.weatherRef : null,
          ...(lit ? { skyLight: light } : {}),
          // Colours carry a baked hillshade (lib/close3d.ts), or none when SkyLight lights them: light them flat.
          material: { ambient: 1, diffuse: 0, shininess: 1, specularColor: [0, 0, 0] },
          pickable: false,
          parameters: { depthWriteEnabled: true, depthCompare: 'less-equal' },
        });
        const layers = [ground3d];
        const rivers = this.state.rivers;
        if (rivers) {
          let r = riverBuilt.get(data);
          if (!r || r.key !== key) {
            r = { key, paths: riversForTile(rivers, data.heights, bbox, seaLevel, ground, lake) };
            riverBuilt.set(data, r);
          }
          if (r.paths.length)
            layers.push(new PathLayer<RiverPath>({
              ...this.getSubLayerProps({ id: `${props.id}-rivers` }),
              id: `${props.id}-rivers`,
              data: r.paths,
              getPath: (p) => p.path,
              getWidth: (p) => p.width,
              widthUnits: 'meters',
              widthMinPixels: RIVER_MIN_PX,
              getColor: RIVER_RGB,
              jointRounded: true,
              capRounded: true,
              pickable: false,
              parameters: { depthWriteEnabled: true, depthCompare: 'less-equal' },
            }) as unknown as typeof ground3d);
        }
        const treeShare = trees && zoom >= 11 && this.state.treeModule ? this.state.treeModule.treeLodShare(px20) : 0;
        if (treeShare > 0 && this.state.treeModule) {
          const { default: TreeLayer, treesForTile, clearedMask, TREE_MAPPING } = this.state.treeModule;
          let cached = treeBuilt.get(data);
          if (!cached || cached.key !== key) {
            cached = { key, trees: treesForTile(data.heights, bbox, [x, y, z], seaLevel, ground, lake), clearingsKey: '', rank: () => 0 };
            treeBuilt.set(data, cached);
          }
          if (cached.clearingsKey !== clearKey) {
            const mask = clearedMask(cached.trees, clearings);
            const n = cached.trees.length;
            cached.rank = (_t, { index }) => (mask[index] ? 2 : index / n);
            cached.clearingsKey = clearKey;
          }
          // The same data array every frame, so deck keeps the instance buffers; distance thinning is a uniform (TreeLayer).
          layers.push(new TreeLayer({
            ...this.getSubLayerProps({ id: `${props.id}-trees` }),
            id: `${props.id}-trees`, data: cached.trees,
            iconAtlas: '/trees/atlas.webp', iconMapping: TREE_MAPPING,
            getIcon: t => `${t.kind}-${t.variant}`, getPosition: t => t.position,
            getSize: t => t.height, getColor: t => t.tint, sizeUnits: 'meters',
            getRank: cached.rank, lodShare: treeShare, updateTriggers: { getRank: cached.clearingsKey },
            billboard: true, alphaCutoff: 0.25, pickable: false,
            parameters: { depthWriteEnabled: true, depthCompare: 'less-equal' },
          }) as unknown as typeof ground3d);
        }
        if (landHere) layers.push(...(this.landLayers(props.id, bbox, landHere, zoom, detail) as unknown as typeof layers));
        if (shelters.length) layers.push(...(this.shelterLayers(props.id, data.heights, bbox, shelters, seaLevel, mpp, zoom) as unknown as typeof layers));
        for (const kind of ['conifer', 'broadleaf', 'acacia', 'shrub'] as const) {
          const these = plants.filter((p) => p.kind === kind);
          if (!these.length) continue;
          const [w, h] = TREE_PX[kind];
          layers.push(
            new SimpleMeshLayer<Plant>({
              ...this.getSubLayerProps({ id: `${props.id}-${kind}` }),
              id: `${props.id}-${kind}`,
              data: these,
              mesh: kind === 'conifer' ? MESHES.cone : MESHES.blob,
              getPosition: (p) => p.position,
              getColor: (p) => p.rgb,
              getScale: (p) => [w * p.scale, w * p.scale, h * p.scale],
              sizeScale: mpp,
              material: { ambient: 0.5, diffuse: 0.7, shininess: 2, specularColor: [10, 10, 10] },
              pickable: false,
              parameters: { depthWriteEnabled: true, depthCompare: 'less-equal' },
              updateTriggers: { getPosition: key, getColor: key },
            }) as unknown as SimpleMeshLayer<{ p: [number, number, number] }>,
          );
        }
        return layers;
      },
    });
  }
}

