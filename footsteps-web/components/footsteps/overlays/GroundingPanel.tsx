import type { GroundingFacts } from '../layers/grounding';

export default function GroundingPanel({
  facts,
  group,
  onClose,
}: {
  facts: GroundingFacts | null;
  /** The clicked mark, at close zoom: what it stands for, not where it really was. */
  group?: { label: string; people: number; placed: boolean } | null;
  onClose: () => void;
}) {
  const count = (n: number) => Math.round(n).toLocaleString();
  return (
    <section aria-label="What we know here" className="absolute bottom-44 left-4 z-20 max-w-xs rounded bg-black/85 p-4 text-xs leading-relaxed text-white/85">
      <button type="button" aria-label="Close grounding facts" onClick={onClose} className="float-right ml-4 px-1">×</button>
      <h2 className="mb-2 text-sm font-semibold text-white">What we know here</h2>
      {group && (
        <p className="mb-2 text-white">
          {group.placed
            ? `${group.label} of about ${count(group.people)} people. Where it sits inside its cell is illustrative.`
            : `${group.label}: about ${count(group.people)} people in one ~10 km cell.`}
        </p>
      )}
      {facts ? <>
        <p>{facts.year < 1 ? `${Math.abs(facts.year)} BCE` : `${facts.year} CE`} · cell centre {facts.latitude.toFixed(3)}°, {facts.longitude.toFixed(3)}°</p>
        <dl className="my-2 grid grid-cols-2 gap-x-3">
          <dt>People in cell</dt><dd>≈ {count(facts.people)}</dd>
          <dt>3×3 neighbourhood</dt><dd>≈ {count(facts.neighbourhoodPeople)}</dd>
          <dt>Density class</dt><dd>{facts.densityClass}</dd>
        </dl>
        <p>{facts.confidence}</p>
        <p className="mt-2 text-white/60">Counts are decoded HYDE estimates. Zero means no population recorded in this image, not confirmed absence. Band/village placements are illustrative.</p>
      </> : <p>Population image for this year is not loaded yet.</p>}
    </section>
  );
}
