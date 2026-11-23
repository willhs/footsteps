import { LayerExtension, type Layer } from '@deck.gl/core';
import type { SunPosition } from '@/lib/sunTime';

type NightProps = { nightSun: SunPosition | null };
const night = {
  name: 'night',
  fs: `uniform nightUniforms { vec2 sun; float enabled; } night;
    float nightBrightness(vec2 p) {
      float altitude = sin(p.y) * sin(night.sun.y)
        + cos(p.y) * cos(night.sun.y) * cos(p.x - night.sun.x);
      return mix(0.22, 1.0, smoothstep(-0.104528, 0.0, altitude));
    }`,
  uniformTypes: { sun: 'vec2<f32>', enabled: 'f32' },
} as const;

/** Scale existing colours; never relight baked terrain or dim people's fires.
 * Interpolate common-space positions, then invert the projection per fragment:
 * interpolating latitude directly across Mercator triangles would bend the terminator. */
export default class NightExtension extends LayerExtension {
  static extensionName = 'NightExtension';
  static defaultProps = { nightSun: { type: 'object', value: null, compare: true } };

  getShaders(this: Layer) {
    return {
      modules: [night],
      inject: {
        'vs:#decl': 'out vec3 nightPosition; flat out int nightGlobe;',
        'vs:DECKGL_FILTER_GL_POSITION': `
          nightGlobe = project.projectionMode == PROJECTION_MODE_GLOBE ? 1 : 0;
          nightPosition = geometry.position.xyz + project.commonOrigin;
        `,
        'fs:#decl': 'in vec3 nightPosition; flat in int nightGlobe;',
        // A plain string (see skyLight.ts): deck.gl joins extensions' injections as text, so an object form breaks beside any other.
        'fs:DECKGL_FILTER_COLOR': `
            if (night.enabled > 0.5) {
            vec2 nightPoint;
            if (nightGlobe == 1) {
              vec3 n = normalize(nightPosition);
              nightPoint = vec2(atan(n.x, -n.y), asin(clamp(n.z, -1.0, 1.0)));
            } else {
              vec2 p = nightPosition.xy * (6.28318530718 / 512.0) - 3.14159265359;
              nightPoint = vec2(p.x, 2.0 * atan(exp(p.y)) - 1.57079632679);
            }
            color.rgb *= nightBrightness(nightPoint);
            }
          `,
      },
    };
  }

  draw(this: Layer<NightProps>) {
    const sun = this.props.nightSun;
    for (const model of this.getModels()) {
      model.shaderInputs.setProps({ night: {
        sun: sun ? [sun.longitude * Math.PI / 180, sun.declination * Math.PI / 180] : [0, 0],
        enabled: sun ? 1 : 0,
      } });
    }
  }
}
