// Close-up 3D landscape (default when zoomed in; ?close3d=0 turns it off): one ground mesh per Terrarium elevation tile,
// coloured and planted from the year's data (lib/close3d.ts), drawn under a tilted camera.
import { CompositeLayer, type UpdateParameters } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import {
  CLOSE3D_ZOOM,
  TREE_PX,
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
};

type TileData = { heights: Float32Array };
type Built = { key: string; mesh: TerrainMesh; plants: Plant[] };

const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const MESHES = plantMeshes();
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

export default class Close3DLayer extends CompositeLayer<Props> {
  static layerName = 'Close3DLayer';

  shouldUpdateState({ changeFlags }: UpdateParameters<this>) {
    return Boolean(changeFlags.somethingChanged || changeFlags.viewportChanged);
  }

  renderLayers() {
    const { zoom, latitude } = this.context.viewport as unknown as { zoom: number; latitude: number };
    if (zoom < CLOSE3D_ZOOM - 0.5) return null;
    const { ground, groundKey, seaLevel } = this.props;
    const key = `${groundKey}|${seaLevel.toFixed(1)}`;
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
      updateTriggers: { renderSubLayers: [key, Math.round(zoom * 4)] },
      renderSubLayers: (props) => {
        const data = props.data as TileData | null;
        if (!data || !('west' in props.tile.bbox)) return null;
        const bbox = props.tile.bbox as Bbox;
        const { x, y, z } = props.tile.index;
        let b = built.get(data);
        if (!b || b.key !== key) {
          b = {
            key,
            mesh: buildTerrainMesh(data.heights, bbox, seaLevel, ground),
            plants: plantsForTile(data.heights, bbox, [x, y, z], seaLevel, ground),
          };
          built.set(data, b);
        }
        const { mesh, plants } = b;
        const ground3d = new SimpleMeshLayer<{ p: [number, number, number] }>({
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
            },
            indices: { value: mesh.indices, size: 1 },
          },
          // Colours carry a baked hillshade (lib/close3d.ts): light them flat.
          material: { ambient: 1, diffuse: 0, shininess: 1, specularColor: [0, 0, 0] },
          pickable: false,
          parameters: { depthWriteEnabled: true, depthCompare: 'less-equal' },
        });
        const layers = [ground3d];
        for (const kind of ['conifer', 'broadleaf', 'acacia', 'shrub'] as const) {
          const these = plants.filter((p) => p.kind === kind);
          if (!these.length) continue;
          const [w, h] = TREE_PX[kind];
          layers.push(
            new SimpleMeshLayer<Plant>({
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

