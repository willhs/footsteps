import {
  CompositeLayer,
  type Layer,
  type UpdateParameters,
} from '@deck.gl/core';
import { ScatterplotLayer } from '@deck.gl/layers';
import { gridChunks } from '../hooks/gridChunks';
import { UNIT_MIN_PX, type PointBuffers } from '../hooks/gridData';
import { isMorphPoints, type MorphPoints } from '../hooks/unitMorph';
import MorphScatterplotLayer from './MorphScatterplotLayer';

type GridBuffer = ReturnType<Layer['context']['device']['createBuffer']>;
type UploadedPoints = {
  length: number;
  attributes: {
    getPosition: { buffer: GridBuffer; size: 2; type: 'float32'; stride: 8 };
    getRadius: { buffer: GridBuffer; size: 1; type: 'float32' };
    getFillColor: { buffer: GridBuffer; size: 4; type: 'unorm8' };
    getTargetRadius?: { buffer: GridBuffer; size: 1; type: 'float32' };
    getTargetFillColor?: { buffer: GridBuffer; size: 4; type: 'unorm8' };
  };
};
type Props = {
  data: PointBuffers | MorphPoints;
  units: boolean;
  zoomBucket: number;
  onReady: () => void;
  morph: boolean;
  year: number;
  fromYear: number;
};
type Upload = { data: UploadedPoints; frame: number };

function destroy(data: UploadedPoints | null) {
  if (data)
    for (const attribute of Object.values(data.attributes))
      attribute?.buffer.destroy();
}

/** Upload bounded slices into three GPU buffers, then draw one layer per year.
 * The layer owns its buffers and cancels pending writes when superseded.
 */
export default class GridYearLayer extends CompositeLayer<Props> {
  static layerName = 'GridYearLayer';
  state!: { data: UploadedPoints | null; upload: Upload | null };

  initializeState() {
    this.setState({ data: null, upload: null });
  }

  updateState({ props, oldProps }: UpdateParameters<this>) {
    if (props.data === oldProps.data) return;
    if (this.state.upload) {
      cancelAnimationFrame(this.state.upload.frame);
      destroy(this.state.upload.data);
    }
    const { attributes } = props.data;
    const device = this.context.device;
    const data: UploadedPoints = {
      length: props.data.length,
      attributes: {
        getPosition: {
          buffer: device.createBuffer({
            // deck's fp64 position attribute needs explicit float32 stride
            // for an external buffer, plus its two-vertex safety margin.
            byteLength: attributes.getPosition.value.byteLength + 16,
          }),
          size: 2,
          type: 'float32',
          stride: 8,
        },
        getRadius: {
          buffer: device.createBuffer({
            byteLength: attributes.getRadius.value.byteLength,
          }),
          size: 1,
          type: 'float32',
        },
        getFillColor: {
          buffer: device.createBuffer({
            byteLength: attributes.getFillColor.value.byteLength,
          }),
          size: 4,
          type: 'unorm8',
        },
      },
    };
    const chunks = gridChunks(props.data);
    const source = props.data;
    if (isMorphPoints(source)) {
      data.attributes.getTargetRadius = {
        buffer: device.createBuffer({
          byteLength: source.attributes.getTargetRadius.value.byteLength,
        }),
        size: 1,
        type: 'float32',
      };
      data.attributes.getTargetFillColor = {
        buffer: device.createBuffer({
          byteLength: source.attributes.getTargetFillColor.value.byteLength,
        }),
        size: 4,
        type: 'unorm8',
      };
    }
    const upload: Upload = { data, frame: 0 };
    this.setState({ upload });
    let chunkIndex = 0;
    let pointOffset = 0;
    const write = () => {
      for (let count = 0; count < 4 && chunkIndex < chunks.length; count++) {
        const chunk = chunks[chunkIndex++];
        data.attributes.getPosition.buffer.write(
          chunk.attributes.getPosition.value,
          pointOffset * 8,
        );
        data.attributes.getRadius.buffer.write(
          chunk.attributes.getRadius.value,
          pointOffset * 4,
        );
        data.attributes.getFillColor.buffer.write(
          chunk.attributes.getFillColor.value,
          pointOffset * 4,
        );
        if (
          isMorphPoints(source) &&
          data.attributes.getTargetRadius &&
          data.attributes.getTargetFillColor
        ) {
          data.attributes.getTargetRadius.buffer.write(
            source.attributes.getTargetRadius.value.subarray(
              pointOffset,
              pointOffset + chunk.length,
            ),
            pointOffset * 4,
          );
          data.attributes.getTargetFillColor.buffer.write(
            source.attributes.getTargetFillColor.value.subarray(
              pointOffset * 4,
              (pointOffset + chunk.length) * 4,
            ),
            pointOffset * 4,
          );
        }
        pointOffset += chunk.length;
      }
      if (chunkIndex < chunks.length) {
        upload.frame = requestAnimationFrame(write);
      } else {
        // Layer objects are cloned as opacity changes; state belongs to the
        // current matched layer, not the instance that began this upload.
        const current = this.getCurrentLayer();
        if (current instanceof GridYearLayer) {
          destroy(current.state.data);
          current.setState({ data, upload: null });
          current.props.onReady();
        }
      }
    };
    upload.frame = requestAnimationFrame(write);
  }

  finalizeState() {
    if (this.state.upload) {
      cancelAnimationFrame(this.state.upload.frame);
      destroy(this.state.upload.data);
    }
    destroy(this.state.data);
  }

  renderLayers() {
    if (!this.state.data) return [];
    const LayerClass = this.props.morph
      ? MorphScatterplotLayer
      : ScatterplotLayer;
    return [
      new LayerClass({
        ...this.getSubLayerProps({ id: 'points' }),
        data: this.state.data,
        radiusUnits: 'meters',
        radiusMinPixels: this.props.units
          ? UNIT_MIN_PX[this.props.zoomBucket]
          : 0.5,
        stroked: false,
        pickable: false,
        parameters: this.props.units
          ? {
              depthTest: false,
              blend: true,
              blendColorSrcFactor: 'src-alpha',
              blendColorDstFactor: 'one',
              blendAlphaSrcFactor: 'one',
              blendAlphaDstFactor: 'one',
            }
          : { depthTest: false },
      }),
    ];
  }
}
