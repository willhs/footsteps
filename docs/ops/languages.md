---
id: languages
type: reference
purpose: "The Glottolog language baseline (about 1500 CE) per 5° cell, and the cited expansions table behind ?langs=deep: sources, filters, shapes, the hover-card lines, sizes, and limits (research 0007, steps 1-3)"
---

# Languages: a recorded baseline for about 1500 CE, and cited expansions

[Research 0007](../research/0007-languages-over-time/research.md) found that a language per 5° cell can honestly be said from about 1500 CE, only
as a set with a basis, and not at all before 5 ka. **Step 1** of its plan is the baseline (most of this page). **Steps 2** (historical and colonial
movements) **and 3** (deep-time expansions) are a hand-written cited table shown as one more hover line, only with `?langs=deep`
(see [Cited expansions](#cited-expansions-langsdeep-steps-2-3)). Nothing is drawn on the globe yet, and Seshat's `language_family` strings are not normalised.

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
  (Spanish over Nahuatl, English in Australia): step 2's hand-written table says where that was under way, behind `?langs=deep` (below).
- The filters are not exhaustive: a few creoles and post-1500 varieties inside Eurasia and Africa remain (Sri Lanka Malay, say), and `HISTORICAL` is by name, so an ancient language under a modern-looking name stays.
- Counts are languages Glottolog lists, not speakers. A cell with 165 Otomanguean languages is a cell of dense documentation and linguistic diversity, not a census.
- Cells near a border can count a language whose point is just across it; `nearest` is within 500 km and may be in another cell.
- Before 1500: nothing, on purpose.

## Cited expansions (`?langs=deep`, steps 2-3)

Which families were *spreading* in a cell by a year, from cited studies and records. Off by default: without `?langs=deep` the card is unchanged
and the table is never fetched.

Code: `footstep-generator/anthropology/languages_expansions.yaml` (the table, rules in its header) → `languages_expansions.py` (validates, writes
`footsteps-web/public/languages/expansions.json`) → `footsteps-web/lib/languageExpansions.ts` (lookup and words) + `hooks/useLanguageExpansions.ts`.
Tests: `footstep-generator/tests/test_languages_expansions.py`, `footsteps-web/lib/languageExpansions.test.ts`. Browser check:
`footsteps-web/scripts/verify-language-expansions.mjs <app-url> <out-dir> [data-url]` (a dev server's missing data is forwarded to production).

```bash
poetry run python footstep-generator/anthropology/languages_expansions.py   # 30 rows -> public/languages/expansions.json (6,579 bytes)
```

**The table** (33 rows, 30 with an area). A row is a family, a Glottolog id, a start (`start_year` CE for historical rows, `start_bp: [lo, hi]` years
before 1950 for deep ones), `boxes` (5° boxes `[south, west, north, east]` on the atlas grid), `disputed`, a short `cite`, the full `source`, `checked`
and `unverified`.

| Step | Rows |
|---|---|
| 2: historical and colonial | Spanish: Caribbean 1493, Mexico 1519, Central America 1524, Andes 1532, Río de la Plata 1536, Chile 1541. Portuguese: Brazil 1532. English: eastern North America 1607, the interior 1803, Australia 1788, New Zealand 1840. Arabic: Egypt 639, the Maghreb 670. Turkic: Central Asia 552, Anatolia 1071 |
| 3: deep time | Bantu (Narrow Bantu `narr1281`): west-central forest 4,040-5,000 BP, east 2,500-3,000, south 1,500-3,000. Austronesian: Taiwan ~5,230, island SE Asia 3,500-4,000, West Polynesia 2,900-3,200, Madagascar ~1,300, Society Islands CE ~1025-1120, the rest of East Polynesia incl. New Zealand CE ~1190-1290. Pama-Nyungan 4,455-6,966. Sino-Tibetan 4,200-7,800. Uralic ~5,300. Quechua: Wari CE 600-1000, Inca 1400-1532. Aymara: Early Horizon (disputed) |
| 3: disputed, no area | Indo-European, Afro-Asiatic (only Semitic dated), Uto-Aztecan. Never shown, left out of the asset |

**Source check (2026-11-21).** Every source was fetched, not cited from memory: DOIs through Crossref and Europe PMC (abstracts), one open full text
(Russell, Silva & Steele 2014 for the eastern and southern Bantu dates), and publisher pages for historical dates. **12 rows checked** (9 with an area), 21 `unverified`,
each with its reason. Read in the source: Koile 2022, Grollemund 2015, Russell 2014, Gray 2009 (Taiwan only), Wilmshurst 2011, Zhang 2019, Sagart 2019,
Heggarty 2023, Kitchen 2009, Merrill 2009, the National Park Service (Jamestown 1607) and the US Office of the Historian (Louisiana 1803). Not:

- Pama-Nyungan and Uralic figures: the abstracts give no number and the papers are paywalled.
- Gray 2009's regional Austronesian dates (only the Taiwan origin is in the abstract); Madagascar is the research's background knowledge.
- The Andes rows: Beresford-Jones & Heggarty 2012 tie Quechua to the Wari Middle Horizon and Aymara (tentatively) to the Early Horizon, but give no years.
- Most historical dates: Britannica, Te Ara, NZHistory and the National Museum of Australia refuse automated fetches (403), so the dates were read on
  Wikipedia only. Wikipedia counts as secondary here. The years are not in doubt; the row says "not verified" because the rule is about where they were read.

**When a row shows.** For a point inside one of its boxes (south ≤ lat < north, west ≤ lon < east), from `from_year`: the start year, or the older end of
the range, **never before 3050 BCE** (5,000 BP). The floor is applied when the asset is built and again in the browser lookup, so a wrong row cannot break it.
Rows whose range is older than 5 ka (Austronesian Taiwan, Pama-Nyungan, Sino-Tibetan, Uralic) show from the floor. Only on land. Overlapping rows are all listed, oldest first.

**In the hover card**, after the baseline line:

> Languages spreading here: Bantu (from about 4,000-5,000 years ago; Koile et al. 2022)
> cited studies and records · hand-drawn 5° areas, not boundaries · nothing before 5,000 years ago · *modelled*

Ranges older than 1 CE are in years ago, rounded to 100; later ones in calendar years ("from about 1190-1290 CE"); historical rows say "from 1519 CE".
"disputed" and "not verified" are added where they apply. Always *modelled*: even a dated conquest becomes an area only through a hand-drawn box.

**Asset size:** 6,579 bytes (1,698 gzipped), fetched once per page after the first hover, only with the flag. The atlas record is unchanged: deep rows
answer for years before 1500, where the card asks the atlas nothing, and a static file needs no API change or data deploy.

**Limits.** A box is about 550 km a side and drawn by hand: Spanish "spreading" across all of Mexico from 1519 means the language arrived then, not that
people spoke it (Nahuatl and Otomanguean languages stayed the majority for centuries). The Turkic Anatolia boxes take in Bulgaria's coast and the Black Sea
shore; the English eastern box takes in Spanish Florida. A row has no end year. Families with no row (Dravidian, Austroasiatic, Tai-Kadai, Nilo-Saharan,
Athabaskan, Trans-New Guinea) say nothing, which is not the same as nothing happening.

## Found while building it

- `build.py`'s Seshat filter used `anth.FIRST_YEAR` (now -100,000 BCE), so a full rebuild added Seshat snapshots for Kansai at 14,000-13,000 BCE that nothing reads. It now uses `anth.HYDE_FIRST`, and a full rebuild reproduces the committed atlas exactly apart from this job's additions.
- Port 4444 may be taken on this machine; `verify-languages.mjs` takes the base URL, so run the dev server on another port.

## Production confirmation (2026-11-21)

Commit `9331154b25d3ff069ee7b036a79a0d73e226dafd` is deployed: `/version.txt` matches it.
[CI](https://github.com/willhs/footsteps/actions/runs/44775815789) and
[image deployment, quick smoke and full smoke](https://github.com/willhs/footsteps/actions/runs/44776848780) passed.
Direct production requests to `/api/anthropology?lat=17.5&lon=-97.5&year=1500&fill=0` and the same cell at 1900
return `fields.languages` sourced to Glottolog 5.4, with `baseline_year: 1500`, 194 languages, family counts and nearest languages.
At `year=-3000`, the language value is unknown.

The real-data browser harness also passed against production (both base and API URLs set to `https://footsteps.willhs.me`):
Oaxaca 1500 and 1900 show the baseline and its caveats; Oaxaca 1400 and 3000 BCE show no language line and make no atlas request;
Lagos 1500 shows Atlantic-Congo. Screenshots and JSON responses are retained in the follow-up job's workspace evidence directory.
