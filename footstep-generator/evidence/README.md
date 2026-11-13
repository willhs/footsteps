# Dated evidence (p3k14c)

Real dated archaeological sites, as an input to the population model and a "sources nearby"
list, not a map layer. Findings: [research 0003](../../docs/research/0003-p3k14c-earliest-dates-by-region/research.md).

```bash
python footstep-generator/evidence/p3k14c.py fetch    # CSV + IntCal20, SHCal20, Marine20 -> data/raw/p3k14c/
python footstep-generator/evidence/p3k14c.py build    # -> data/evidence/ (about 50 s)
python footstep-generator/evidence/p3k14c.py report   # -> data/evidence/earliest_by_region.{md,json}
python -m pytest footstep-generator/tests/test_evidence.py -q
```

Needs numpy and pandas. Everything under `data/` is git-ignored: rebuild, do not commit.

## Files

| File | Job |
|---|---|
| `calibrate.py` | Pure calibration: curve + (14C age, error) arrays -> 95.4% HPD intervals, median, status |
| `regions.py` | The arrival-table regions, their coarse extents and the table's values (there is no `arrivals.yaml` yet; this is where the region list lives) |
| `p3k14c.py` | Parse and clean the CSV, calibrate, group dates into sites, export, CLI |
| `report.py` | Earliest qualifying dates per region |

## Outputs (`data/evidence/`)

- `p3k14c_sites.json.gz` (about 0.9 MB): the file for the web app. Local sites only (`LocAccuracy` 2 or 3,
  19,905 sites): name, lat/lon, accuracy, date count, calibrated range, median range, methods,
  materials, sources and a reference index. `meta.fields` documents every key.
- `p3k14c_dates.csv.gz`: every calibrated date, with its `site_id`, region, curve, status and all HPD
  intervals (`old-young;old-young`, cal BP). Includes province-level dates.
- `earliest_by_region.{md,json}`: the report.

## Rules

- **Calibration:** IntCal20 north of the equator, SHCal20 south, Marine20 (DeltaR = 0) for material that
  names a marine species or says "marine". Shell without a species, bulk sediment, soil and carbonate
  are `uncertain` (reservoir or old-carbon risk): calibrated on the land curve, flagged, and never used as
  evidence. Ranges are cal BP (years before 1950); year CE = 1950 - cal BP. A date older than the curve
  (about 55 cal ka) has status `older_than_curve` and no range. Multimodal results keep every interval;
  the site-level `cal` is the hull, which overstates the span.
- **Location:** `LocAccuracy` is kept on every date. 0 = country only, 1 = province or county centroid,
  2 = within ~500 m, 3 = exact. Below 2 is never exported for local views. Almost all Pleistocene dates
  are 1 in the public file, so regional evidence uses 1 and shows it.
- **Dedupe:** `LabID` is already unique. A repeat is a date at a named, locally placed site with the same
  age, error, material and coordinates under another lab id; the better-placed copy is kept. Province
  centroids are never deduped (thousands of dates share one point).
- **Sites:** same normalised name + country within 2 km (single linkage) is one site. Centroid dates are
  grouped by name and point and never merged into a precise site by name.
- **Attribution:** p3k14c records no hominin. Every site is unattributed; the export says so.
- **Counts are effort, not people.** Never sum dates or sites into a population.

## In the web app

The details panel lists nearby dated sites ("Evidence nearby"): the nearest within 150 km whose range
overlaps ±500 years of the slider year. `footsteps-web/lib/evidence.ts` fetches the file only when the
panel opens. To serve it: `mkdir -p footsteps-web/public/evidence && cp data/evidence/p3k14c_sites.json.gz footsteps-web/public/evidence/`
(git-ignored, like the grid images). Without it the panel says the file is not available.

# Dated evidence (AADR ancient DNA)

A second kind of dated evidence: ancient individuals from the Allen Ancient DNA Resource (AADR v66.p1,
Reich Lab; annotation table only, no genotypes; CC0 1.0, Harvard Dataverse doi:10.7910/DVN/FFIDCW).
Each row is one skeleton with a date and a place, so it is direct evidence of a person, where a
radiocarbon date can be a tree. Findings: [research 0010](../../docs/research/0010-aadr-ancient-dna-samples-by-region/research.md).
Not wired into the app.

```bash
python footstep-generator/evidence/aadr.py fetch     # newest *_1240K.aadr.PUB.anno (13 MB, md5-checked) -> data/raw/aadr/
python footstep-generator/evidence/aadr.py build     # -> data/evidence/aadr_samples.json.gz (about 0.4 MB, a second)
python footstep-generator/evidence/aadr.py report    # -> data/evidence/aadr_report.md
python -m pytest footstep-generator/tests/test_aadr.py -q
```

Needs numpy and pandas. Everything under `data/` is git-ignored: rebuild, do not commit.

| File | Job |
|---|---|
| `aadr.py` | Parse the `.anno` (columns found by header text), drop, dedupe, assign regions, export, CLI |
| `aadr_report.py` | Earliest sapiens sample per arrival-table region, coverage by era, the bias figures, the archaic samples |

## Output (`data/evidence/aadr_samples.json.gz`)

One row per individual: `id`, `la`/`lo`, `dp` (decimals of the coarser coordinate: 0-1 is a rounded or
centroid place), `d` date mean, `sd`, `r` = [old, young] 95.4% range (all cal BP), `t` date type, `n` locality,
`c` country, `g` genetic-group label, `q` curators' assessment, `rg` arrival-table region, `p` index into `refs`.
`h` (hominin) and `rs` (range source) appear only when unusual. `meta.fields` documents every key.

## Rules

- **Dates:** years before 1950, as in the table. A BCE year adds 1950 (AADR's convention). The range is the
  table's own 95.4% range from `Full Date`; when that is open-ended (`>43500 calBCE`) or unreadable the range is
  mean ± 2 sd (`rs: mean_sd`). When the table's range and mean disagree (beyond 2 sd) the range is mean ± 2 sd
  and `rs: conflict`: one of the two is wrong. Conflicting samples are exported but never used in the report.
- **Date type** (`t`): `d` direct radiocarbon on this individual; `c` context (an archaeologist's range for the layer,
  or dates on other finds at the site); `t` tethered to a relative's date; `o` other. Prefer `d` for arrival evidence.
- **Dropped:** present-day people, rows with no coordinates or no date (reference genomes), (0,0) and
  off-globe coordinates. Counts are in `meta.counts`.
- **Dedupe:** by Individual ID (one skeleton is listed once per library and data type). The best-assessed library
  is kept (Pass, then PROVISIONAL, Questionable, CRITICAL), earliest in the file on a tie.
- **Assessment is kept, not filtered.** It is about the DNA (contamination, damage), not about when the person lived.
  Filter on `q` if you need clean genomes. A group the curators label `DontUse` is left out of the report.
- **Attribution:** AADR includes Neanderthals and Denisovans. `h` marks them (an explicit list of groups); they are
  kept out of every sapiens figure. All other samples are Homo sapiens by the table's own group labels.
- **Regions:** AADR has a country, not a continent. `COUNTRY_CONTINENT` maps it (Russia is split at 60 E) and the
  coarse boxes in `regions.py` do the rest. A country the table does not know ends up in `other` and is listed in
  `meta.counts.unmapped_countries`; the real-table test fails on one, so add it.
- **Place:** coordinates are the locality's, as published. Many are a site; some are a district centroid (`dp` 0-1).
- **Bias, plainly:** 68% of usable samples are in Europe and 99% are younger than 11.7 ka. Only 116 are older than
  12 ka. The record cannot test the arrival rows for Sahul, Japan, South Asia or the Tibetan plateau, and none of it
  is older than about 46 ka. Absence is not evidence of empty land.
- **Counts are effort, not people.** A sample dates one skeleton. Never sum samples into a population.

## Model against evidence

`model_vs_evidence.py` compares the modelled pre-HYDE population (`data/tiles/prehistory/`) with these dates per
arrival-table region, 50-12 ka BP: site-occupancy curves with the Surovell et al. 2009 taphonomic correction, onset
dates, shape tests, region-geometry checkpoints and five PNG charts. Findings and model proposals:
[research 0009](../../docs/research/0009-model-vs-evidence/research.md). Needs matplotlib as well as numpy and pandas.

```bash
python footstep-generator/evidence/model_vs_evidence.py   # -> docs/research/0009-model-vs-evidence/ (about 1 min)
python -m pytest footstep-generator/tests/test_model_vs_evidence.py -q
```
