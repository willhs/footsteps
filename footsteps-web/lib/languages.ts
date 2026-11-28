// The hover card's language line: Glottolog's languages for a 5° cell, a baseline for about 1500 CE
// (docs/ops/languages.md, research 0007 step 1). Pure: the hook fetches the block, this words it.

/** First year the atlas says anything about languages (`LANGUAGES_FROM` in atlas.py). Before it: nothing, never a guess. */
export const LANGUAGES_FROM = 1500;

/** `fields.languages.value` of GET /api/anthropology, for eras from LANGUAGES_FROM. */
export type LanguageBlock = {
  tier: 'attested';
  baseline_year: number;
  n_languages: number;
  n_families: number;
  /** Families of the languages whose point lies in the cell, most languages first (at most 8). */
  families: { glottocode: string; name: string; n: number }[];
  /** The few languages nearest the cell centre within 500 km. */
  nearest: { glottocode: string; name: string; family: string; km: number }[];
};

const FAMILIES_SHOWN = 2;

/** The words for one block. No family colours and no era-specific claim: the line says "about 1500 CE" whatever year is asked. */
export function languageLine(b: LanguageBlock): { text: string; detail: string } {
  // One short line (Will, 2026-11-28): the families only; the counts and nearest names are in the data, not the card.
  const detail = `recorded about ${b.baseline_year}`;
  if (b.n_languages === 0) return { text: 'No language recorded here', detail };
  const shown = b.families.slice(0, FAMILIES_SHOWN).map((f) => f.name).join(', ');
  const more = b.n_families - Math.min(FAMILIES_SHOWN, b.families.length);
  return { text: `Languages: ${shown}${more > 0 ? ` and ${more} more` : ''}`, detail };
}
