import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Portrait from './Portrait';
import type { Person } from '../layers/people';

const person: Person = {
  id: 1,
  position: [12, 34],
  age: 30,
  female: true,
  role: 'forager',
  groupKind: 0,
  groupPeople: 30,
  color: [0, 0, 0, 255],
  radius: 6,
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('shows no person before atlas resolves and never redraws after timeout', async () => {
  let resolve!: (value: unknown) => void;
  global.fetch = jest.fn(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  ) as jest.Mock;
  render(<Portrait person={person} lat={34} year={-5000} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Preparing illustration',
  );
  act(() => jest.advanceTimersByTime(2500));
  const image = screen.getByRole('img').outerHTML;
  await act(async () =>
    resolve({
      ok: true,
      json: async () => ({
        fields: { clothing: { value: { palette: ['#ff0000'] } } },
      }),
    }),
  );
  expect(screen.getByRole('img').outerHTML).toBe(image);
});

test('uses atlas before first illustration and clears the image for a different place', async () => {
  let resolve!: (value: unknown) => void;
  global.fetch = jest.fn(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  ) as jest.Mock;
  const view = render(
    <Portrait
      person={{ ...person, position: [50, 10] }}
      lat={10}
      year={1500}
    />,
  );
  expect(screen.getByRole('status')).toBeInTheDocument();
  await act(async () =>
    resolve({
      ok: true,
      json: async () => ({
        fields: { clothing: { value: { palette: ['#ff0000'] } } },
        era: { label: '1500' },
      }),
    }),
  );
  expect(screen.getByRole('img').outerHTML).toContain('#ff0000');
  view.rerender(
    <Portrait
      person={{ ...person, position: [80, 10] }}
      lat={10}
      year={1500}
    />,
  );
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toBeInTheDocument();
});
