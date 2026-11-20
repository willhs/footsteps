// Close-up 3D landscape (default when zoomed in; ?close3d=0 turns it off): one ground mesh per Terrarium elevation tile,
// coloured and planted from the year's data (lib/close3d.ts), drawn under a tilted camera.
import { CompositeLayer, type UpdateParameters } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import GroundDetail from './groundDetail';
import { ZOOM } from '../hooks/peopleView';
import { SHAPES } from '@/lib/dwellings';
import { shelterMeshes, type Shelter } from './shelters';
import {
  CLOSE3D_ZOOM,
  TREE_PX,
  EXAGGERATION,
  buildTerrainMesh,
  metersPerPixel,
  plantMeshes,
  plantsForTile,
  terrariumHeights,
  type Bbox,
  type Ground,
  type Plant,
  type TerrainMesh,
} from '@/lib/close3d';

type Props = {
  ground: Ground;
  /** Changes when `ground` describes a different year. */
  groundKey: string;
  seaLevel: number;
  /** Draw the imagined plant marks (`?plants=1`; off by default). */
  plants?: boolean;
  /** Paint the biome on the ground in the shader (`?ground=1`; off by default). */
  detail?: boolean;
  /** Dwellings to stand on the ground (`?shelters=1`; layers/shelters.ts). Each sits on the tile height under it, never in water. */
  shelters?: readonly Shelter[];
};
/** The dwelling under the cursor and the pointer's screen position. deck.gl calls a composite layer's own `onHover` for what its
 * sublayers pick (info.object is the picked dwelling), so the handler goes on this layer, not on the meshes. */
export type ShelterHover = { shelter: Shelter; x: number; y: number };
export function shelterHoverOf(info: { object?: unknown; x: number; y: number }): ShelterHover | null {
  const picked = info.object as { shelter?: Shelter } | null | undefined;
  return picked?.shelter ? { shelter: picked.shelter, x: info.x, y: info.y } : null;
}

type TileData = { heights: Float32Array };
type Standing = { shelter: Shelter; position: [number, number, number] };
type Built = { key: string; mesh: TerrainMesh; plants: Plant[] };

const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const MESHES = plantMeshes();
const GROUND_DETAIL = [new GroundDetail()];
const SHELTER_MESHES = shelterMeshes();
/** A dwelling is never drawn smaller than this on screen (pixels across), however far out: at zoom 12 a hut is a few metres in
 * ~15 m pixels, so it is enlarged to stay readable. Closer in it is its real size. */
const SHELTER_MIN_PX = 6;
/** Metres lifted above the ground mesh so a hut's floor is not cut by the 4-pixel-step relief. */
const SHELTER_LIFT_M = 1;
/** Pixels between the ground mesh's vertices (buildTerrainMesh's default `step`) and how many cells that makes across a 256-pixel tile. */
const MESH_STEP = 4;
const MESH_CELLS = 256 / MESH_STEP;
const built = new WeakMap<TileData, Built>();

async function loadHeights(url: string, signal?: AbortSignal): Promise<TileData> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`DEM ${r.status}`);
  const bitmap = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { heights: terrariumHeights(ctx.getImageData(0, 0, canvas.width, canvas.height).data) };
}

/** Every dwelling inside a tile, lifted to the tile's ground height there; those on water (at or below sea level) are left out. */
function standingOn(heights: Float32Array, bbox: Bbox, shelters: readonly Shelter[], seaLevel: number): Standing[] {
  const out: Standing[] = [];
  const dx = bbox.east - bbox.west;
  const dy = bbox.north - bbox.south;
  for (const shelter of shelters) {
    const [lon, lat] = shelter.position;
    const u = (lon - bbox.west) / dx;
    const w = (bbox.north - lat) / dy;
    if (u < 0 || u >= 1 || w < 0 || w >= 1) continue;
    // The ground mesh has a vertex every MESH_STEP pixels and slopes between them, so a pixel sample can sit under it on a hill: take
    // the highest of the four vertices round the point (the surface there is never above it).
    const fx = u * MESH_CELLS;
    const fy = w * MESH_CELLS;
    const [x0, y0] = [Math.floor(fx), Math.floor(fy)];
    let h = -Infinity;
    for (const gy of [y0, Math.min(MESH_CELLS, y0 + 1)])
      for (const gx of [x0, Math.min(MESH_CELLS, x0 + 1)])
        h = Math.max(h, heights[Math.min(255, gy * MESH_STEP) * 256 + Math.min(255, gx * MESH_STEP)]);
    if (h <= seaLevel) continue;
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

  shouldUpdateState({ changeFlags }: UpdateParameters<this>) {
    return Boolean(changeFlags.somethingChanged || changeFlags.viewportChanged);
  }

  renderLayers() {
    const { zoom, latitude } = this.context.viewport as unknown as { zoom: number; latitude: number };
    if (zoom < CLOSE3D_ZOOM - 0.5) return null;
    const { ground, groundKey, seaLevel, plants: drawPlants = false, detail = false, shelters = [] } = this.props;
    const key = `${groundKey}|${seaLevel.toFixed(1)}|${drawPlants ? 'p' : ''}${detail ? 'g' : ''}`;
    const mpp = metersPerPixel(zoom, latitude);
    return new TileLayer<TileData>(this.getSubLayerProps({ id: 'dem' }), {
      data: DEM,
      tileSize: 256,
      minZoom: 7,
      maxZoom: 13,
      maxCacheSize: 120,
      maxRequests: 6,
      debounceTime: 100,
      refinementStrategy: 'best-available',
      getTileData: ({ url, signal }) => loadHeights(url!, signal),
      updateTriggers: { renderSubLayers: [key, Math.round(zoom * 4), shelters] },
      renderSubLayers: (props) => {
        const data = props.data as TileData | null;
        if (!data || !('west' in props.tile.bbox)) return null;
        const bbox = props.tile.bbox as Bbox;
        const { x, y, z } = props.tile.index;
        let b = built.get(data);
        if (!b || b.key !== key) {
          b = {
            key,
            mesh: buildTerrainMesh(data.heights, bbox, seaLevel, ground, 4, detail),
            plants: drawPlants ? plantsForTile(data.heights, bbox, [x, y, z], seaLevel, ground) : [],
          };
          built.set(data, b);
        }
        const { mesh, plants } = b;
        const ground3d = new SimpleMeshLayer<{ p: [number, number, number] }>({
          ...this.getSubLayerProps({ id: `${props.id}-ground` }),
          id: `${props.id}-ground`,
          data: [{ p: [bbox.west, bbox.south, 0] }],
          getPosition: (d) => d.p,
          getColor: [255, 255, 255],
          _instanced: false,
          mesh: {
            attributes: {
              positions: { value: mesh.positions, size: 3 },
              normals: { value: mesh.normals, size: 3 },
              colors: { value: mesh.colors, size: 3 },
              // [dryCold, layer] per vertex for the GroundDetail shader.
              ...(mesh.texCoords ? { texCoords: { value: mesh.texCoords, size: 2 } } : {}),
            },
            indices: { value: mesh.indices, size: 1 },
          },
          extensions: detail ? GROUND_DETAIL : [],
          // Colours carry a baked hillshade (lib/close3d.ts): light them flat.
          material: { ambient: 1, diffuse: 0, shininess: 1, specularColor: [0, 0, 0] },
          pickable: false,
          parameters: { depthWriteEnabled: true, depthCompare: 'less-equal' },
        });
        const layers = [ground3d];
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

