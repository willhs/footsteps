---
id: prehistory-population
type: reference
purpose: "Method, sources, choices and limits of the modelled pre-HYDE population (100,000-11,000 BCE)"
updated: 2026-11-14
---

# Modelled population before HYDE

`footstep-generator/prehistory_population.py` writes `data/tiles/prehistory/humans_{year}.webp`
for every 1,000 years from 100,000 to 11,000 BCE (90 images, ~1.7 MB in all) and
`totals.json` (low / central / high people per year). **This is a model, not data.** It
says where a forager population of a published size would sit if density followed plant
productivity, and nothing it draws has been seen in the ground. Any screen that shows
it must say "modelled". Design and sources: [research 0002](../research/0002-pre-hyde-population-model/research.md).

**In the app.** The images use `grid_image.py`'s encoding (`LEVELS`, `MAX_PEOPLE`) at 720 × 360 (0.5°)
instead of 4320 × 2160. They are published into the same `/grid/` directory as HYDE's (`scripts/deploy-budgie.sh`
rsyncs `data/tiles/prehistory/`; `scripts/smoke.sh` checks all 90), and `gridData.ts` decodes each as 6 × 6 cells of HYDE's
5′ grid, each sharing its block's people equally, so cell ids, the glow texture and the year morph work across 10,000 BCE.
`totals.json` is also written to `footsteps-web/public/prehistory_totals.json` (a full default run only) and bundled:
`lib/time.ts` (`PEOPLE_TOTALS`, `populationRangeAt`) turns it into the counter's range, e.g. "~1.9–7.4 million, modelled".
Where it shows "modelled": counter and its note (top left), the timeline header chip and the pale people bars with a
"modelled | HYDE, measured" boundary, the legend (with a link to research 0002), and the grounding panel (read per 0.5° block).
"Imagine their day" and the portrait work for these years too: the anthropology atlas has a modelled record per 5° cell × 1,000-year era
(`footstep-generator/anthropology/deep.py`, see its README), and the day card is labelled "Speculative · modelled people". Dots mode draws nothing for these years.
A band is drawn only where a block holds about 540+ people (15 per HYDE cell), so before ~12,000 BCE clickable people are rare (e.g. around Lake Victoria and Sri Lanka at 20,000 BCE).

## Run

```bash
# inputs (all gitignored under data/raw/): Beyer 2020 (see climate-series.md), Krapp 2021,
# HYDE 3.5 (see grid-images.md, terrain-images.md), and:
mkdir -p data/raw/naturalearth data/raw/tallavaara2018
for f in ne_10m_rivers_lake_centerlines ne_10m_lakes; do curl -L -o data/raw/naturalearth/$f.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/$f.geojson; done
poetry run python footstep-generator/prehistory_population.py --verify          # all 90 years, ~4 min
poetry run python footstep-generator/prehistory_population.py -40000 -20000     # some years
poetry run python footstep-generator/prehistory_population.py --dates early     # other arrival column
poetry run pytest footstep-generator/tests/test_prehistory_population.py -q     # real-data tests skip if inputs are absent
```

`--dates early|late` swaps the arrival column of `arrivals.yaml` (`central` by default); the
documented alternatives (`alt`) are not wired to a switch.

When regeneration runs in a worktree, copy its entire `data/tiles/prehistory/` directory
into the main checkout before deploying from main. Compare SHA-256 hashes against the
regeneration manifest; merging code does not copy these gitignored images.
`GRID_ONLY=1 scripts/deploy-budgie.sh` publishes the population images (the app and API deploy themselves from `main`)
and does not resend PMTiles. If image URLs are reused, purge those exact URLs in Cloudflare
(Caching → Configuration → Custom Purge → URL, at most 30 per request), then compare
the public response bytes with the regenerated files. The one-day image cache can otherwise
serve the old population even after the origin files are replaced. Visitors with images
already in their browser cache may also need to reload with the cache disabled.
Run `scripts/smoke.sh https://footsteps.willhs.me` and the browser arrival check
(`node footsteps-web/scripts/verify-prehistory-arrivals.mjs <base-url> <evidence-dir>`).

The arrival corrections from commit `66b5c2d` were published on 2026-11-14: all 90
regenerated images were copied into main, deployed to budgie, and their Cloudflare URLs
purged. Public response SHA-256 hashes match the original regeneration manifest for
every modelled year. The dependent anthropology atlas was deployed with the API.
Live browser decoding confirmed empty Jerusalem/Lhasa/Kyushu checkpoints at 100,000
and 50,000 BCE and populated checkpoints at 30,000 and 28,000 BCE. The browser script
captured Grid, Units and Dots views, then exited nonzero because its development-only
hydration-warning filter does not recognise production React error `#418` (the existing
deep-link hydration issue noted in research 0009).

## Method

For each slider year (BP = 1950 − year), on the 0.5° grid of Krapp and Beyer (row 0 = 90°N):

1. **Climate.** Beyer et al. 2020 annual mean temperature and annual precipitation, linearly
   interpolated between its 1–2 ka steps. Cells Beyer has no data for (shelf, south of 60°S)
   borrow their neighbours' values.
2. **NPP.** The Miami model (Lieth 1975) from those two: the lesser of
   `3000 / (1 + exp(1.315 − 0.119 T))` and `3000 (1 − exp(−0.000664 P))`, g/m²/yr.
   It knows nothing of CO₂ or seasonality (a glacial CO₂ penalty would lower NPP everywhere).
   Beyer's own `npp` layer is not used.
3. **Density.** Tallavaara, Eronen & Luoto 2018 (PNAS 115:1232), NPP-only fit from their
   published script (Zenodo 1167852, `Tallavaara_Data_analyses.pdf` section 4.1, CC BY 4.0):
   `ln(people / 100 km²) = −0.13527 + 0.0028623 · NPP` up to NPP 1,371.7, then slope −0.000212.
   n = 299 ethnographic groups, R² = 0.45. It is the fit's median; the scale step removes the
   level, so only the shape (where is it denser) survives.
4. **Habitat** (multipliers, `habitat_rules` in `arrivals.yaml`):
   - cold: coldest-month mean temperature from Beyer's monthly layers, 0 below −35 °C, 1 above −20 °C;
   - aridity: NPP 0 below 100, linear to 1 at 300;
   - coast ×1.5 (land cell touching sea; the 20 km rule is applied to the whole 0.5° cell);
   - river ×1.3 and lake ×1.3 (cell holds a Natural Earth 10m river or lake; present-day courses stand in for the past);
   - ecotone ×1.2 (the 3×3 neighbourhood has a second Krapp biome);
   - multipliers stack (at most ×3).
5. **Ice and sea.** Krapp's land, sea and ice (`terrain_image.biome`), interpolated between
   1 ka steps, so the masks match the terrain images. Habitable area = land − ice; shelf
   exposed at low sea level counts as land.
6. **Who was there.** Each cell belongs to the first `arrivals.yaml` region whose box holds its
   centre, else the nearest box. Density ramps 0 → 1 over `ramp_ka` after the region's central arrival
   date (`ramp_ka` 0 is a step). The mask is blurred by 1.5 cells so box edges are not rulers,
   then zeroed in cells whose region has not arrived. Smoothing must not create an early arrival.
   Specific boxes precede their continental boxes: Levant/north Arabia and south Arabia before Africa,
   southern Iberia/Sicily before Africa, Tibet before South/East Asia, and the Japanese island boxes
   before East Asia. Primorye/Sakhalin explicitly use continental East Asian dates; Honduras/Nicaragua
   use North America's dates. Siberia's central onset is 40 ka BP with an 8 ka ramp (research 0009 P4).
7. **Scale.** One multiplier per step so the world total equals the central curve below.
8. **Hand-over.** `weight = clip((year + 14000) / 4000, 0, 1)`; each cell is
   `(1 − weight) · model + weight · HYDE`, with HYDE's 10,000 BCE people summed 6 × 6 to 0.5°.
   At 12,000 BCE it is half and half; at 10,000 BCE it is HYDE itself. The low and high totals
   blend toward HYDE's total the same way, so the range closes at the join. The window starts at
   14,000 BCE (the central Americas arrival), so HYDE's Americas never reach the map before people do.
   It is 4,000 years because the model and HYDE disagree about *where* (below): a 2,000-year
   blend moved 73% and 66% of the world's people between 1,000-year images (12→11 ka, 11→10 ka),
   against 11–22% elsewhere. At 4,000 years the steps are 48, 52, 36 and 33%: smoother, but the
   geography still visibly shifts (people thin out of Africa and thicken in the Americas) because the two
   disagree. `test_real_handover_moves_people_no_faster_than_the_years_around_it` holds the maximum under 60%.
   Measured by L1 distance between consecutive images, normalised by the larger total.

Images show the **central** curve; low and high exist only in `totals.json`.

## World-total curve

Millions of people; log-interpolated in age and held flat beyond the ends (`WORLD_CURVE`).

| Age (ka BP) | Low | Central | High | Basis |
|---|---|---|---|---|
| 11.95 (10,000 BCE) | 4.0 | **4.6** | 6.0 | HYDE 3.5 (central); ~12 ka literature range 4–6 M |
| 21 (LGM) | 2.1 | 4.0 | 8.3 | Old World: carnivore densities (low), forager densities (high), Gautney & Holliday 2015 (secondhand); central is a choice |
| 30 | 1.4 | 2.8 | 5.0 | choice |
| 40 | 1.0 | 1.8 | 3.0 | research 0002 synthesis (Biraben 1.5 M unverified) |
| 70 | 0.3 | 0.55 | 1.0 | research 0002 synthesis |
| 100 | 0.10 | 0.20 | 0.40 | 130 ka census 0.1–0.3 M from genetics (Sjödin 2012, secondhand), rising |

The columns come from different studies. Low and high are **not** one family of curves, and the high
column dips at 12 ka (6.0 M) below its LGM value (8.3 M). They are what the counter shows as a range, not a
confidence interval. Every figure marked secondhand or synthesis needs its paper checked before it is shown as sourced.

## What the first run says

- Central totals: 0.20 M (100,000 BCE), 0.51 M (70,000), 1.67 M (40,000), 3.85 M (20,000), 4.58 M (11,000).
  The model holds ~14% of the people the Tallavaara fit would put on every ice-free cell once
  everyone has arrived, so the scale step never asks for more than the fit allows.
- Africa alone until the first exit; mainland Southeast Asia at 70 ka; Sahul at 50 ka; the Americas from 16 ka (all central dates).
- At the last glacial maximum northern Europe is empty and the southern refugia (Iberia, Italy, the Balkans) hold people; this comes
  from the cold rule, not from the `refugia` list, which is documentation only.
- Where it disagrees with HYDE (the pure model at 12,000 BCE, before the blend was lengthened to 14,000 BCE, against HYDE's 10,000 BCE grid):
  the same total (4.46 M vs 4.59 M) but different places: Africa 33% vs 8%, the Americas 20% vs 51%,
  northern Asia 0.4% vs 4%. Across the hand-over people therefore fade out of Africa and
  into the Americas on the map. The total is smooth; the geography is not. Either HYDE or this
  model is wrong about early-Holocene Africa and America, and nothing here settles which.

## Known limits and choices

- **Rules not applied as written.** (1) `ramp`'s neighbour-front rule is dropped: at 0.5° a step-by-step front moves
  ~55 km per 1,000 years, far slower than the table's own dates. Arrival date plus ramp stage the spread instead.
  (2) The `refugia` boxes are not a mechanism (above). (3) River and lake cells use present-day courses.
- **Region boxes are coarse rectangles.** Mainland Southeast Asia (central 70 ka, "low confidence, two bones")
  shows as a rectangle with people before South Asia or the Levant. The 46 ka alternative would close
  the gap; switching it is a decision for Will. `madagascar_indian_ocean` and `caribbean` were added to the
  table because the Africa and North America boxes would otherwise populate those islands from the start.
- **Other hominins** (Neanderthals, Denisovans) are not drawn and not counted.
- **Canada north of 56°N** belongs to the Arctic region (4.5 ka) and stays empty until the HYDE blend.
- **NPP fit transfer.** Trained on recent foragers at present-day CO₂. No CO₂ term, no biodiversity or pathogen term.
- **Not compared yet** with Timmermann & Friedrich 2016 (CC BY-NC); research 0002 step 7.
- Sea-level uncertainty (±5 m) and Krapp's 0.5° land mask make coasts soft; exposed shelf is only as good as Krapp's mask.

Arrival-mask clamping does not alter the HYDE hand-over: after 14,000 BCE the blend can still put
people in late-settled islands (research 0009 P9's separate blend issue). The world curve and counter
ranges are unchanged by the region corrections. A full run rewrites both copies of `totals.json`
with the same values. The default interval has **90** images; 10,000 BCE is the separate measured HYDE image.

## Sources

| Input | Where | Licence |
|---|---|---|
| Beyer, Krapp & Manica 2020, `LateQuaternary_Environment.nc`, 1,333,236,636 bytes, md5 `d23abb7ce8671433ea36a2cae814ebab`, sha256 `7312280854bab9e95f8721c80050c0889b29ad3087a00bd264e7500d33d19857` | `data/raw/beyer2020/` | CC BY 4.0 |
| Tallavaara et al. 2018, Zenodo 1167852 (record `1069786` redirects to it): `Data_analyses.pdf` md5 `84e487576cf03b9668311267e8ae1a1d`, `Dataset_4.xls` md5 `8ccd7d54d6bda8902ea8f4b91f6e3696`; coefficients transcribed into `TALLAVAARA` | `data/raw/tallavaara2018/` | CC BY 4.0 |
| Krapp et al. 2021 biomes (land, sea, ice) | `data/raw/krapp2021/` | CC BY 4.0 |
| HYDE 3.5, `popd_10000BC.asc` | `data/raw/hyde-3.5/` | HYDE 3.5 |
| Natural Earth 10m rivers and lakes v5.1.2: rivers sha256 `bb854a900ecbd3b408df46d5e16e3e0f974ba55993f9d8b5c26e855273c0905a`, lakes sha256 `2d036f53dedec578001c5c30c2959ee7d4eebc1306900fa4367c49929ec8f2d9` | `data/raw/naturalearth/` | public domain |

## Tests

`footstep-generator/tests/test_prehistory_population.py`: the curve and its HYDE anchor, the NPP and density
functions against their published forms, arrival ramps, region assignment, a synthetic world (each step's total equals
the curve, only Africa at 100 ka, convergence on HYDE), the image round trip, and with real inputs (skipped when absent):
the 11,000 BCE grid is within 5% of HYDE's total and nearer to HYDE than 12,000 BCE, and no one lives on ice or sea.
