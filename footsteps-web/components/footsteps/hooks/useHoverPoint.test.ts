import { act, renderHook } from '@testing-library/react';
import useHoverPoint, { type Unproject } from './useHoverPoint';

const move = (over: Partial<{ pointerType: string; buttons: number; clientX: number; clientY: number }> = {}) =>
  ({
    pointerType: 'mouse',
    buttons: 0,
    clientX: 110,
    clientY: 60,
    currentTarget: { getBoundingClientRect: () => ({ left: 10, top: 20 }) },
    ...over,
  }) as never;

function setup({ fine = true, suspended = false } = {}) {
  window.matchMedia = jest.fn().mockReturnValue({ matches: fine }) as never;
  const unproject = jest.fn<ReturnType<Unproject>, Parameters<Unproject>>((x, y) => [x / 10, y / 10]);
  const unprojectRef = { current: unproject as Unproject | null };
  const hook = renderHook((props: { suspended: boolean }) => useHoverPoint({ enabled: true, unprojectRef, ...props }), {
    initialProps: { suspended },
  });
  return { ...hook, unproject };
}
const frame = () => act(() => jest.advanceTimersByTime(17));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('moves inside one frame cost one update, at the last position', () => {
  const { result, unproject } = setup();
  act(() => {
    result.current.bind.onPointerMove(move({ clientX: 50, clientY: 40 }));
    result.current.bind.onPointerMove(move({ clientX: 70, clientY: 50 }));
    result.current.bind.onPointerMove(move());
  });
  expect(result.current.point).toBeNull();
  frame();
  expect(unproject).toHaveBeenCalledTimes(1);
  expect(unproject).toHaveBeenCalledWith(100, 40); // client minus the container's origin
  expect(result.current.point).toEqual({ x: 110, y: 60, lon: 10, lat: 4 });
});

test('no card while a button is held, and pressing one closes it', () => {
  const { result } = setup();
  act(() => result.current.bind.onPointerMove(move()));
  frame();
  expect(result.current.point).not.toBeNull();
  act(() => result.current.bind.onPointerDown());
  expect(result.current.point).toBeNull();
  act(() => result.current.bind.onPointerMove(move({ buttons: 1 })));
  frame();
  expect(result.current.point).toBeNull();
});

test('touch and pen never open it, nor does a pointer that cannot hover', () => {
  const touch = setup();
  act(() => touch.result.current.bind.onPointerMove(move({ pointerType: 'touch' })));
  frame();
  expect(touch.result.current.point).toBeNull();
  const coarse = setup({ fine: false });
  act(() => coarse.result.current.bind.onPointerMove(move()));
  frame();
  expect(coarse.result.current.point).toBeNull();
  expect(coarse.unproject).not.toHaveBeenCalled();
});

test('leaving the map closes it', () => {
  const { result } = setup();
  act(() => result.current.bind.onPointerMove(move()));
  frame();
  act(() => result.current.bind.onPointerLeave());
  expect(result.current.point).toBeNull();
});

test('hidden while the view moves, and re-aimed when it settles', () => {
  const { result, rerender, unproject } = setup();
  act(() => result.current.bind.onPointerMove(move()));
  frame();
  rerender({ suspended: true });
  expect(result.current.point).toBeNull();
  unproject.mockReturnValue([99, 9]);
  rerender({ suspended: false });
  frame();
  expect(result.current.point).toMatchObject({ lon: 99, lat: 9 });
});

test('off the map (unproject gives nothing) there is no card', () => {
  const { result, unproject } = setup();
  unproject.mockReturnValue(null);
  act(() => result.current.bind.onPointerMove(move()));
  frame();
  expect(result.current.point).toBeNull();
});
