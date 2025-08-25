import { CompositeLayer, Layer, LayerContext } from '@deck.gl/core';
import { BitmapLayer } from '@deck.gl/layers';
import { GPUDensityInterpolant } from '@/lib/gpuInterpolation';

interface GPUInterpolationLayerProps {
  id: string;
  fromImage: HTMLImageElement | HTMLCanvasElement;
  toImage: HTMLImageElement | HTMLCanvasElement;
  progress: number;
  bounds: [number, number, number, number];
}

export class GPUInterpolationLayer extends CompositeLayer<GPUInterpolationLayerProps> {
  private interpolant?: GPUDensityInterpolant;

  initializeState(context: LayerContext): void {
    const gl = context.gl as WebGL2RenderingContext;
    const { fromImage, toImage, progress } = this.props;
    this.interpolant = new GPUDensityInterpolant(gl, fromImage, toImage);
    this.interpolant.step(progress);
  }

  updateState({
    props,
    oldProps,
    context,
  }: {
    props: GPUInterpolationLayerProps;
    oldProps: GPUInterpolationLayerProps;
    context: LayerContext;
  }): void {
    const gl = context.gl as WebGL2RenderingContext;
    if (
      !this.interpolant ||
      props.fromImage !== oldProps.fromImage ||
      props.toImage !== oldProps.toImage
    ) {
      this.interpolant?.delete();
      this.interpolant = new GPUDensityInterpolant(
        gl,
        props.fromImage,
        props.toImage,
      );
    }
    this.interpolant.step(props.progress);
  }

  finalizeState(): void {
    this.interpolant?.delete();
    this.interpolant = undefined;
  }

  renderLayers(): Layer[] {
    if (!this.interpolant) return [];
    return [
      new BitmapLayer({
        id: `${this.props.id}-bitmap`,
        image: this.interpolant.getTexture(),
        bounds: this.props.bounds,
        opacity: 0.8,
      }),
    ];
  }
}
