---
id: ops-other-humans
type: ops
purpose: "How the other-kinds-of-human layer is drawn, where its numbers come from, and how sure they are"
---

# Other kinds of human

On by default (View panel "Other humans"; `?humans=0` starts it off). Before about 30,000 BCE the map shows
the other humans alive at the same time as *Homo sapiens*:

| Who | Where | Drawn until (fades between) | Basis |
|---|---|---|---|
| Neanderthals | Iberia to the Altai, Levant, Zagros | 41–39 ka BP | Higham et al. 2014, doi:10.1038/nature13621 (checked) |
| Denisovans | Altai, Tibet, East and SE Asia; a fainter "hinted" area around Wallacea | 60–32 ka BP | Chen et al. 2019; Xia et al. 2024; Jacobs et al. 2019 (checked) |
| *H. floresiensis* | Flores | 60–50 ka BP | Sutikna et al. 2016, doi:10.1038/nature17179 (checked) |
| *H. luzonensis* | Luzon | 50–45 ka BP | Détroit et al. 2019, doi:10.1038/s41586-019-1067-9 (minimum ages only: **could not verify** an end date) |

Late *H. erectus* (Ngandong, Java, 117–108 ka: Rizal et al. 2020) ends before the slider starts and is not drawn.
Neither are older species (*H. naledi*, *H. heidelbergensis*) or the "ghost" archaic population seen only in African genomes.

## What is on screen

- **Bands** (`footsteps-web/public/other_humans/bands.json`, read by `lib/otherHumanBands.ts`): one mark per guessed band of
  about 15 people, like the Units view of our own species: ▲ Neanderthals, ■ Denisovans, ✦ *H. floresiensis*, ★ *H. luzonensis*.
  How many and where are **guesses** (the legend and the hover card say so); see "Guessed bands" below. Denisovan bands in the
  Wallacea area, inferred only from Denisovan DNA in Papuans and Aboriginal Australians, are fewer and drawn fainter.
- **Fade**: each species is drawn fully until the earliest of its last dates and fades to nothing by the latest
  (`presenceAt`); its bands drop out one by one in a fixed random order, so half-way through the fade half are left. The end dates match `footstep-generator/prehistory/arrivals.yaml` `other_hominins`, which the
  anthropology atlas (`anthropology/deep.py`) also reads; keep the two in step.
- **Sites**: 24 key dated sites with the find, a source and its DOI; brighter when the year shown is within the site's dates.
  Each is `checked: true` or has a `couldNotVerify` reason, which the tooltip shows. See "Source check" below.
- **Names**: "Neanderthals / another kind of human · last seen about 40,000 years ago". Island species are named from
  zoom 3; the subtitle shows from zoom 2. On the globe, names draw over the ground and are hidden round the back.

Lavender, so it reads as cool next to the evidence marks (blue, teal) and never as people (the only warm colour).

## Guessed bands (2026-11-20)

Will asked for points like the people, not areas. `footstep-generator/other_humans_bands.py` makes them from
`footstep-generator/other_humans/bands.yaml`:

| | People (guess) | Bands of 15 | Basis |
|---|---|---|---|
| Neanderthals | 20,000 | ~1,350 | Bocquet-Appel & Degioanni 2013 (doi:10.1086/673725): nine scenarios, census of the order of 5,000–70,000; 20,000 is a choice inside it |
| Denisovans | 10,000 | ~660 | none: no census estimate exists; half the Neanderthal figure |
| *H. floresiensis* | 500 | ~30 | none found; one island of ~14,000 km² |
| *H. luzonensis* | 1,000 | ~67 | none found; Luzon is ~110,000 km² |

Band size 15: Skov et al. 2022 (doi:10.1038/s41586-022-05283-y) read Chagyrskaya's low genetic diversity as a community of
10–20 people; one Altai community, used for all four. Numbers are held constant until each species fades.

Where, every 1,000 years from 100 to 30 ka BP:

1. **Habitat**: the pre-HYDE model's potential forager density (`prehistory_population.Model.potential_and_climate`: Beyer
   climate → Miami NPP → Tallavaara's fit × habitat rules, Krapp land and ice at the time). It is a yardstick fitted to
   recent *Homo sapiens* foragers, used only to say which places were richer, not how many lived there.
2. **Range**: the hand-drawn outline around each species' fossils and DNA (moved here from `lib/otherHumans.ts`),
   softened by about a cell, except Flores and Luzon, which stay on their island. The Wallacea area counts at 0.3.
3. **Placing**: each 0.5° cell gets its share of the bands, rounded with a fixed random number per cell, so a cell that
   stays good keeps its bands from step to step (~2,000 Neanderthal spots in all for ~1,350 a step). Bands go at fixed
   random spots in the cell, skipping any in the year's sea or a lake (the app's `site_terrain.webp` at that sea level).

So the pattern says "more where it was warmer and wetter inside the range", which follows from a sapiens yardstick
and may be wrong for cold-adapted Neanderthals; the exact spots are imagined. Regenerate with
`poetry run python footstep-generator/other_humans_bands.py` (~30 s; needs `data/raw/beyer2020` and Krapp); tests in
`footstep-generator/tests/test_other_humans_bands.py` and `lib/otherHumans.test.ts`.

## Source check (2026-11-19)

Every site and species was looked up against the paper (abstract or full text where reachable; publisher pages, Crossref
and Europe PMC; a few from secondary summaries, said below). DOIs are in `doi` in `lib/otherHumans.ts` and resolve in
Crossref. `lib/otherHumans.test.ts` fails if an entry is neither checked nor explained, has no DOI, or if the three
species' end dates drift from `arrivals.yaml` `other_hominins`.

What the check changed:

- **Wrong or unsupported dates**: Gorham's Cave (no cited paper gives a 50 ka start; Finlayson's 28 ka is *uncalibrated*
  radiocarbon and disputed); El Sidrón 51–47 → 52–45 (48.4 ± 3.2 ka BP); La Ferrassie 60–41 → 54–41 (Guérin 2015
  luminescence); Grotta Guattari 66–50 → 66–65 (hyena den, Rolfo 2023); Vindija 50–44 → 52–44; Mezmaiskaya 70–42 →
  70–43; Tabun 120–90 → 138–106 (secondary); Shanidar 75–45 → 70–45; Chagyrskaya 59–49 → 59–51; Okladnikov 50–40 →
  at least 44; Denisova Cave 200–50 → 195–52; Feldhofer 42–39 → 41–39 (both individuals "approximately 40,000" 14C yr).
- **Wrong facts**: Chagyrskaya has 11 people, not 13 (13 is Chagyrskaya + Okladnikov); Kebara 2's hyoid is the first
  Neanderthal hyoid found, not the "oldest known"; El Sidrón is 12 individuals in the cited paper; Spy has more than two.
- **Wrong citations**: "Welker et al. 2024" for Baishiya is Xia et al. 2024 Nature 632:108 (Welker is last author; also
  fixed in `arrivals.yaml`); the Amud burial paper is Hovers, Kimbel & Rak 2000 (J Hum Evol 39:253), not "Hovers et al.
  2011", and Amud's dates come from Valladas 1999 and Rink 2001; Rolfo 2023 is the Guattari hyena-den paper.
- **Wrong place**: Grotte Mandrin was ~17 km off (it is at Malataverne, 4.771 E, 44.469 N); Teshik-Tash ~35 km off
  (67.156 E, 37.966 N). Others moved by under 2 km to the published point.
- **Penghu** is dated by fauna and sea level to two windows (190–130 or 70–10 ka); the drawn range is the paper's wider
  "most likely 190–10 ka" from Chang 2015. Harbin and Penghu have no published findspot: the points are approximate.

Could not verify (the tooltip says why):

- Gorham's Cave start (50 ka): not in either cited paper.
- La Chapelle-aux-Saints 60–47 ka: Rendu 2014's abstract gives no age; "about 50 ka" is from secondary sources.
- Tabun C1: the paper's text was not reachable; ~122 ± 16 ka is from secondary summaries.
- Teshik-Tash: undated (Mousterian context); the range is a stand-in.
- *H. luzonensis* end date: only minimum ages (≥ 50 and ≥ 67 ka) exist. A 2023 review (Grün & Stringer, doi:10.1016/j.quascirev.2023.108379)
  suggests the fossils may be far older (press says up to ~135 ka); we have not read it past the abstract. The 50–45 ka fade is
  a modelling choice.

Checked from the abstract or a secondary summary only (full text paywalled): Kebara (Valladas 1987 TL dates), Higham 2014,
Iasi 2024 and the Penghu/Harbin papers' dates. The Denisovan fade (60–32 ka) is right for fossils and sediment DNA; Papuan
admixture runs to ~30 ka (95% CI 14–50), so "last seen" is the physical evidence, not the genes.

### Per-site result

**Neanderthals**

| Site | Age | Status | DOI |
|---|---|---|---|
| Gorham's Cave, Gibraltar | ~50,000–28,000 years ago | could not verify: Neither paper gives the 50 ka start of the range; the late end (28 ka) is a radiocarbon claim that Higham et al. 2014 disputes. | [10.1038/nature05195](https://doi.org/10.1038/nature05195), [10.1038/nature13621](https://doi.org/10.1038/nature13621) |
| El Sidrón, Spain | ~52,000–45,000 years ago | checked | [10.1111/j.1475-4754.2012.00671.x](https://doi.org/10.1111/j.1475-4754.2012.00671.x) |
| La Ferrassie, France | ~54,000–41,000 years ago | checked | [10.1016/j.jas.2015.01.019](https://doi.org/10.1016/j.jas.2015.01.019), [10.1038/s41598-020-77611-z](https://doi.org/10.1038/s41598-020-77611-z) |
| La Chapelle-aux-Saints, France | ~60,000–47,000 years ago | could not verify: The paper’s abstract gives no age; "about 50 ka" comes from secondary sources, so the 60-47 ka range is unconfirmed. | [10.1073/pnas.1316780110](https://doi.org/10.1073/pnas.1316780110) |
| Grotte Mandrin, France | ~50,000–42,000 years ago | checked | [10.1016/j.xgen.2024.100593](https://doi.org/10.1016/j.xgen.2024.100593) |
| Spy Cave, Belgium | ~44,000–41,000 years ago | checked | [10.1073/pnas.2022466118](https://doi.org/10.1073/pnas.2022466118) |
| Feldhofer Cave (Neander Valley), Germany | ~41,000–39,000 years ago | checked | [10.1073/pnas.192464099](https://doi.org/10.1073/pnas.192464099) |
| Grotta Guattari, Italy | ~66,000–65,000 years ago | checked | [10.1016/j.quascirev.2023.108132](https://doi.org/10.1016/j.quascirev.2023.108132) |
| Vindija Cave, Croatia | ~52,000–44,000 years ago | checked | [10.1126/science.aao1887](https://doi.org/10.1126/science.aao1887), [10.1073/pnas.1709235114](https://doi.org/10.1073/pnas.1709235114), [10.15184/aqy.2024.12](https://doi.org/10.15184/aqy.2024.12) |
| Mezmaiskaya Cave, Russia | ~70,000–43,000 years ago | checked | [10.1038/nature26151](https://doi.org/10.1038/nature26151) |
| Tabun Cave, Israel | ~138,000–106,000 years ago | could not verify: The paper’s text was not reachable; ~122 ± 16 ka for C1 comes from secondary summaries, and other methods give different ages. | [10.1006/jhev.2000.0443](https://doi.org/10.1006/jhev.2000.0443) |
| Kebara Cave, Israel | ~64,000–48,000 years ago | checked | [10.1038/330159a0](https://doi.org/10.1038/330159a0), [10.1038/338758a0](https://doi.org/10.1038/338758a0) |
| Amud Cave, Israel | ~70,000–50,000 years ago | checked | [10.1006/jasc.1998.0334](https://doi.org/10.1006/jasc.1998.0334), [10.1002/gea.1017](https://doi.org/10.1002/gea.1017), [10.1006/jhev.1994.1019](https://doi.org/10.1006/jhev.1994.1019), [10.1006/jhev.1999.0406](https://doi.org/10.1006/jhev.1999.0406) |
| Shanidar Cave, Iraq | ~70,000–45,000 years ago | checked | [10.15184/aqy.2019.207](https://doi.org/10.15184/aqy.2019.207) |
| Teshik-Tash, Uzbekistan | ~70,000–40,000 years ago | could not verify: The site is undated (Mousterian context only); the 70-40 ka range is a stand-in for the Central Asian Mousterian, and the findspot is approximate. | [10.1038/nature06193](https://doi.org/10.1038/nature06193) |
| Chagyrskaya Cave, Russia | ~59,000–51,000 years ago | checked | [10.1038/s41586-022-05283-y](https://doi.org/10.1038/s41586-022-05283-y) |
| Okladnikov Cave, Russia | at least 44,000 years ago | checked | [10.1038/s41586-022-05283-y](https://doi.org/10.1038/s41586-022-05283-y), [10.1038/nature06193](https://doi.org/10.1038/nature06193) |

**Denisovans**

| Site | Age | Status | DOI |
|---|---|---|---|
| Denisova Cave, Russia | ~195,000–52,000 years ago | checked | [10.1038/nature08976](https://doi.org/10.1038/nature08976), [10.1038/nature09710](https://doi.org/10.1038/nature09710), [10.1038/s41586-018-0870-z](https://doi.org/10.1038/s41586-018-0870-z) |
| Baishiya Karst Cave (Xiahe), Tibet | ~160,000–32,000 years ago | checked | [10.1038/s41586-019-1139-x](https://doi.org/10.1038/s41586-019-1139-x), [10.1126/science.abb6320](https://doi.org/10.1126/science.abb6320), [10.1038/s41586-024-07612-9](https://doi.org/10.1038/s41586-024-07612-9) |
| Harbin, China | at least 146,000 years ago | checked | [10.1016/j.xinn.2021.100130](https://doi.org/10.1016/j.xinn.2021.100130), [10.1126/science.adu9677](https://doi.org/10.1126/science.adu9677), [10.1016/j.cell.2025.05.040](https://doi.org/10.1016/j.cell.2025.05.040) |
| Penghu Channel, Taiwan | ~190,000–10,000 years ago | checked | [10.1126/science.ads3888](https://doi.org/10.1126/science.ads3888), [10.1038/ncomms7037](https://doi.org/10.1038/ncomms7037) |
| Tam Ngu Hao 2 (Cobra Cave), Laos | ~164,000–131,000 years ago | checked | [10.1038/s41467-022-29923-z](https://doi.org/10.1038/s41467-022-29923-z) |

**Homo floresiensis**

| Site | Age | Status | DOI |
|---|---|---|---|
| Liang Bua, Flores | ~100,000–60,000 years ago | checked | [10.1038/nature17179](https://doi.org/10.1038/nature17179) |

**Homo luzonensis**

| Site | Age | Status | DOI |
|---|---|---|---|
| Callao Cave, Luzon | at least 50,000 years ago (some finds 67,000) | checked | [10.1038/s41586-019-1067-9](https://doi.org/10.1038/s41586-019-1067-9), [10.1016/j.jhevol.2010.04.008](https://doi.org/10.1016/j.jhevol.2010.04.008) |

## TextLayer fix

`@deck.gl/layers`' CJS build wraps `@mapbox/tiny-sdf` in node mode, so `TextLayer` threw "not a constructor" and drew
no text (this also hid the city names behind `?settlements=1`). `next.config.js` aliases `@mapbox/tiny-sdf` to
`footsteps-web/lib/shims/tinySdf.cjs`, which returns the class itself.
