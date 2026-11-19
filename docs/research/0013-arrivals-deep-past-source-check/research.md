---
id: arrivals-deep-past-source-check
type: note
purpose: "What the 2026-11-19 source check of the memory-only entries in arrivals.yaml and deep_past.yaml found and changed, and which changes need a population-model rerun"
---

# Source check: arrivals.yaml and deep_past.yaml

Research date: 2026-11-19. Steady task `fdcbfb41-9bce-429f-bdaf-1756d2b8273d` (Footsteps goal: check the sources marked recalled).
Vision alignment: *Footsteps: how people lived (measured vs modelled vs imagined)*; this makes the modelled pre-10,000 BCE
tables say which claims are sourced.

## What was checked

- `prehistory/arrivals.yaml`: the 23 entries marked `verification: memory` (15 regions, 8 habitat rules). `other_hominins` was
  left alone (another job; `footsteps-web/lib/otherHumans.ts`).
- `anthropology/deep_past.yaml`: the 31 technocomplexes marked `memory`, the `biome_prey` block, and the remembered sources inside
  `pre_clovis` (already "checked"); `initial_upper_palaeolithic` and `clovis` got DOIs.

Each citation was looked up (publisher page, Crossref, Europe PMC, PubMed; full text only where the table says so, otherwise the
abstract). Every DOI in the two tables (141) resolves in Crossref and was compared with the author, year, journal and title
(`evidence/doi-check.txt` in the job workspace). Nothing is left as `memory`.

The flag now has two values: `checked` (the cited papers exist and the key claim, meaning the span and the dated finds, was
confirmed) and `could_not_verify`. Either can carry a `could_not_verify:` sentence: for a `checked` entry it names the
sub-claims no paper was found for (a hearth-and-shelter description, a game list); for a `could_not_verify` entry it says why
the whole claim could not be confirmed. The atlas puts that sentence in each field's note (`check_note` in `deploy/budgie/api/atlas.py`).
`test_anthropology_deep.py` fails if an entry is neither, has no reason, or a checked technocomplex has no DOI.

## Result

| Table | Entries | checked | could_not_verify |
|---|---|---|---|
| arrivals regions (of 27) | 15 | 15 | 0 |
| arrivals habitat rules | 8 | 3 (coast, cold_limit, aridity: direction only) | 5 (river, lake, ecotone, refugia, ramp) |
| technocomplexes | 31 | 28 | 3 (Magdalenian, Azilian, Ice Age Tasmania) |
| biome prey | 1 | 0 | 1 |

Most "checked" technocomplexes still carry a `could_not_verify:` list of details with no paper: the check confirmed their dates
and named finds, not every phrase.

## Values and citations that were wrong

Arrivals:

- Burney 2004 is *J Hum Evol* 47:25, not *J Archaeol Sci*, and gives earliest presence ~2.3 ka (no cut marks in the abstract); Dewar 2013's foragers are from ~4 ka (2000 BC), not ~10 ka.
- Napolitano 2019 (Caribbean): first dispersal ~5.8 ka; the old `early` 7.0 had no support.
- Chusang handprints: ~20 ka OSL, redated to 7.4-12.7 ka (Meyer 2017); the "226-169 ka" in the table had no source.
- Japan: "Nakagawa 2010" is Ishigaki Shiraho-Saonetabaru (20-16 ka), not Yamashita-cho or Sakitari; Yamashita-cho is 32.1 ka *14C* BP (~36 ka cal, secondary); Sakitari 35-30 ka. **Hokkaido's Palaeolithic begins no earlier than ~30 ka** (Nakazawa 2017), not 38.
- Kostenki: the table cited Higham 2011 (Kent's Cavern) and Benazzi 2011 (Grotta del Cavallo, Italy). Correct: Anikovich 2007 (45-42 ka).
- Tolbor: Zwyns 2019 is *Sci Rep* 9:11759, site Tolbor-16 (42.5-45.6 ka), not Tolbor-4 in *Nat Commun*.
- Bourgeon 2017 is *PLoS ONE*, not *Quaternary Research*, and gives 24 ka at Bluefish, so the 30 ka `early` has no site behind it.
- Pedra Furada's claim is 20+ ka (Boëda 2014), not 30+.
- Fa-Hien Lena: the PLoS ONE microlith paper is Wedage, not Perera; Wedage 2019 *Nat Commun* is 10:739.
- Lapita "~3.3 ka" is the Bismarck date; Remote Oceania was settled ~3.2-3.0 ka (Denham 2012; Sheppard 2015).
- Tallavaara 2018 is not CC BY and does not use effective temperature; Tallavaara 2015's "330 ka → 130 ka → 410 ka" is 330,000 → 130,000 → 410,000 *people*.
  The "below -30 C few groups outside the Arctic" claim and an Italy/Balkans refuge were not supported (Posth 2023 says Italy was replaced).

Technocomplexes (selection):

- Cueva de los Aviones shells are ~50 ka (Zilhão 2010), not 115-120 ka. Qafzeh's shells are *Glycymeris*, ~92 ka, not *Nassarius* 100-90 ka.
- Mezhirich huts are ~18 ka cal BP (Chu 2025), not ~15 ka. Chauvet's first phase is 37-33.5 ka, not "c. 36".
- Ambrose 1998 was cited as the Toba paper; the Later Stone Age starts ~44-42 ka at Border Cave, not "c. 20 ka in the south".
- "Higham 2011 Nature 479:521" was cited for Aurignacian dating (it is Kent's Cavern); replaced by Higham 2012 (Geißenklösterle).
- Eyed needles are not first in the Solutrean: Denisova ~40 ka, Kostenki-15 ~30 ka (Gilligan 2024). Paisley Caves has cordage, not the Fort Rock sandals.
- Wallacean art attributions (Aubert 2014/2018/2019, Brumm 2021) were right; the Timor fish-hook age is ~23-16 ka, not "42-23".
- Cosgrove 1999 is *Forty-two degrees south*; books with no checkable page (Habu 2004, Hiscock 2008, Meltzer 2009, Straus, Mussi 2002) were replaced by papers or dropped.

## Changes to values the population model reads

Only `arrivals.yaml` feeds `prehistory_population.py`. **The model was NOT rerun.** Changed by more than ~10% or reordering a region:

| Region | Old central (early-late) | New | Change | Model effect |
|---|---|---|---|---|
| `japan_hokkaido` | 38 (38-32) | 30 (32-28) | -21% | **Yes**: Hokkaido cells are empty 8,000 years longer; Hokkaido now arrives after Japan (38), Ryukyu (36) and the Siberian box (40), so its order among regions changes. Rerun the model. |
| `madagascar_indian_ocean` | 2.0 (4-1) | 2.3 (4-1) | +15% | None: after the model window (ends ~12 ka BP), empty throughout. |
| `caribbean` | 6.0 (7-4) | 5.8 (6-4) | `early` -14% | None: after the window. |
| `pacific_remote` | 3.5 (3.5-1) | 3.1 (3.3-1) | -11% | None: after the window. |

Smaller changes (kept below 10%): `japan` `early` 38→40, `japan_ryukyu` central 38→36. Region ids, boxes and file order are unchanged, so the
committed atlas's per-cell region indices are still valid. The committed `deploy/budgie/api/anthropology.json.gz` was refreshed with
`poetry run python footstep-generator/anthropology/deep.py --tables-only`, which re-reads only the two yaml tables and keeps the modelled
people, climate and fauna cells. Those cells still use the old Hokkaido date until the model is rerun.

`evidence/arrival_check.py` runs on the new table (checked against the cached p3k14c rows and AADR from the main project's `data/`):
no region newly flags "evidence older than `early`", and Hokkaido's earliest p3k14c date is 8.3 ka, far younger than 28 ka.

## Follow-ups

1. Rerun the prehistory population model (`prehistory_population.py`) for the Hokkaido change, then `deep.py` (full) and the model-vs-evidence reports (research 0009, 0010).
2. Read the full text of the abstract-only papers listed in `could_not_verify` fields: Napolitano 2019 (dates came from press summaries), Posth 2023, Lisiecki & Raymo 2005 stage boundaries, Ge 2023 (Nwya Devu redated), Izuho 2012 and Izuho & Kaifu 2015 (no DOI), Calcagnile 2019.
3. Decide whether `central` 60 ka for island Southeast Asia and `early` 30 ka for Beringia (both hedges with no dated site) should move to the dated figures (46 ka; 24 ka).
4. The Azilian, Magdalenian and Ice Age Tasmania entries need real dating papers; the biome-prey lists need a source with a game table, or to be labelled as the model's own.
5. The `food/foragers.py` staples and the remaining "recalled" food and footwear tables belong to other jobs under this goal.
