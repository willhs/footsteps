---
id: languages
type: reference
purpose: "The Glottolog language baseline (about 1500 CE) per 5° cell: sources, filters, record shape, the hover-card line, record size, and limits (research 0007, step 1)"
---

# Languages: a recorded baseline for about 1500 CE

[Research 0007](../research/0007-languages-over-time/research.md) found that a language per 5° cell can honestly be said from about 1500 CE, only
as a set with a basis, and not at all before 5 ka. This is **step 1** of its plan: the baseline. Steps 2 (a cited table of colonial
replacement, 1500-1900) and 3 (deep-time expansions, drawn hatched with a range) are not built. Seshat's `language_family` strings are not normalised yet either.

Code: `footstep-generator/anthropology/languages.py` (builds the block), `deploy/budgie/api/atlas.py` (`languages` field, `LANGUAGES_FROM`),
`footsteps-web/lib/languages.ts` + `hooks/useLanguages.ts` (the card line). Tests: `footstep-generator/tests/test_languages.py`,
`footsteps-web/lib/hoverCard.test.ts`. Browser check: `footsteps-web/scripts/verify-languages.mjs`.

```bash
poetry run python footstep-generator/anthropology/languages.py fetch   # 2 files (1.7 MB) -> data/raw/glottolog/5.4/, sha256-checked
poetry run python footstep-generator/anthropology/languages.py         # add `languages` to every cell of the committed atlas (~5 s)
```

`build.py` runs the same step after `deep.py`, so a full rebuild has it. `FOOTSTEPS_RAW=/some/dir` moves `data/raw` (a job workspace's `data/raw`
points into the primary checkout, which a job must not write to).

## Source (pinned)

[Glottolog 5.4](https://glottolog.org) custom downloads, Zenodo record 24104033 (2026-11-10), **CC BY 4.0**; attribution is in the atlas `sources` and the
API returns it. The atlas stays CC BY-NC-SA 4.0 (D-PLACE).

| File | sha256 |
|---|---|
| `glottolog_languoid.csv.zip` (578 KB) | `74a6874c4945ca5f9ac2157bcd97d1adf142290e30cd7b854d212648458d15ee` |
| `languages_and_dialects_geo.csv` (1.0 MB) | `02491971c59286e70304d2d7f71a5eccbdc78f06182ee634fdf2a02bb24d4e61` |

(Their md5 sums match Zenodo's listing.) The languoid file gives the tree and the point; the geo file gives each language's macroarea.

## What is kept

8,623 languages in 5.4, 8,081 with a point. After the filters **7,529** are used. Dropped:

- **Sign, pidgin, artificial, speech-register, unattested, bookkeeping and mixed-language** top-level groups (Glottolog's "families" for these are categories).
- **Creoles.** Glottolog has no creole flag: creoles sit inside their lexifier's family under nodes named "...Creole..." or "...pidgin...", so any language whose name or
  ancestor's name says so is dropped (54 beyond the Pidgin family).
- **Post-1500 transplants:** Indo-European languages outside Eurasia and Atlantic-Congo outside Africa (27: Afrikaans, Haitian, Papiamento, Pennsylvania German, Fiji Hindi,
  Lucumi ...), which would put Indo-European in Fiji. By macroarea, `TRANSPLANTS`.
- **Ancient and medieval written languages** (Latin, Hittite, Classical Chinese, Old English ...): 124 by exact name (`HISTORICAL`; a name that is not exactly one language in 5.4 fails the build).
  Languages that died between 1500 and 1900 (Old Prussian, Crimean Gothic, Classical Nahuatl) stay.

Kept as groups: an isolate is its own family; the 124 "Unclassifiable" languages show as one "Unclassified" group.

## The block

Per cell, one block (a baseline, not per era), `cells[key].languages` in the atlas:

```
{"n_languages", "n_families",
 "families": [{"glottocode", "name", "n"}, ... at most 8],        # languages whose point lies in the cell
 "nearest":  [{"glottocode", "name", "family", "km"}, ... 3]}     # nearest the cell centre, within 500 km
```

804 of 904 land cells have a block; a cell with no point inside but one within 500 km has `n_languages: 0` and only `nearest`; the rest say nothing.
`atlas.py` turns it into `fields.languages` = `{value: {tier: "attested", baseline_year: 1500, ...block}, source: "Glottolog 5.4", note}` for eras **1500-1900**;
earlier eras and the whole deep past have `value: null, source: "none"` (research tier "unknown"). The field is left out of the model gap-fill prompt and the day prompt
(`known_facts`), so those prompts and their caches are unchanged.

`GET /api/anthropology?...&fill=0` is new: it never calls the model for gap-fill (still merges a cached one). The hover card uses it, because it asks per 5° cell as the cursor moves and must not spend
the shared daily generation cap.

D-PLACE societies now carry their `glottocode` through `build.py` (607 of 607 in the atlas, all but a few non-null). Nothing reads it yet: it is the key for a later society-to-language link.

## In the hover card

Left column, after the way-of-life row, only when the slider year is 1500 or later (`LANGUAGES_FROM`; the row builder also refuses it earlier):

> Languages recorded here (about 1500 CE): Otomanguean 165, Uto-Aztecan 17, Mixe-Zoque 8 and 2 more families
> 194 languages · nearest: Diuxi-Tilantongo Mixtec (20 km), ... · documented points, not this year · colonial and later movement not applied · measured

The label says "about 1500 CE" at 1900 too: it is the same baseline, not a 1900 census. No family colours on the globe, nothing for 3000 BCE or earlier.
A cell with no point says "No language recorded in this cell (about 1500 CE)" and names the nearest.

## Record size

`deploy/budgie/api/anthropology.json.gz`: 641,973 -> 699,872 bytes (+57,899, +9.0%). The `languages` blocks are +53.7 KB, the society glottocodes +4.2 KB. Uncompressed JSON is 4.28 MB (a block is
377 bytes median, 813 max). The API loads the whole file into memory once.

## Limits (read before trusting a line)

- **A Glottolog point is where a language is documented** (mostly 19th-21st century), not where it was spoken in 1500. Replaced languages leave no point; the 1500-1900 era rows do not follow colonial replacement
  (Spanish over Nahuatl, English in Australia): that is step 2's hand-written table.
- The filters are not exhaustive: a few creoles and post-1500 varieties inside Eurasia and Africa remain (Sri Lanka Malay, say), and `HISTORICAL` is by name, so an ancient language under a modern-looking name stays.
- Counts are languages Glottolog lists, not speakers. A cell with 165 Otomanguean languages is a cell of dense documentation and linguistic diversity, not a census.
- Cells near a border can count a language whose point is just across it; `nearest` is within 500 km and may be in another cell.
- Before 1500: nothing, on purpose.

## Found while building it

- `build.py`'s Seshat filter used `anth.FIRST_YEAR` (now -100,000 BCE), so a full rebuild added Seshat snapshots for Kansai at 14,000-13,000 BCE that nothing reads. It now uses `anth.HYDE_FIRST`, and a full rebuild reproduces the committed atlas exactly apart from this job's additions.
- Port 4444 may be taken on this machine; `verify-languages.mjs` takes the base URL, so run the dev server on another port.
