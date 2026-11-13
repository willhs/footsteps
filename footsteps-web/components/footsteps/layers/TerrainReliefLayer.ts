import { COORDINATE_SYSTEM, CompositeLayer, type UpdateParameters } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer, type BitmapLayerProps } from '@deck.gl/layers';

/** The decoded pair actually on screen, including while a new year is loading. */
export type TerrainSurface = {
  lower: ImageBitmap;
  upper: ImageBitmap;
  progress: number;
};
type Texture = ReturnType<BitmapLayer['context']['device']['createTexture']>;
type ReliefProps = BitmapLayerProps & {
  surface: [Texture, Texture];
  progress: number;
  tileIndex: [number, number, number];
};

const relief = {
  name: 'relief',
  fs: `uniform reliefUniforms {
    vec3 tileIndex;
    float progress;
    float zoom;
  } relief;
  uniform sampler2D eraLower;
  uniform sampler2D eraUpper;
  float elevationAt(sampler2D dem, vec2 p) {
    // Linear RGB weights commute with bilinear filtering: four hardware
    // samples per slope instead of sixteen manual texelFetch operations.
    return dot(texture(dem, p).rgb, vec3(65280.0, 255.0, 0.99609375)) - 32768.0;
  }
  float grain(vec2 p) {
    p = fract(p * vec2(0.1031, 0.1030));
    p += dot(p, p.yx + 33.33);
    return fract(p.x * p.y);
  }
  float landAt(vec3 c) {
    // Era oceans/lakes are blue; snow is neutral. Use each endpoint's mask
    // before fading, so a temporary mixed coast cannot shade the open sea.
    float blue = (c.b - max(c.r, c.g)) / max(0.02, max(c.r, c.g));
    return 1.0 - smoothstep(0.03, 0.18, blue);
  }
  `,
  uniformTypes: { tileIndex: 'vec3<f32>', progress: 'f32', zoom: 'f32' },
} as const;

class ReliefBitmapLayer extends BitmapLayer<ReliefProps> {
  static layerName = 'ReliefBitmapLayer';

  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      modules: [...shaders.modules, relief],
      inject: {
        ...shaders.inject,
        'fs:#main-end': `
          float n = exp2(relief.tileIndex.z);
          vec2 world = (relief.tileIndex.xy + uv) / n;
          float lat = atan(sinh(3.14159265 * (1.0 - 2.0 * world.y)));
          vec2 eraUV = vec2(world.x, 0.5 - lat / 3.14159265);
          vec3 c0 = texture(eraLower, eraUV).rgb;
          vec3 c1 = texture(eraUpper, eraUV).rgb;
          vec3 c = mix(c0, c1, relief.progress);
          float land = mix(landAt(c0), landAt(c1), relief.progress);
          float fade = smoothstep(5.0, 7.0, relief.zoom) * land;
          if (fade < 0.001) discard;
          vec2 px = 1.0 / vec2(textureSize(bitmapTexture, 0));
          float metres = 40075016.686 * cos(lat) / (n * 256.0);
          // At tile edges use a one-sided difference, without a dark seam.
          vec2 lo = max(uv - px, px * 0.5);
          vec2 hi = min(uv + px, 1.0 - px * 0.5);
          float dx = (elevationAt(bitmapTexture, vec2(hi.x, uv.y)) - elevationAt(bitmapTexture, vec2(lo.x, uv.y)))
            / max(1.0, (hi.x - lo.x) * 256.0 * metres);
          float dy = (elevationAt(bitmapTexture, vec2(uv.x, hi.y)) - elevationAt(bitmapTexture, vec2(uv.x, lo.y)))
            / max(1.0, (hi.y - lo.y) * 256.0 * metres);
          vec3 normal = normalize(vec3(-dx, dy, 1.0));
          float light = dot(normal, normalize(vec3(-0.6, 0.6, 0.8)));
          float shadow = clamp((0.686 - light) * 0.65, -0.12, 0.32);
          // Illustrative, world-anchored grain, classified by era colour.
          // Coarser clumps for forest, fine grass, elongated sand ripples.
          float sand = smoothstep(0.01, 0.12, c.r - c.b);
          float forest = 1.0 - smoothstep(0.12, 0.28, max(c.r, c.g));
          vec2 ground = world * 262144.0;
          vec2 scale = mix(vec2(1.0), vec2(0.3, 1.8), sand);
          scale *= mix(1.0, 0.45, forest);
          vec2 g = ground * scale;
          float noise = grain(floor(g));
          // Suppress subpixel grain instead of sparkling when zooming/panning.
          float aa = 1.0 - smoothstep(0.4, 1.2, max(fwidth(g.x), fwidth(g.y)));
          float ice = smoothstep(0.5, 0.75, min(c.r, min(c.g, c.b)));
          shadow += (noise - 0.5) * 0.10 * aa * (1.0 - ice)
            * smoothstep(6.0, 8.0, relief.zoom);
          fragColor = vec4(shadow >= 0.0 ? vec3(0.055, 0.09, 0.14) : vec3(0.65, 0.73, 0.8),
            abs(shadow) * fade * layer.opacity);
        `,
      },
    };
  }

  draw(params: Parameters<BitmapLayer['draw']>[0]) {
    this.state.model?.setBindings({ eraLower: this.props.surface[0], eraUpper: this.props.surface[1] });
    this.state.model?.shaderInputs.setProps({ relief: {
      tileIndex: this.props.tileIndex,
      progress: this.props.progress,
      zoom: this.context.viewport.zoom,
    } });
    super.draw(params);
  }
}

/** One pair of shared era textures; DEM tile cache survives every scrub. */
export default class TerrainReliefLayer extends CompositeLayer<TerrainSurface> {
  static layerName = 'TerrainReliefLayer';
  state!: { surface: [Texture, Texture] };

  initializeState() {}

  shouldUpdateState({ changeFlags }: UpdateParameters<this>) {
    return Boolean(changeFlags.somethingChanged);
  }

  updateState({ props, oldProps }: UpdateParameters<this>) {
    if (props.lower === oldProps.lower && props.upper === oldProps.upper) return;
    this.state.surface?.forEach((texture) => texture.destroy());
    const texture = (data: ImageBitmap) => this.context.device.createTexture({
      data, width: data.width, height: data.height,
      sampler: { minFilter: 'linear', magFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' },
    });
    this.setState({ surface: [texture(props.lower), texture(props.upper)] });
  }

  finalizeState() {
    this.state.surface?.forEach((texture) => texture.destroy());
  }

  renderLayers() {
    const { surface } = this.state;
    if (!surface || this.context.viewport.zoom < 5) return null;
    return new TileLayer<ImageBitmap>(this.getSubLayerProps({ id: 'dem' }), {
      data: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
      tileSize: 256,
      minZoom: 5,
      maxZoom: 15,
      maxCacheSize: 100,
      maxRequests: 6,
      debounceTime: 150,
      refinementStrategy: 'no-overlap',
      loadOptions: { imagebitmap: { colorSpaceConversion: 'none' } },
      updateTriggers: { renderSubLayers: [surface, this.props.progress] },
      renderSubLayers: (props) => {
        if (!('west' in props.tile.bbox)) return null;
        const { west, south, east, north } = props.tile.bbox;
        const { x, y, z } = props.tile.index;
        return new ReliefBitmapLayer({
          id: props.id,
          image: props.data,
          textureParameters: { minFilter: 'linear', magFilter: 'linear' },
          bounds: [west, south, east, north],
          _imageCoordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          surface,
          progress: this.props.progress,
          tileIndex: [x, y, z],
          pickable: false,
          parameters: { depthWriteEnabled: false, depthCompare: 'less-equal' },
        });
      },
    });
  }
}
