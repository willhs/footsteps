---
id: research-0007-languages-over-time
type: research
purpose: "What language family can Footsteps honestly show per 5° cell × era, from when, using Glottolog and published family-expansion studies; how it extends the Seshat language-family field"
date: 2026-11-14
---

# Languages over time: Glottolog and known expansions

## Question

Can the hover card and details panel say "people here spoke a language of the X family" for a 5° cell × era? From when can it be said honestly, with what data, and how does it extend what Seshat already gives for 35 sites?

## Verdict

**Partly yes, and the honest answer is mostly "unknown".**

| Period | What we can say | How |
|---|---|---|
| About 1500 CE and later | The family (and often the language) for most land, with colonial replacement handled as a short table | Glottolog points, filtered; D-PLACE ethnographic societies |
| About 3000 BCE – 1500 CE | Family only where a text, inscription or a dated expansion study covers the place: a few dozen regions, not a grid | Hand-curated expansion table, each row cited, drawn as a range |
| Before about 3000 BCE (5 ka) | **Unknown.** Show it as unknown, not as a guess | Nothing defensible |

The task's guess ("family from about 5–3 ka at best, unknown before") holds, with one correction: 5–3 ka is the *best case, for a handful of families* (Bantu, Austronesian, Pama-Nyungan, Sino-Tibetan, Indo-European), not a world grid. Wide coverage by 5° cell starts around 1500 CE, and from about 1000 BCE only where writing exists.

Recommendation: build it in three small steps (below), starting with the 1500+ baseline, which is cheap and mostly solved by data we already ship.

## Premise check

| Task note | Found |
|---|---|
| Glottolog is CC BY 4.0 and gives language and family coordinates | **True.** CC BY 4.0 on Glottolog 5.4 and the 5.3 CLDF record. 245 families, 183 isolates, 8,243 languoids on the About page (snapshot 2026-11-10). Coordinates for 8,081 of 8,243 languages (98.0%) in `glottolog_languoid.csv` `[Direct: measured, evidence/glottolog_stats.txt]`. One point per language, no polygons `[Direct]`. |
| Seshat gives a language family for 35 sites | **True but weaker than it sounds.** `anthropology.json.gz` carries `language_family` in 33 cells (35 sites) for 552 cell-eras, −10000 to 1900 `[Direct: evidence/seshat.py]`. See "How this extends Seshat": it is the *polity's* family, and about a quarter of the values are not language families. |
| README says Seshat is CC BY-NC-SA 4.0 | **Unclear.** The Zenodo record for the Equinox data lists *AGPL-3.0 only* `[Direct: zenodo.org/records/6629022]`. The Seshat database itself is usually CC BY-NC-SA. Check before adding more Seshat-derived fields. |
| No language data exists in the repo | **True** apart from the Seshat field. No Glottolog references anywhere (grep of the repo). |
| D-PLACE societies could help | **Found, not in the task notes.** D-PLACE EA `societies.csv` has a Glottocode for all 1,291 societies, and all resolve in Glottolog 5.4 (141 families, 431 5° cells) `[Direct: evidence/dplace_ea_glottocodes.txt]`. The atlas already ships 607 of them (`societies` in `anthropology.json.gz`) but drops the Glottocode. |

## Findings

Confidence tags: `[Direct]` measured or read this session; `[Supported]` from a study found in search, abstract level only; `[Background]` from my knowledge, not checked this session (verify before use).

### 1. What Glottolog gives

- 8,243 languages in the languoid file; 8,081 with coordinates `[Direct]`. 652 5° cells hold at least one; 322 of those hold a single family, the rest hold several `[Direct]`. The busiest cells (New Guinea and Wallacea, 5° S 140° E) hold 12–28 families `[Direct]`.
- Coordinates are present-day (documentation-era) points. A family's bounding box shows the problem `[Direct: evidence/stats.py]`:
  - Indo-European spans lon −155 to 178 (colonial and pidgin languages).
  - Atlantic-Congo reaches lon −82 (Caribbean and Atlantic creoles).
  - Austronesian spans −179 to 179 (Polynesia and Madagascar, which are real, but also later movement).
  - "Sign Language" is counted as a family (225 entries). Pidgins, creoles, sign languages and artificial languages must be filtered by languoid category before any map is made.
- No dates, no polygons, no migration history in the files read `[Direct]`. "Historical location" is only a note on some coordinates.
- Files: `glottolog_languoid.csv.zip` (578 KB) and `languages_and_dialects_geo.csv` (1.0 MB) are enough; no need for the 50 MB CLDF `[Direct]`. Both are on Zenodo (5.4 record 24104033). The older `glottolog.org/static/download/<ver>/` URL returns 404.
- Glottolog 5 has no single node called "Bantu" under that exact name in the languoid file (exact-name search found none) `[Direct]`; Bantu sits inside Atlantic-Congo. Use Atlantic-Congo ids plus a list of Bantu glottocodes if Bantu needs its own row.
- IDs for the target families `[Direct]`: Indo-European `indo1319`, Austronesian `aust1307`, Atlantic-Congo `atla1278`, Afro-Asiatic `afro1255`, Uralic `ural1272`, Sino-Tibetan `sino1245`, Pama-Nyungan `pama1250`, Uto-Aztecan `utoa1244`, Quechuan `quec1387`, Aymaran `ayma1253`, Turkic `turk1311`, Dravidian `drav1251`, Mongolic-Khitan `mong1349`, Otomanguean `otom1299`.

### 2. Family expansions with dates and areas

Dates are 95% intervals or ranges where the study gave them. "Method" matters: **none of these dates is a measurement**. They are model outputs, calibrated against archaeology, and the calibration is often the weak part.

| Family | Date (BP unless noted) | Area | Source | Status |
|---|---|---|---|---|
| Bantu (inside Atlantic-Congo) | Root 4,850 ± 140 (Grollemund 2015); expansion through forest 4,420 (4,040–5,000) (Koile 2022); 5,600 from genetics (Li 2014) | Grassfields, Cameroon, then west or east routes; savanna corridor vs rainforest route disputed | Grollemund et al. 2015 *PNAS*; Koile et al. 2022 *PNAS* `[Supported]` | Two good studies disagree on route, agree on ~5 ka start. Arrival in southern Africa about 2 ka `[Background]` |
| Austronesian | Origin Taiwan 5,230 (Gray 2009); Western Polynesia 2,900–3,200; "pulse" ~1,500 to Eastern Polynesia and Easter Island | Taiwan → Philippines → Island SE Asia → Pacific; Madagascar by ~1.3 ka `[Background]` | Gray, Drummond & Greenhill 2009 *Science* `[Supported]` | Strongest-supported expansion. Rival "much older" 13–17 ka origin exists but is a minority view `[Supported]` |
| Indo-European | Steppe: ~3500 BCE (5.5 ka), Yamnaya; Anatolian: farmers 7500–6000 BCE (Bouckaert 2012); hybrid root ~8,100 (6,740–9,610), south of the Caucasus (Heggarty 2023); Indo-Anatolian 4400–4000 BCE, Caucasus–lower Volga (Lazaridis & Anthony 2025) | Pontic-Caspian steppe, Anatolia, Caucasus. Hittite names in Kültepe tablets ~2000 BCE; Indo-Iranian attested ~1400 BCE; Tocharian CE 500–800 | Wikipedia summaries of Haak 2015, Bouckaert 2012, Heggarty 2023, Anthony; not primary `[Supported, secondary]` | **Genuinely disputed**; do not draw a single origin. Show "Indo-European, arrival disputed" |
| Afro-Asiatic | Semitic split in Levant ~5,750 (Kitchen 2009); Afro-Asiatic root not verified here | Proposed homelands: Red Sea African coast (Ehret), Levant farmers, SW Ethiopia | Kitchen et al. 2009 *Proc R Soc B* `[Supported]` | Root unresolved; only Semitic is dated. Egyptian written by ~3000 BCE `[Background]` |
| Uralic | Proto-Uralic ~5,300 (Honkola 2013); recalibrated by Maurits 2020 | Urals to Fennoscandia `[Supported]`; homeland argued between the Urals and further east `[Background]` | Honkola et al. 2013 *J Evol Biol* `[Supported: abstract via blog]` | Error bars large; later recalibration may shift it |
| Sino-Tibetan | 5,900 (4,200–7,800) (Zhang 2019, *Nature*); 7,200 (Sagart 2019, *PNAS*) | North China, Yangshao, then Majiayao | Zhang et al. 2019; Sagart et al. 2019 `[Supported]` | Both studies say northern China; a 2020 study gave 7,983 (4,778–11,285), showing how wide the uncertainty is `[Supported]`. Chinese written by ~1250 BCE `[Background]` |
| Pama-Nyungan | 5,671 (4,455–6,966) | Gulf Plains, Gulf of Carpentaria; then rapid replacement across Australia | Bouckaert, Bowern & Atkinson 2018, *Nature Ecology & Evolution* (not *Science*) `[Supported]` | Homeland partly an artefact of which sub-branches branch first; the paper itself calls evidence "inconclusive" |
| Uto-Aztecan | North–south split ~6,900 cal BP (Merrill 2009); maize in the US Southwest by ~4,000 BP | Great Basin (Merrill) vs south-central Mexico (Hill) | Merrill et al. 2009 *PNAS* `[Supported]` | **Homeland disputed** between two groups of linguists. Show nothing deeper than ~3 ka |
| Quechua and Aymara | Inca too recent for either family; Wari (~CE 600–1000) proposed for Quechua, Chavín (early horizon) for Aymara | Central Andes | Beresford-Jones & Heggarty 2010 `[Supported]` | Reverses the older "Inca spread Quechua" story for the family's age, but the Inca still spread it in CE 1400–1532. Two-stage story |
| Turkic | Early Middle Ages: CE 6th–11th c. across Eurasia; Orkhon inscriptions 8th c. CE; homeland Mongolia / Baikal region | Siberia to the Mediterranean (Seljuk Anatolia from CE 1071 `[Background]`) | Wikipedia summaries; Golden 2018 `[Supported, secondary]` | Younger and better attested than most. The Transeurasian link (Robbeets 2021, root ~9,200, West Liao millet farmers) is **contested**; leave it out of v1 |
| Arabic | Oldest dated Arabic papyrus CE 643; conquests CE 632–750; Arabisation of Egypt and the Maghreb gradual over centuries `[Background]` | Arabia → Levant, Egypt, N. Africa, Iberia (until 16th c.) | Wikipedia (papyrus, Andalusi) `[Supported]`; conquest dates `[Background]` | Best attested of the set; spread is a process not a date |

Not covered by search and worth a follow-up: Dravidian (Kolipakam 2018), Austroasiatic, Tai-Kadai, Hmong-Mien, Nilo-Saharan, Athabaskan, Trans-New Guinea. The first four matter for SE Asia coverage.

### 3. What a 5° cell × era can honestly say

A 5° cell is about 550 km across. In the 322 single-family cells today, one family is a fair answer. In the other 330 it is not: a cell can hold several unrelated families (New Guinea, the Caucasus, the Amazon, California). So the answer must be a **set with a basis**, not one string.

Three tiers, matching the measured/modelled/imagined rule in [vision.md](../../philosophy/vision.md):

| Tier | Meaning | Earliest honest date | Shown as |
|---|---|---|---|
| **Attested** | A text, inscription, early traveller or ethnographic record places the family there | Near East and Egypt ~3000 BCE; Anatolia ~2000 BCE (Hittite); China ~1250 BCE; Greece ~1450 BCE; South Asia ~1400 BCE; Mesoamerica ~500 BCE `[Background]`; most of the rest only by ~1500 CE | Solid line: "recorded" |
| **Modelled spread** | A dated phylogeographic study puts the family in the area in that window | ~5 ka for the best (Bantu, Austronesian, Sino-Tibetan, Pama-Nyungan); young families only after their start date | Hatched, with the date range |
| **Unknown** | Neither | Everything else: all of the pre-5 ka period, and most places before ~1500 CE | Grey "unknown", never a family |

Why not earlier than 5 ka: the dated trees above reconstruct *roots*, and the comparative method has little signal beyond about 6–8 ka `[Background]`. Dates near 8–9 ka (Indo-European, Transeurasian) come from single models and are contested. Languages that were replaced leave no trace in today's Glottolog, so any "language X was spoken here" claim for a place conquered since is blind to what was spoken before. Eight thousand years ago, many cells held languages of families that no longer exist.

A rule that must hold: **the Glottolog point for a language says where its speakers are now, not where they were.** Projecting 2020 coordinates back to 1000 BCE is only safe for places with no later spread. The expansion table is what marks those exceptions.

### 4. How this extends Seshat

What Seshat gives, from the data in `anthropology.json.gz` `[Direct]`:

- 33 cells, 552 cell-eras, −10000 to 1900. 105 cell-eras are BCE.
- The field is the **polity's** family, not the population's. Cell `15,-100` (Basin of Mexico): 1600 and 1700 are *Spanish Empire / Indo-European*, while the people were mostly Nahua (Uto-Aztecan) and Otomi (Otomanguean).
- The field is filled back to −10000 from a coder's assumption of continuity: the same cell is "Archaic Basin of Mexico / Otomanguean" at −6000.
- About a quarter of the 552 values are not language families. Examples in the data: `USMisEW`, `MlJeJe3`, `YeNeo**`, `IdCJBun` (polity or NGA codes), `Xiongnu`, `Rouran`, `Xianbei` (peoples), `Uto-Atzecan` (typo), and mixed granularity ("Altaic", "Japanese" vs "Indo-European"). That is my count from the Counter, not an audit of each one.
- Atlas build (`footstep-generator/anthropology/build.py:326,336`) copies the Seshat `Family` string unchanged.

How the new data extends it:

1. **Normalise, don't replace.** Map each Seshat family string to a Glottolog family id by hand (about 30 distinct real names). Drop the codes and typos. Keep Seshat's value as a *claim about the polity*, shown only with the polity name.
2. **Add the population's language separately**, from the three tiers above. Where the two differ (Spanish Empire over Nahuatl speakers) show both: "ruled by a Spanish-speaking empire; most people spoke Nahuatl".
3. **Use Seshat as a test set.** Of the 33 cells, wherever the new method returns a family for the same cell and era, it should agree with the normalised Seshat value except for known conquest cases. Disagreements are the interesting rows to read.
4. **Coverage jump.** Seshat: 33 cells. Glottolog points: 652 cells. D-PLACE societies: 431 cells with a family and a date (1850–1950).

### 5. Licence

Glottolog is CC BY 4.0, so attribution only `[Direct]`. The atlas is already CC BY-NC-SA 4.0 (README) so a derived mix is fine. Expansion rows are facts with citations, which are fine to quote. **Open:** the AGPL listing on the Seshat Zenodo record (above). ABVD, IE-CoR and D-PLACE tree licences were not verified; do not copy tree files without checking.

## What we don't know

- Whether Glottolog's languoid category (pidgin, creole, sign language) is in `glottolog_languoid.csv` or only in the CLDF. The CSV I read has `level` and `bookkeeping` but no category column `[Direct]`. Filtering colonial languages needs that field or a hand list.
- How many 5° cells fall back to "no language point at all" for HYDE's 904 land cells. 652 cells have a language; the other cells (Arctic, deserts, ocean margins) were not diffed against the atlas cell list.
- Which expansion dates survive reading the primary papers. I saw abstracts and press summaries for most, and Wikipedia text for Indo-European, Turkic and Arabic. Treat every number in the table as "as cited by a secondary source" until someone opens the paper.
- Afroasiatic and Uralic homelands, Dravidian, Austroasiatic and Tai-Kadai dates, and Nilo-Saharan were not researched. Searches for "Lang 2025" (Uralic) and an Ehret 2015 Semitic paper returned nothing.
- Whether any free dataset gives language *areas* (polygons) for historical periods. Glottolog does not. Ethnologue's World Language Mapping System is proprietary `[Background]`; I did not search for free alternatives such as Native Land Digital or Wikimedia language maps, or check their licences.
- Seshat Equinox's licence, and the exact count of Seshat polities with a `Family` value in the source zip (the zip is not in the repo).

## Recommendation and data plan

**Do:** build a language line for the hover and details panel at the three-tier honesty above. **Don't:** draw family colours on the globe, and don't show a family for any era before 5 ka.

Three steps, each shippable alone. Sizes are my estimates.

| Step | What | Output | Size |
|---|---|---|---|
| **1. Baseline (about 1500 CE)** | Download `glottolog_languoid.csv` + geo file. Filter out sign, pidgin, creole, artificial. Per 5° cell: families with language counts, and the nearest few languages. Add the Glottocode to the 1,291 D-PLACE societies and carry it through `build.py`. Normalise Seshat's family strings to Glottolog ids. | `footstep-generator/anthropology/languages.py` + a `languages` block per cell in `anthropology.json.gz`, shown for eras ≥ 1500 | M |
| **2. Colonial replacement (1500–1900)** | A short hand-written table: Spanish and Portuguese in the Americas, English in North America and Australasia, Arabic in North Africa, Turkic in Anatolia and Central Asia. Each row: family, area (cells), start year, source. | `languages_expansions.yaml` (same shape as `time_use.yaml`, one cited row per movement) | S |
| **3. Deep-time expansions** | Extend the same YAML with the table in Findings §2: family, Glottolog id, start-range (lo..hi BP), cells, source, status (disputed or not). Render hatched, with the range. Leave Indo-European, Afro-Asiatic and Uto-Aztecan as "disputed" rows with no cells until someone picks a model. | Same YAML | M |

Data shape (the invariant: a record is never a bare family string):

```
LanguageRecord = {
  families: [{glottolog_id, name, basis: "attested"|"modelled"|"present_day_analogue", n_languages?}],
  tier: "attested" | "modelled" | "unknown",
  date_range?: [lo, hi],        # BP, for modelled
  polity_family?: {name, source: "seshat"}   # separate from the population's
  sources: [...]
}
```

The `tier` must be `unknown` and `families` empty before a cell's first documented or modelled date. This is the same pattern as `evidenceAt` (`'modelled'`) in the app and the `none` source in the atlas README.

Next tasks to file (not done here): Step 1 as a Steady task; a follow-up to read the primary papers behind the §2 table and fill the empty family rows (Dravidian, Austroasiatic, Tai-Kadai, Nilo-Saharan); a check of the Seshat licence.

## Evidence

- `evidence/glottolog_stats.txt`: coordinate coverage, family counts, family bounding boxes, cell counts, from `glottolog_languoid.csv` (Glottolog 5.4, Zenodo 24104033).
- `evidence/dplace_ea_glottocodes.txt`: D-PLACE EA Glottocodes resolved against Glottolog 5.4.
- `evidence/seshat.py`, `stats.py`, `ea.py`: the scripts (kept outside git with the other evidence).
- Seshat figures read from `deploy/budgie/api/anthropology.json.gz` (committed) with ad hoc Python, no script saved beyond `seshat.py`.
