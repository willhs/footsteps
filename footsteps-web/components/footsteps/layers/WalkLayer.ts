// TripsLayer whose clock runs on the GPU side: the current time is read in draw,
// so trails animate without React re-rendering every frame.
import { TripsLayer } from '@deck.gl/geo-layers';
import { PathLayer } from '@deck.gl/layers';
import { WALK_PERIOD, WALK_TRAIL, type Walk } from './footsteps';

export default class WalkLayer extends TripsLayer<Walk> {
  static layerName = 'WalkLayer';

  draw(params: Parameters<PathLayer['draw']>[0]) {
    const { fadeTrail, trailLength } = this.props;
    const currentTime = WALK_TRAIL + ((performance.now() / 1000) % WALK_PERIOD);
    this.state.model?.shaderInputs.setProps({ trips: { fadeTrail, trailLength, currentTime } });
    PathLayer.prototype.draw.call(this, params);
  }
}
