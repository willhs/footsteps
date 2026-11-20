import { ScatterplotLayer } from '@deck.gl/layers';
import type { AnimalInstance } from '@/lib/animals';
import { animClock } from '@/lib/gait';

const animalAnim = {
  name: 'animalAnim',
  vs: 'uniform animalAnimUniforms { float time; } animalAnim;',
  uniformTypes: { time: 'f32' },
} as const;

/** One GPU-animated upright silhouette per imagined animal; no per-frame data rebuild. */
export default class AnimalsLayer extends ScatterplotLayer<AnimalInstance> {
  static layerName = 'AnimalsLayer';
  static defaultProps = {
    ...ScatterplotLayer.defaultProps,
    getSeed: { type: 'accessor', value: (a: AnimalInstance) => a.seed },
    getShape: { type: 'accessor', value: (a: AnimalInstance) => a.shape },
  };
  initializeState() {
    super.initializeState();
    this.getAttributeManager()!.addInstanced({
      instanceSeed: { size: 1, accessor: 'getSeed' },
      instanceShape: { size: 1, accessor: 'getShape' },
    });
  }
  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      modules: [...shaders.modules, animalAnim],
      inject: {
        'vs:#decl':
          'in float instanceSeed; in float instanceShape; out float vShape; out float vStep;',
        'vs:DECKGL_FILTER_SIZE': `
        float t = animalAnim.time * 0.018 + instanceSeed * 6.283;
        // Bounded wander under 12 m: the 85 m person exclusion leaves room for the path.
        vec2 m = vec2(sin(t),cos(t*0.7))*12.0;
        vec2 right = normalize(vec2(project.viewProjectionMatrix[0][0],project.viewProjectionMatrix[1][0]));
        vec2 q = size.xy;
        size.xy = right*q.x*1.4 + project_size(m);
        size.z = (q.y + abs(q.x))*0.7;
        vShape = instanceShape;
        vStep = sin(animalAnim.time*1.2+instanceSeed*17.0)*0.05;
      `,
        'fs:#decl': `
        in float vShape; in float vStep;
        float limb(vec2 p,vec2 a,vec2 b,float r) {
          vec2 d=b-a; return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0))-r;
        }
      `,
        'fs:DECKGL_FILTER_COLOR': `
        vec2 p=geometry.uv;
        float d=length((p-vec2(-0.1,0.08))/vec2(0.53,0.29))-1.0;
        float neck=vShape>1.5&&vShape<2.5?0.65:0.35;
        d=min(d,limb(p,vec2(0.25,0.08),vec2(0.45,neck),0.13));
        d=min(d,length((p-vec2(0.57,neck))/vec2(0.22,0.13))-1.0);
        d=min(d,limb(p,vec2(-0.45,-0.08),vec2(-0.48+vStep,-0.65),0.045));
        d=min(d,limb(p,vec2(-0.25,-0.08),vec2(-0.21-vStep,-0.65),0.045));
        d=min(d,limb(p,vec2(0.1,-0.08),vec2(0.08-vStep,-0.65),0.045));
        d=min(d,limb(p,vec2(0.3,-0.08),vec2(0.34+vStep,-0.65),0.045));
        if(vShape>0.5&&vShape<1.5) {
          d=min(d,limb(p,vec2(0.66,0.32),vec2(0.75,-0.45),0.08));
          d=min(d,length((p-vec2(0.37,0.28))/vec2(0.16,0.24))-1.0);
        }
        if(vShape>1.5&&vShape<2.5) d=min(d,length((p-vec2(-0.18,0.32))/vec2(0.25,0.23))-1.0);
        if(vShape>2.5) {
          d=min(d,limb(p,vec2(0.51,0.43),vec2(0.42,0.68),0.025));
          d=min(d,limb(p,vec2(0.6,0.43),vec2(0.64,0.68),0.025));
        }
        if(d>0.0) discard;
      `,
      },
    };
  }
  draw(params: Parameters<ScatterplotLayer<AnimalInstance>['draw']>[0]) {
    this.state.model?.shaderInputs.setProps({
      animalAnim: { time: animClock() },
    });
    super.draw(params);
  }
}
