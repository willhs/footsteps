import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PersonDay, { type DayRequest } from './PersonDay';

test('an old day response cannot replace a newly selected person', async () => {
  const request: DayRequest = {
    year: 1500,
    lat: 10,
    lon: 20,
    cellPeople: 30,
    neighbourhoodPeople: 100,
    densityClass: 'band',
    confidence: 'modelled',
    person: {
      age: 30,
      female: true,
      role: 'forager',
      groupKind: 0,
      groupPeople: 30,
    },
  };
  const pending: ((value: unknown) => void)[] = [];
  global.fetch = jest.fn(
    () => new Promise((resolve) => pending.push(resolve)),
  ) as jest.Mock;
  const view = render(<PersonDay request={request} />);
  fireEvent.click(screen.getByRole('button'));
  view.rerender(
    <PersonDay
      request={{ ...request, person: { ...request.person, age: 40 } }}
    />,
  );
  fireEvent.click(screen.getByRole('button'));
  const response = (summary: string) => ({
    ok: true,
    json: async () => ({
      summary,
      schedule: [],
      grounded_in: [],
      uncertainty: 'Speculative',
      model: 'demo',
    }),
  });
  await act(async () => pending[1](response('The current person’s day')));
  expect(screen.getByText('The current person’s day')).toBeInTheDocument();
  await act(async () => pending[0](response('The previous person’s day')));
  expect(screen.getByText('The current person’s day')).toBeInTheDocument();
  expect(
    screen.queryByText('The previous person’s day'),
  ).not.toBeInTheDocument();
});
