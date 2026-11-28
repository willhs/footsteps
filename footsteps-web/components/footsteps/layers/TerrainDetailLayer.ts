import { COORDINATE_SYSTEM, CompositeLayer, type UpdateParameters } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer, type BitmapLayerProps } from '@deck.gl/layers';
import {
  DETAIL_MAX_ZOOM,
  DETAIL_MIN_ZOOM,
  RECOLOUR_GLSL,
  WEIGHT_TAP_PX,
  detailTileUrl,
  hasDetailTile,
  type DetailManifest,
  detailZoomOffset,
} from '@/lib/terrainDetail';
import { TERRAIN_DESATURATE, TERRAIN_TINT } from './TerrainReliefLayer';

/** The era pair on screen (as the base Earth layers draw it) plus the pyramid's reference photo. */
export type TerrainDetailProps = {
  lower: ImageBitmap;
  upper: ImageBitmap;
  ref: ImageBitmap;
  manifest: DetailManifest;
  progress: number;
  /** Global sea level for the year, metres relative to today (lib/climate.ts). */
  seaLevel: number;
};

type Texture = ReturnType<BitmapLayer['context']['device']['createTexture']>;
type TileProps = BitmapLayerProps & {
  textures: [Texture, Texture, Texture];
  progress: number;
  tileIndex: [number, number, number];
  seaLevel: number;
};

const detail = {
  name: 'detail',
  fs: `uniform detailUniforms {
    vec3 tileIndex;
    float progress;
    float seaLevel;
    float tapPx;
    vec3 tint;
    float desaturate;
  } detail;
  uniform sampler2D eraLower;
  uniform sampler2D eraUpper;
  uniform sampler2D eraRef;
  ${RECOLOUR_GLSL}
  `,
  uniformTypes: {
    tileIndex: 'vec3<f32>',
    progress: 'f32',
    seaLevel: 'f32',
    tapPx: 'f32',
    tint: 'vec3<f32>',
    desaturate: 'f32',
  },
} as const;

/** One pyramid tile: the photo recoloured by each era image (lib/terrainDetail.ts `recolour`), then cross-faded. */
class DetailBitmapLayer extends BitmapLayer<TileProps> {
  static layerName = 'DetailBitmapLayer';

  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      modules: [...shaders.modules, detail],
      inject: {
        ...shaders.inject,
        'fs:#main-end': `
          float n = exp2(detail.tileIndex.z);
          vec2 world = (detail.tileIndex.xy + uv) / n;
          float lat = atan(sinh(3.14159265 * (1.0 - 2.0 * world.y)));
          vec2 eraUV = vec2(world.x, 0.5 - lat / 3.14159265);
          vec4 photo = texture(bitmapTexture, uv);
          // Trust in the photo, averaged over five taps (lib/terrainDetail.ts WEIGHT_TAP_PX).
          vec2 tap = detail.tapPx / vec2(textureSize(eraRef, 0));
          float w0 = 0.0;
          float w1 = 0.0;
          for (int i = 0; i < 5; i++) {
            vec2 o = i == 0 ? vec2(0.0) : i == 1 ? vec2(tap.x, 0.0) : i == 2 ? vec2(-tap.x, 0.0) : i == 3 ? vec2(0.0, tap.y) : vec2(0.0, -tap.y);
            vec3 r = texture(eraRef, eraUV + o).rgb;
            w0 += photoWeight(texture(eraLower, eraUV + o).rgb, r);
            w1 += photoWeight(texture(eraUpper, eraUV + o).rgb, r);
          }
          vec3 ref = texture(eraRef, eraUV).rgb;
          vec3 c0 = recolour(texture(eraLower, eraUV).rgb, ref, photo, detail.seaLevel, w0 / 5.0);
          vec3 c1 = recolour(texture(eraUpper, eraUV).rgb, ref, photo, detail.seaLevel, w1 / 5.0);
          vec3 c = mix(c0, c1, detail.progress);
          // BitmapLayer's desaturate then tint, as the base Earth layers draw it.
          c = mix(c, vec3((c.r + c.g + c.b) * 0.333333333), detail.desaturate);
          fragColor = vec4(c * detail.tint, layer.opacity);
          // This colour replaces the one the extensions filtered (the night shading, NightExtension.ts), so filter it again:
          // without this the layer stayed in daylight at night.
          DECKGL_FILTER_COLOR(fragColor, geometry);
        `,
      },
    };
  }

  draw(params: Parameters<BitmapLayer['draw']>[0]) {
    const [eraLower, eraUpper, eraRef] = this.props.textures;
    this.state.model?.setBindings({ eraLower, eraUpper, eraRef });
    this.state.model?.shaderInputs.setProps({ detail: {
      tileIndex: this.props.tileIndex,
      progress: this.props.progress,
      seaLevel: this.props.seaLevel,
      tapPx: WEIGHT_TAP_PX,
      tint: TERRAIN_TINT.map((v) => v / 255) as [number, number, number],
      desaturate: TERRAIN_DESATURATE,
    } });
    super.draw(params);
  }
}

async function loadTile(url: string, signal?: AbortSignal): Promise<ImageBitmap> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`detail tile: HTTP ${r.status}`);
  // Straight alpha: the photo's colour under alpha 0 (today's sea) is used on a modern-level sea.
  return createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
}

/**
 * The terrain colour pyramid over the era backdrop (docs/ops/terrain-images.md "Detail tiles"): z3-8 tiles of the
 * 500 m photo, one set for every year; the year comes from the two era images, so a scrub fetches no tiles.
 * Tiles the manifest lacks (open ocean) are never requested: the era image shows there.
 */
export default class TerrainDetailLayer extends CompositeLayer<TerrainDetailProps> {
  static layerName = 'TerrainDetailLayer';
  state!: { textures: [Texture, Texture, Texture]; zoomOffset?: number };

  initializeState() {}

  /** Props, or a zoom that crosses DETAIL_COARSE_BELOW (the tiles' zoom offset changes there). */
  shouldUpdateState({ changeFlags, context }: UpdateParameters<this>) {
    return Boolean(changeFlags.somethingChanged || (changeFlags.viewportChanged && detailZoomOffset(context.viewport.zoom) !== this.state.zoomOffset));
  }

  updateState({ props, oldProps }: UpdateParameters<this>) {
    if (props.lower === oldProps.lower && props.upper === oldProps.upper && props.ref === oldProps.ref) return;
    this.state.textures?.forEach((texture) => texture.destroy());
    const texture = (data: ImageBitmap) => this.context.device.createTexture({
      data, width: data.width, height: data.height,
      sampler: { minFilter: 'linear', magFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' },
    });
    this.setState({ textures: [texture(props.lower), texture(props.upper), texture(props.ref)] });
  }

  finalizeState() {
    this.state.textures?.forEach((texture) => texture.destroy());
  }

  renderLayers() {
    const { textures } = this.state;
    if (!textures || this.context.viewport.zoom < DETAIL_MIN_ZOOM - 0.5) return null;
    const { manifest } = this.props;
    const zoomOffset = detailZoomOffset(this.context.viewport.zoom);
    this.state.zoomOffset = zoomOffset;
    return new TileLayer<ImageBitmap | null>(this.getSubLayerProps({ id: 'tiles' }), {
      data: '/terrain/detail/{z}/{x}/{y}.webp',
      tileSize: 256,
      zoomOffset,
      minZoom: DETAIL_MIN_ZOOM,
      maxZoom: DETAIL_MAX_ZOOM,
      maxCacheSize: 120,
      maxRequests: 8,
      debounceTime: 100,
      refinementStrategy: 'best-available',
      getTileData: ({ index: { x, y, z }, signal }) =>
        hasDetailTile(manifest, z, x, y) ? loadTile(detailTileUrl(z, x, y), signal) : null,
      updateTriggers: { getTileData: manifest, renderSubLayers: [textures, this.props.progress, this.props.seaLevel] },
      renderSubLayers: (props) => {
        if (!props.data || !('west' in props.tile.bbox)) return null;
        const { west, south, east, north } = props.tile.bbox;
        const { x, y, z } = props.tile.index;
        return new DetailBitmapLayer({
          ...this.getSubLayerProps({ id: props.id }),
          id: props.id,
          image: props.data,
          textureParameters: { minFilter: 'linear', magFilter: 'linear' },
          bounds: [west, south, east, north],
          _imageCoordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          textures,
          progress: this.props.progress,
          seaLevel: this.props.seaLevel,
          tileIndex: [x, y, z],
          pickable: false,
          parameters: this.props.parameters,
        });
      },
    });
  }
}
