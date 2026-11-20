import { MATERIALS, NO_SOCIETY, SHAPE_NAME, describeShelter, type DwellingTable } from '@/lib/dwellings';
import type { ShelterHover } from '../layers/Close3DLayer';
import { UnitKind } from '../layers/units';

/** A hovered dwelling, in the left column: what it is (type modelled from an analog or a dig) and what is imagined (its place). */
export default function ShelterTooltip({ hover, table }: { hover: ShelterHover | null; table: DwellingTable | null }) {
  if (!hover) return null;
  const { shelter } = hover;
  const society = shelter.society === NO_SOCIETY ? null : (table?.societies[shelter.society] ?? null);
  const words = describeShelter(shelter.spec, society, table, shelter.homes);
  const who = shelter.group.kind === UnitKind.Glow ? `a town of about ${Math.round(shelter.group.people).toLocaleString()} people` : `a group of about ${Math.round(shelter.group.people)} people`;
  return (
    <div className="ov-panel pointer-events-none shrink-0 px-3.5 py-3" data-testid="shelter-info">
      <p className="ov-eyebrow">Dwelling · {SHAPE_NAME[shelter.shape]}, {MATERIALS[shelter.spec.material].name}</p>
      <p className="ov-body text-[var(--ov-text)]">{words.title}</p>
      <p className="ov-note">{words.evidence}</p>
      <p className="ov-note">{words.placement} Part of {who}.</p>
      <p className="ov-note">{words.caveat}</p>
    </div>
  );
}
