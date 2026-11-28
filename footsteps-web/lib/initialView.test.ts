import parseInitialViewState from './parseInitialViewState';
import { resetFlags } from './flags';

afterEach(() => {
  resetFlags();
  window.history.replaceState(null, '', '/');
});

it('preserves missing, empty, invalid and repeated camera values', () => {
  expect(parseInitialViewState('')).toEqual({ longitude: 0, latitude: 20, zoom: 1.5, pitch: 0, bearing: 0 });
  expect(parseInitialViewState('?lat=&lon=bad&zoom=Infinity')).toMatchObject({ latitude: 0, longitude: 0, zoom: 1.5 });
  expect(parseInitialViewState('?lat=12&lat=40&lon=-30&zoom=7')).toMatchObject({ latitude: 12, longitude: -30, zoom: 7 });
});

it('retains truthy canonical-value precedence over camera aliases', () => {
  expect(parseInitialViewState('?lng=7&z=8')).toMatchObject({ longitude: 7, zoom: 8 });
  expect(parseInitialViewState('?lon=&lng=7&zoom=&z=8')).toMatchObject({ longitude: 7, zoom: 8 });
  expect(parseInitialViewState('?lon=0&lng=7&zoom=0&z=8')).toMatchObject({ longitude: 0, zoom: 0 });
  expect(parseInitialViewState('?lon=bad&lng=7&zoom=bad&z=8')).toMatchObject({ longitude: 0, zoom: 1.5 });
});

it('uses the shared page snapshot when no explicit search is supplied', () => {
  window.history.replaceState(null, '', '/?lat=12&lng=7&z=8');
  expect(parseInitialViewState()).toMatchObject({ latitude: 12, longitude: 7, zoom: 8 });
  window.history.replaceState(null, '', '/?lat=40');
  expect(parseInitialViewState()).toMatchObject({ latitude: 12, longitude: 7, zoom: 8 });
});
