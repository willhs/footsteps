import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import useSliderMarks from './useSliderMarks';
import { yearToSlider } from '@/lib/useYear';

function TestComponent({ value }: { value: number }) {
  const marks = useSliderMarks(value);
  return <div data-testid="marks">{JSON.stringify(marks)}</div>;
}

function getMarksForWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  const sliderVal = yearToSlider(0);
  const { getByTestId } = render(<TestComponent value={sliderVal} />);
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
  const marks = JSON.parse(getByTestId('marks').textContent as string);
  cleanup();
  return marks as Record<string, { label: string }>;
}

describe('useSliderMarks', () => {
  const widths = [320, 768, 1024];
  widths.forEach((width) => {
    test(`ensures minimum spacing at width ${width}px`, () => {
      const marks = getMarksForWidth(width);
      const positions = Object.keys(marks)
        .map(Number)
        .sort((a, b) => a - b);
      const currentPos = yearToSlider(0);
      const filtered = positions.filter((p) => Math.abs(p - currentPos) > 0.01);
      const threshold = (70 / width) * 100;
      for (let i = 1; i < filtered.length; i++) {
        expect(filtered[i] - filtered[i - 1]).toBeGreaterThanOrEqual(threshold);
      }
    });
  });

  test('renders more marks on wide viewports', () => {
    const small = getMarksForWidth(320);
    const large = getMarksForWidth(1280);
    expect(Object.keys(large).length).toBeGreaterThan(
      Object.keys(small).length,
    );
  });
});
