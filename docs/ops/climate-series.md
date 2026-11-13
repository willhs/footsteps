---
id: climate-series
type: reference
purpose: "Sources, method and regeneration of the global sea-level and temperature series"
---

# Climate series

`footstep-generator/climate_series.py` writes `footsteps-web/public/climate_series.json`
(committed, ~3 KB): one value per slider year, the same years as `TERRAIN_YEARS`
(every 1,000 years 100,000 BCE to 1000 BCE, then every 100 years 0 to 1900 CE). It feeds the
sea-level and temperature readouts and the pre-HYDE population model. Nothing reads it yet.

| Series | Source | Licence |
|---|---|---|
| `seaLevel` (m vs today, plus 1σ `sigma`) | Spratt & Lisiecki v2 (2025), [PANGAEA 979830](https://doi.org/10.1594/PANGAEA.979830), 0–430 ka "short" stack, 1 kyr rows | CC BY 3.0 |
| `temperature` (°C vs 0 BP) | Beyer, Krapp & Manica 2020, [Figshare 12293345 v4](https://doi.org/10.6084/m9.figshare.12293345.v4), `BIO1` annual mean temperature | CC BY 4.0 |

## Read it carefully

- **Time**: BP = 1950 − year (as in `terrain_image.year_to_bp`), so 1900 CE = 50 BP. Source ages
  are used as published; no calendar-year-zero shift is applied (≤1 year, far below source precision).
- **Sea level is relative to the stack's own zero**, which reads +4 to +8 m for 0–1 ka BP
  (within its ~5 m 1σ). Use differences, not absolute values, near the present.
- **Temperature is land-mean, not global**, for a fixed mask (cells with data at 0 BP, 60°S–90°N,
  cos-latitude weighted). Land swings more than the ocean, so the LGM reads about −7 °C where
  global mean surface cooling is nearer −5 to −6 °C. It has no uncertainty band.
- Values between source rows are linear interpolation; the 0–1900 CE entries are essentially
  flat. Do not read centennial detail into them. Beyer steps are 2 kyr before 22 ka BP.

## Regenerate

```bash
mkdir -p data/raw/spratt2025 data/raw/beyer2020
curl -L -o data/raw/spratt2025/spratt2025_pangaea979830.tsv 'https://doi.pangaea.de/10.1594/PANGAEA.979830?format=textfile'
curl -L -o data/raw/beyer2020/LateQuaternary_Environment.nc https://ndownloader.figshare.com/files/22659026  # 1.33 GB, MD5 d23abb7ce8671433ea36a2cae814ebab
poetry run python footstep-generator/climate_series.py
```
