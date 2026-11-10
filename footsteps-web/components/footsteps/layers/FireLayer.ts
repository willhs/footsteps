// Firelight: people as flickering fires, one mark per so-many people, drawn as
// screen-sized sprites (a white-hot core in a warm halo) so they stay visible at
// any zoom, unlike the per-cell night lights that average away below a pixel.
//
// Marks are built once per data year with a random rank each; a zoom-driven
// threshold shows a fraction of them, so the number on screen stays roughly
// constant as you zoom (more, smaller-share marks as you go in). Placement in a
// cell is invented but stable per cell.
import type { DefaultProps } from '@deck.gl/core';
import { ScatterplotLayer, type ScatterplotLayerProps } from '@deck.gl/layers';
import type { GridData } from '../hooks/gridData';

export type FireMarks = {
  year: number;
  length: number;
  positions: Float32Array; // lon, lat
  size: Float32Array; // 0..1: log density of the mark's cell
  rank: Float32Array; // 0..1: shown when below the zoom threshold
  cellPeople: Float32Array; // people in the mark's cell (way of life proxy)
};

/** Marks across the whole world per year. */
export const FIRE_BUDGET = 150_000;
const MAX_PER_CELL = 12;
const LOG_MAX = Math.log1p(5_000_000);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildFireMarks(year: number, grid: GridData, budget = FIRE_BUDGET): FireMarks {
  const per = Math.max(1, grid.total / budget);
  const n = grid.length;
  const counts = new Uint8Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const x = grid.people[i] / per;
    const r = rng(grid.cellIds[i] * 2654435761 + 3)();
    const c = Math.min(MAX_PER_CELL, Math.floor(x) + (r < x - Math.floor(x) ? 1 : 0));
    counts[i] = c;
    total += c;
  }
  const out: FireMarks = {
    year,
    length: total,
    positions: new Float32Array(total * 2),
    size: new Float32Array(total),
    rank: new Float32Array(total),
    cellPeople: new Float32Array(total),
  };
  let j = 0;
  for (let i = 0; i < n; i++) {
    const c = counts[i];
    if (!c) continue;
    const r = rng(grid.cellIds[i] * 2246822519 + 11);
    const lon = grid.positions[i * 2];
    const lat = grid.positions[i * 2 + 1];
    const size = Math.log1p(grid.people[i]) / LOG_MAX;
    for (let k = 0; k < c; k++) {
      out.positions[j * 2] = lon + (r() - 0.5) * grid.cellDeg * 0.9;
      out.positions[j * 2 + 1] = lat + (r() - 0.5) * grid.cellDeg * 0.9;
      out.size[j] = size;
      out.rank[j] = r();
      out.cellPeople[j] = grid.people[i];
      j++;
    }
  }
  return out;
}

/** Share of marks shown at a zoom: about 4,500 world-wide at zoom 1.5, all by ~4. */
export function fireVisibleFraction(zoom: number) {
  return Math.min(1, 0.03 * Math.pow(4, zoom - 1.5));
}

const fire = {
  name: 'fire',
  vs: /* glsl */ `uniform fireUniforms {
  float time;
  float visible;
} fire;
`,
  fs: /* glsl */ `uniform fireUniforms {
  float time;
  float visible;
} fire;
`,
  uniformTypes: { time: 'f32', visible: 'f32' },
} as const;

type Props = ScatterplotLayerProps<unknown> & { visibleFraction: number };

export const FIRE_COLOR: [number, number, number] = [255, 190, 110];

// Additive: fires add light to whatever is under them.
export const FIRE_BLEND = {
  depthTest: false,
  blend: true,
  blendColorSrcFactor: 'src-alpha',
  blendColorDstFactor: 'one',
  blendAlphaSrcFactor: 'one',
  blendAlphaDstFactor: 'one',
} as const;

/** Instanced buffers for one year's marks (built once, reused by every frame). */
export function fireData(marks: FireMarks) {
  const radius = new Float32Array(marks.length);
  for (let i = 0; i < marks.length; i++) radius[i] = 4 + 9 * marks.size[i];
  return {
    length: marks.length,
    attributes: {
      getPosition: { value: marks.positions, size: 2 },
      getRadius: { value: radius, size: 1 },
      getRank: { value: marks.rank, size: 1 },
    },
  };
}

export default class FireLayer extends ScatterplotLayer<unknown, { visibleFraction: number }> {
  static layerName = 'FireLayer';
  static defaultProps: DefaultProps<Props> = {
    ...ScatterplotLayer.defaultProps,
    radiusUnits: 'pixels',
    stroked: false,
    filled: true,
    antialiasing: false,
    getFillColor: [...FIRE_COLOR, 255],
    visibleFraction: 1,
    parameters: FIRE_BLEND,
    pickable: false,
  } as DefaultProps<Props>;

  initializeState() {
    super.initializeState();
    this.getAttributeManager()!.addInstanced({
      instanceRank: { size: 1, accessor: 'getRank', defaultValue: 0 },
    });
  }

  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      modules: [...shaders.modules, fire],
      inject: {
        ...shaders.inject,
        'vs:#decl': 'in float instanceRank;\nout float vRank;',
        'vs:#main-end': `
  vRank = instanceRank;
  if (instanceRank > fire.visible) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
`,
        'fs:#decl': 'in float vRank;',
        'fs:DECKGL_FILTER_COLOR': `
  float d = length(geometry.uv);
  float ph = vRank * 6283.0;
  float f = 0.6 + fract(vRank * 97.0) * 1.4;
  float flicker = 0.72 + 0.28 * sin(fire.time * 7.0 * f + ph) * sin(fire.time * 3.1 + ph * 2.0);
  float core = exp(-d * d * 30.0);
  float halo = exp(-d * d * 6.0);
  color.rgb = mix(color.rgb, vec3(1.0), core * 0.8);
  color.a *= (core + halo * 0.45) * flicker;
`,
      },
    };
  }

  draw(params: Parameters<ScatterplotLayer['draw']>[0]) {
    this.state.model?.shaderInputs.setProps({
      fire: {
        time: (performance.now() / 1000) % 1000,
        visible: (this.props as unknown as Props).visibleFraction,
      },
    });
    super.draw(params);
  }
}
