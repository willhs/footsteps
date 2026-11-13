---
id: fauna
type: reference
purpose: "Method, outputs and limits of the large-animal ranges dataset (PHYLACINE + a cited extinction table); read only by the anthropology atlas (big game before 10,000 BCE)"
---

# Fauna: which big animals lived here then

Animals are one of the human constants ([human-constants](../philosophy/human-constants.md)). This is a first
dataset for "which big mammals were around this spot at this year". It is **modelled, not measured**, and
**the only reader is the anthropology atlas** (`footstep-generator/anthropology/deep.py` folds it into 5° cells for the "prey" field before 10,000 BCE; nothing in the web app reads the file itself). Code: `footstep-generator/fauna/`. Tests: `footstep-generator/tests/test_fauna.py`.

```bash
poetry install
poetry run python footstep-generator/fauna/phylacine.py fetch   # sparse git clone -> data/raw/phylacine/src (79 MB)
poetry run python footstep-generator/fauna/phylacine.py build   # -> data/fauna/fauna.json.gz (122 KB) + species.csv; ~15 s
poetry run python footstep-generator/fauna/phylacine.py check   # sanity checks below
poetry run pytest footstep-generator/tests/test_fauna.py -q
```

`build` reads the Krapp biome file for the land-ice mask (`data/raw/krapp2021/`, the same file the habitat
lookup uses; `--krapp PATH` if it lives elsewhere). Everything under `data/` is git-ignored.

## Sources

| What | Source | Licence |
|---|---|---|
| Ranges and traits | PHYLACINE 1.2.1, Faurby et al. 2018, Ecology 99:2626, <https://github.com/MegaPast2Future/PHYLACINE_1.2> (`Data/Ranges/Present_natural`, `Data/Traits`) | **CC0** (the task notes said CC BY 4.0; the project page says Creative Commons 0, see research 0004). We credit it anyway |
| Land ice per step | Krapp et al. 2021 BIOME4 class 28, same file as [habitat-lookup](habitat-lookup.md) | CC BY 4.0 |
| Extinction and extirpation dates | a small table, `fauna/losses.py`, each entry with its source | citations |

PHYLACINE has **no extinction dates**. Its only timing field is the IUCN status with a custom `EP` code ("extinct
in prehistory"), plus `Island.Endemicity`. So the dates are ours (below), and most species get a regional default.

## Method

1. **Species.** All 5,831 PHYLACINE mammals, kept if land-living and at least 44 kg, plus 14 smaller key
   animals (wolf, dhole, African wild dog, lynx, wolverine, striped hyena, saiga, Mongolian gazelle, chiru, goitered
   gazelle, springbok, Thomson's gazelle, roe deer, chamois). Dropped: people (*Homo*), apes and all primates, seals, whales and dolphins, the
   polar bear (sea-ice dependent), the dromedary (domestic). Hippopotamus is kept though PHYLACINE flags it marine.
   Four are dropped for lack of any usable date: *Amblyrhiza*, *Stegodon trigonocephalus*, *Bubalus grovesi*, *B.
   palaeokerabau* (`losses.EXCLUDED_NO_TIMING`). **329 species** are exported: 164 extinct (157 prehistoric, 7 recent), 165 living.
2. **Range on a 1° grid.** The 0/1 rasters are 360 × 142 cells of 96.5 km, Behrmann equal-area, 90N to about 60S.
   Each 1° cell centre is sampled from the raster cell holding it. The inverse projection is a sphere scaled to the file's
   tiepoint, good to about one raster cell (as in research 0004). Nothing south of 60S (no Antarctica).
3. **Timing.** For each species and cell, `timing.resolve` picks `last_ka` (age of the last record, ka BP):
   the first `Loss` in the species' table entry whose boxes hold the cell, else, for `EP` species, the regional default
   (North America 12.5, South America 11, Sahul 42, Africa 12, elsewhere 20 ka), else never lost. Living species
   with an entry (wild horse and saiga in North America, lion in Europe, spotted hyena in Eurasia) lose just that region.
4. **Refugia.** Wrangel Island (4.0 ka) and St Paul Island (5.6 ka) are forced into the woolly mammoth's range even
   though the raster misses them, because the dates exist there. They are the only forced cells.
5. **Range cuts.** PHYLACINE's counterfactual range for the wild horse reaches South America, Africa and Sahul and
   the hippopotamus reaches Europe. Those cells are cut (`Basis.range_cut`).
6. **Ice.** A cell is empty at a step if all four of its 0.5° Krapp cells are land ice that step (Fennoscandia at 20 ka).

**The rule** (`timing.first_present_step`): step *k* stands for *k* ± 0.5 ka. A species is present in a cell at step
*k* iff the cell is in its range, it was alive at some moment in that span (`k >= last_ka − 0.5`), and the cell is not ice at *k*.
So a species is shown through the step that holds its last record: last record 4.0 ka shows at the 4 ka step and not
the 3 ka step; the aurochs (last cow 1627 CE) still shows at step 0. Step *k* is year 1950 − 1000 *k*; steps are the
same 0..102 as `habitat_lookup.py` (`year_to_ka` is tested equal), so 1900 CE is step 0 and 100,000 BCE is step 102.

### How good is each date (`timing` on each species)

| Basis | Meaning | Species |
|---|---|---|
| `dated` | a published last-appearance estimate for this species | 21 of the 157 prehistoric extinct species (island and Madagascar entries included), plus the living spotted hyena's loss of Eurasia and the two Madagascar hippos |
| `historic` | a written record (aurochs 1627 CE, bluebuck about 1800 CE, lions in Greece about 100 CE) | 6 (5 recent extinctions, plus the lion's loss of Europe) |
| `regional` | **no species date**: the region's typical window | **136 of the 157 prehistoric extinct species**, plus the horse and saiga cuts in North America |
| `range_cut` | not a date: a region the counterfactual range wrongly includes | the wild horse (South America, Africa, Sahul) and hippopotamus (Europe); these cells are removed, so no species ever shows `range_cut` |

So **most extinct species are placed by a guess about their region, not by a date for them.** Every `dated` entry
names its source in `fauna.json.gz` (`species[].losses`) and in `losses.py`. Where I confirmed a figure against a search
summary of the paper this session the entry says "checked"; the rest say "recalled". None was read from a paper's
tables. Checked: woolly rhino 14.0 (Stuart & Lister 2012), cave bear 24 <sup>14</sup>C ka = 27.8 cal ka (Pacher & Stuart 2009; Alps only),
cave lion 14.1 (Stuart & Lister 2011), giant deer 7.7 in West Siberia (Stuart et al. 2004), *Elasmotherium* 39
(Kosintsev et al. 2019), Wrangel 4.0 and St Paul 5.6 mammoths. Recalled or from secondary summaries: mainland mammoth 10.5, Europe 14,
straight-tusked elephant 30, Merck's and narrow-nosed rhino 40, *Diprotodon* 44 (contested; some argue 28–30), cave hyena 31,
Caribbean sloths 4.4, island dwarfs 11, Madagascar hippos 1.0.

## Output

`data/fauna/fauna.json.gz` (122 KB), documented in its own `meta.fields`:

| Key | Content |
|---|---|
| `species[]` | `id`, `name`, `common`, `kg`, `role` (`prey` / `predator` / `herd`), `status` (IUCN code; `EP` = extinct in prehistory), `extinct`, `cells` (range size), `timing` (bases used), `losses` (cited dates and boxes) |
| `cells` | 1° cell id → `[species id, first step shown, …]`. Id = row × 360 + col, row 0 = 90N–89N, col 0 = 180W. 18,156 cells hold at least one species |
| `ice` | step → cell ids that are land ice that step (103 steps) |

Present at step *k* iff `k >= first step` and the cell is not in `ice[k]`. `fauna.Fauna.at(lat, lon, year)` does this.
`species.csv` is the same species table for a human. In the file, the roles are 148 prey, 147 herd, 34 predator.

**Role** is a coarse rule, not behaviour data: *predator* eats mostly vertebrates (≥ 50% in PHYLACINE's diet fields) or
is a bear (giant panda excepted); *herd* is a plant eater from a family or genus that forms large groups (bovids,
equids, camels, elephants and mammoths, giraffes, hippos, deer genera such as reindeer and red deer, pigs), minus forest
and ledge species (duikers, serows, tragelaphines, mountain goat, takin); *prey* is any other plant eater or omnivore.
Common names are hand-written (PHYLACINE has none): species-level for living animals, genus-level for most extinct ones.

## Sanity checks (from `phylacine.py check`, built 14 Nov 2026)

| Check | Result |
|---|---|
| Woolly mammoth, Siberia (65N 100E), 20 ka | present (also at 100 ka, 12 ka and 10 ka) |
| Mammoth, same cell, after the mainland date | last shown at the 10 ka step (8000 BCE); gone from 9 ka on (last record 10.5 ka) |
| Mammoth, any cell at 3 ka or younger | none; **Wrangel Island present at 4 ka, gone at 3 ka**; St Paul present at 6 ka, gone at 5 ka |
| Horses (*Equus*), Great Plains, Alaska, Mexico | present at 22 ka and 12 ka; **none at 9,000 BCE (11 ka) or after**; the Kazakh steppe keeps *Equus ferus* to 1900 |
| Horses, Argentina | *Hippidion* until about 11 ka, then none (wild horses were cut from South America) |
| *Diprotodon*, Murray-Darling (33S 143E) | present at 43,000 BCE (45 ka), gone at 40,000 BCE (42 ka) |
| Fennoscandia (65N 20E) | empty (ice sheet) at every step to 10 ka, 10 species at 5 ka |
| Serengeti | 34 large species at 20 ka, 27 at 1900 (the losses are *Pelorovis*, *Megalotragus* and kin) |
| N France | 23 species at 40 ka (straight-tusked elephant, two forest rhinos, woolly rhino…), 17 at 20 ka, 13 at 5 ka, 12 at 1900 |

## Limits (read before using it)

- **Present-natural ranges are a counterfactual, not fossil ranges.** They say where a species "would live today
  without humans" given today's climate. They do not move with the ice ages. Mammoths and woolly rhinos really ranged
  far south onto glacial steppe (France, Iberia, China); here a species can only ever be where its modern range is.
  Species that lived on land exposed by low sea level (Beringia, Sunda, the Bass Strait land) are not placed there
  either: the raster is the present coastline.
- **Biome masking is not done, on purpose.** I considered gating each species by the modern Krapp biomes of its
  range. Subtracting cells could only ever remove animals, and a species' modern biome set often misses the glacial
  steppe it lived on, so it would drop true presences. Adding cells needs a niche model and per-species validation.
  The only mask is land ice, which is certain. A later version could add southward range for the few species with
  good fossil maps (mammoth, woolly rhino, cave lion, horse).
- **Most dates are regional guesses** (above): 136 of 157 prehistorically extinct species. The regional windows
  are wide (Eurasia: roughly 40 ka to the Holocene) and a species-specific truth can be 20 ka away from its default.
  The defaults are tagged `regional` in the file so a viewer can say "somewhere in this window".
- **Region boxes are coarse** (`timing.REGION_BOXES`): Arabia, Central Asia and Southeast Asia fall under "eurasia"; the
  Americas split at 7N. A species straddling a box edge gets two dates.
- **Extant species' own losses are mostly absent.** Only wild horse and saiga (North America), lion (Europe) and spotted
  hyena (Eurasia) have regional extirpations. Others (the Atlas elephant, Asiatic lion, tiger in the Caucasus, bison in
  Europe) are shown to 1900 inside their natural range even where people removed them earlier.
- **1° cells over 96.5 km raster cells.** At 60N a 1° cell is about 55 km wide, so several share one raster cell;
  small islands and narrow ranges are blurred. 1° cell edges follow no coastline: coastal cells can show land animals over water.
- **Step 0 stands for both 1950 and the app's 1900.** Losses after 1900 (Schomburgk's deer 1938, Queen of Sheba's gazelle 1951) are treated as alive through it.
- **Presence is "likely", not "seen".** Nothing here says an animal was at that cell at that date, only that its modelled
  natural range holds the cell and no loss has happened yet. Densities, migrations and seasons are absent. Label it "modelled".
- **Roles and names are coarse** (see above) and the common names are written by hand, so expect odd ones among the extinct genera.

## If this goes in the app

Label it **modelled** (it is a third kind of claim, with HYDE people "measured" and the pre-HYDE people "modelled"),
word it "large animals whose natural range includes this area", never "were seen here", and show the `regional` basis as a
range of years. The file is small enough (122 KB) to load whole in the browser. See [research 0004](../research/0004-ground-view/research.md) section 5.

## Sources

- Faurby, S., Davis, M., Pedersen, R. Ø., Schowanek, S. D., Antonelli, A. & Svenning, J.-C. 2018. PHYLACINE 1.2: the
  Phylogenetic Atlas of Mammal Macroecology. Ecology 99:2626. doi:10.1002/ecy.2443. Faurby & Svenning 2015, Divers. Distrib. 21:1155.
- Krapp, Beyer & Manica et al. 2021, Scientific Data (BIOME4 via pastclim), doi:10.5281/zenodo.8415273.
- Dates: see `fauna/losses.py` (Faith & Surovell 2009 PNAS 106:20641; Saltré et al. 2016 Nat Commun 7:10511; Stuart & Lister 2011, 2012;
  Pacher & Stuart 2009 Boreas 38:189; Stuart et al. 2004 Nature 431:684; Kosintsev et al. 2019 Nat Ecol Evol 3:31; Vartanyan et al. 1993;
  Graham et al. 2016 PNAS 113:9310; Steadman et al. 2005 PNAS 102:11763; Johnson et al. 2016 Proc R Soc B; Bartlett et al. 2016 Ecography 39:152 is the best next table to mine).
