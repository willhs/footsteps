import { Model, Framebuffer, Texture2D } from '@luma.gl/engine';

// Simple GPU-based interpolator that mixes two density textures
// and produces an intermediate texture using a fragment shader.
export class GPUDensityInterpolant {
  private model: Model;
  private framebuffer: Framebuffer;
  private output: Texture2D;
  private fromTex: Texture2D;
  private toTex: Texture2D;

  constructor(
    gl: WebGL2RenderingContext,
    fromImage: HTMLImageElement | HTMLCanvasElement,
    toImage: HTMLImageElement | HTMLCanvasElement,
  ) {
    this.fromTex = new Texture2D(gl, { data: fromImage, mipmaps: false });
    this.toTex = new Texture2D(gl, { data: toImage, mipmaps: false });
    const { width, height } = this.fromTex;
    this.output = new Texture2D(gl, { width, height, mipmaps: false });
    this.framebuffer = new Framebuffer(gl, { colorAttachments: [this.output] });

    this.model = new Model(gl, {
      vs: `
        attribute vec2 positions;
        varying vec2 vUV;
        void main() {
          vUV = positions * 0.5 + 0.5;
          gl_Position = vec4(positions, 0.0, 1.0);
        }
      `,
      fs: `
        precision highp float;
        uniform sampler2D uFrom;
        uniform sampler2D uTo;
        uniform float uProgress;
        varying vec2 vUV;
        void main() {
          float fromRho = texture2D(uFrom, vUV).r;
          float toRho = texture2D(uTo, vUV).r;
          float rho = mix(fromRho, toRho, uProgress);
          gl_FragColor = vec4(rho, rho, rho, 1.0);
        }
      `,
      attributes: {
        positions: new Float32Array([-1, -1, 3, -1, -1, 3]),
      },
      vertexCount: 3,
      uniforms: {
        uFrom: this.fromTex,
        uTo: this.toTex,
        uProgress: 0,
      },
    });
  }

  step(progress: number) {
    this.model.setUniforms({ uProgress: progress });
    this.model.draw({ framebuffer: this.framebuffer });
  }

  getTexture(): Texture2D {
    return this.output;
  }

  delete() {
    this.model.delete();
    this.framebuffer.delete();
    this.output.delete();
    this.fromTex.delete();
    this.toTex.delete();
  }
}
