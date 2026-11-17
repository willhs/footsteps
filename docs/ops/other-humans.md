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
| Neanderthals | Iberia to the Altai, Levant, Zagros | 41–39 ka BP | Higham et al. 2014 (checked in `arrivals.yaml`) |
| Denisovans | Altai, Tibet, East and SE Asia; a fainter "hinted" area around Wallacea | 60–32 ka BP | Chen et al. 2019; Xia et al. 2024; Jacobs et al. 2019 |
| *H. floresiensis* | Flores | 60–50 ka BP | Sutikna et al. 2016 (checked) |
| *H. luzonensis* | Luzon | 50–45 ka BP | Détroit et al. 2019 (minimum ages; recalled) |

Late *H. erectus* (Ngandong, Java, 117–108 ka: Rizal et al. 2020) ends before the slider starts and is not drawn.
Neither are older species (*H. naledi*, *H. heidelbergensis*) or the "ghost" archaic population seen only in African genomes.

## What is on screen

- **Ranges** (`footsteps-web/lib/otherHumans.ts`): hand-drawn outlines around the known fossil and DNA sites. They are
  approximate, not measured territories, and the legend says so whenever they are shown. The Denisovan Wallacea area is
  inferred only from Denisovan DNA in Papuans and Aboriginal Australians; it is drawn fainter.
- **Fade**: each species is drawn fully until the earliest of its last dates and fades to nothing by the latest
  (`presenceAt`). The end dates match `footstep-generator/prehistory/arrivals.yaml` `other_hominins`, which the
  anthropology atlas (`anthropology/deep.py`) also reads; keep the two in step.
- **Sites**: 24 key dated sites with the find and a source; brighter when the year shown is within the site's dates.
  Most site dates are recalled from the literature (`checked: false`) and the tooltip says so.
- **Names**: "Neanderthals / another kind of human · last seen about 40,000 years ago". Island species are named from
  zoom 3; the subtitle shows from zoom 2. On the globe, names draw over the ground and are hidden round the back.

Lavender, so it reads as cool next to the evidence marks (blue, teal) and never as people (the only warm colour).

## TextLayer fix

`@deck.gl/layers`' CJS build wraps `@mapbox/tiny-sdf` in node mode, so `TextLayer` threw "not a constructor" and drew
no text (this also hid the city names behind `?settlements=1`). `next.config.js` aliases `@mapbox/tiny-sdf` to
`footsteps-web/lib/shims/tinySdf.cjs`, which returns the class itself.
