import { CompositeLayer, type Layer } from '@deck.gl/core';
import { BitmapLayer } from '@deck.gl/layers';
import { Framebuffer, Texture2D, Model, Geometry } from '@luma.gl/webgl';

export interface GpuInterpolationLayerProps {
  id: string;
  startTexture: Texture2D;
  endTexture: Texture2D;
  t: number; // interpolation parameter 0..1
}

/**
 * Minimal GPU-based interpolation layer. Uses a ping-pong framebuffer pair
 * and a fragment shader that linearly blends between start and end densities.
 * This is a scaffold for more advanced advection/diffusion as outlined in
 * `docs/research/interpolation/gpu-interpolation-guide.md`.
 */
export class GpuInterpolationLayer extends CompositeLayer<GpuInterpolationLayerProps> {
  static layerName = 'GpuInterpolationLayer';

  initializeState(): void {
    const { gl } = this.context;
    const { startTexture } = this.props;

    const width = startTexture.width;
    const height = startTexture.height;

    // Create ping-pong framebuffers
    const texA = new Texture2D(gl, {
      width,
      height,
      format: gl.R32F,
      type: gl.FLOAT,
    });
    const texB = new Texture2D(gl, {
      width,
      height,
      format: gl.R32F,
      type: gl.FLOAT,
    });

    const fbA = new Framebuffer(gl, {
      width,
      height,
      colorAttachments: [texA],
    });
    const fbB = new Framebuffer(gl, {
      width,
      height,
      colorAttachments: [texB],
    });

    // Simple model that blends start/end textures
    const vs = `
      attribute vec2 positions;
      varying vec2 vTexCoord;
      void main() {
        vTexCoord = positions * 0.5 + 0.5;
        gl_Position = vec4(positions, 0.0, 1.0);
      }
    `;
    const fs = `
      precision highp float;
      uniform sampler2D startTex;
      uniform sampler2D endTex;
      uniform float uT;
      varying vec2 vTexCoord;
      void main() {
        float a = texture2D(startTex, vTexCoord).r;
        float b = texture2D(endTex, vTexCoord).r;
        float rho = mix(a, b, uT);
        gl_FragColor = vec4(rho, 0.0, 0.0, 1.0);
      }
    `;

    const quad = new Geometry({
      drawMode: gl.TRIANGLE_STRIP,
      attributes: {
        positions: new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      },
    });

    const model = new Model(gl, { vs, fs, geometry: quad, isInstanced: false });

    // Initialize stateA with startTexture
    fbA.attach({ [gl.COLOR_ATTACHMENT0]: startTexture });

    this.setState({ fbA, fbB, model, current: fbA, next: fbB });
  }

  draw({}) {
    const { endTexture, t } = this.props;
    const { model, current, next } = this.state as {
      model: Model;
      current: Framebuffer;
      next: Framebuffer;
    };
    if (!model) return;

    model.setUniforms({
      startTex: current.colorAttachments[0],
      endTex: endTexture,
      uT: t,
    });
    model.draw({ framebuffer: next });

    // swap
    this.setState({ current: next, next: current });
  }

  renderLayers(): Layer[] {
    const { current } = this.state as { current: Framebuffer };
    if (!current) return [];
    return [
      new BitmapLayer({
        id: `${this.props.id}-bitmap`,
        bounds: [-180, -90, 180, 90],
        image: current.colorAttachments[0],
      }),
    ];
  }
}
