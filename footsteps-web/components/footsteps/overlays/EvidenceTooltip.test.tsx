import { render, screen } from '@testing-library/react';
import EvidenceTooltip from './EvidenceTooltip';
import type { AadrDoc } from '@/lib/aadr';

const doc: AadrDoc = {
  meta: { dataset: 'AADR', caveat: '' },
  refs: ['Example et al., doi:10.1234/example'],
  samples: [
    {
      id: 'N1',
      la: 50,
      lo: 10,
      dp: 1,
      r: [43000, 41000],
      n: 'Cave',
      c: 'Germany',
      p: 0,
      h: 'neanderthal',
      t: 'c',
      rs: 'conflict',
    },
  ],
};
it('shows measured DNA evidence, place, dates, hominin, source and uncertainty', () => {
  render(
    <EvidenceTooltip
      hover={{
        kind: 'dna',
        mark: { lon: 10, lat: 50, alpha: 1, count: 1, site: 0 },
        x: 10,
        y: 10,
      }}
      doc={null}
      dnaDoc={doc}
    />,
  );
  expect(screen.getByText(/Measured evidence/)).toBeTruthy();
  expect(screen.getByText('Cave, Germany')).toBeTruthy();
  expect(screen.getByText(/41,050–39,050 BCE · Neanderthal/)).toBeTruthy();
  expect(
    screen.getByText(
      /Context date.*Rounded locality.*Conflicting source dates/,
    ),
  ).toBeTruthy();
  expect(screen.getByText(/Source: Example et al/)).toBeTruthy();
});
it('shows sample count for a bunch without attributing it to one person', () => {
  render(
    <EvidenceTooltip
      hover={{
        kind: 'dna',
        mark: { lon: 10, lat: 50, alpha: 1, count: 12, site: -1 },
        x: 10,
        y: 10,
      }}
      doc={null}
      dnaDoc={doc}
    />,
  );
  expect(screen.getByText(/12 ancient-DNA individuals here/)).toBeTruthy();
  expect(screen.queryByText(/Neanderthal/)).toBeNull();
});
