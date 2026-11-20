import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SettlementNote } from './SettlementNote';

beforeEach(() => localStorage.clear());

test('starts as one line, expands on click, closes again', () => {
  render(<SettlementNote season="off" />);
  expect(screen.queryByTestId('settlement-note')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('settlement-note-toggle'));
  expect(screen.getByTestId('settlement-note')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('settlement-note-close'));
  expect(screen.queryByTestId('settlement-note')).not.toBeInTheDocument();
});

test('a pinned note is remembered and starts open', () => {
  const first = render(<SettlementNote season="off" />);
  fireEvent.click(screen.getByTestId('settlement-note-toggle'));
  fireEvent.click(screen.getByTestId('settlement-note-pin'));
  first.unmount();
  render(<SettlementNote season="off" />);
  expect(screen.getByTestId('settlement-note')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('settlement-note-close'));
  expect(localStorage.getItem('footsteps.settlementNote.pinned')).toBe('0');
});
