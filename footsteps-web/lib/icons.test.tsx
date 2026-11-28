import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import { Icon } from '@/components/ui/Icon';
import { ICON_GLYPHS, iconGlyph } from './icons';

const WEB_ROOT = path.join(__dirname, '..');
const SOURCE_DIRS = ['app', 'components', 'lib'];
const SOURCE_FILE = /\.(ts|tsx)$/;
const TEST_FILE = /\.test\.(ts|tsx)$/;
const ICON_MAP_FILE = path.join(WEB_ROOT, 'lib', 'icons.ts');

/** Emoji and pictographic symbols (not arrows or maths signs, which code comments use freely). */
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)
      ? [full]
      : [];
  });
}

test('every icon name has a glyph', () => {
  for (const [name, glyph] of Object.entries(ICON_GLYPHS)) {
    expect(glyph.length).toBeGreaterThan(0);
    expect(iconGlyph(name as keyof typeof ICON_GLYPHS)).toBe(glyph);
  }
});

test('no emoji is written outside the icon map, so the set can be redrawn in one place', () => {
  const offenders = SOURCE_DIRS.flatMap((dir) =>
    sourceFiles(path.join(WEB_ROOT, dir)),
  )
    .filter((file) => file !== ICON_MAP_FILE)
    .flatMap((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({
          line,
          where: `${path.relative(WEB_ROOT, file)}:${i + 1}`,
        }))
        .filter(({ line }) => EMOJI.test(line))
        .map(({ where, line }) => `${where}  ${line.trim()}`),
    );

  expect(offenders).toEqual([]);
});

test('Icon shows the emoji, hidden from screen readers unless labelled', () => {
  const { container, rerender } = render(<Icon name="night" />);
  const span = container.querySelector('[data-icon="night"]');
  expect(span).toHaveTextContent(ICON_GLYPHS.night);
  expect(span).toHaveAttribute('aria-hidden', 'true');

  rerender(<Icon name="night" label="Night" />);
  const labelled = container.querySelector('[data-icon="night"]');
  expect(labelled).toHaveAttribute('role', 'img');
  expect(labelled).toHaveAttribute('aria-label', 'Night');
});
