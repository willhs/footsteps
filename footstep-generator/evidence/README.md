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
