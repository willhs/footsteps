---
id: ops-close-up-scene
type: ops
purpose: "How the close-up 3D ground is drawn, and what ?ground=1 adds: biome surface detail in the shader, what is measured, modelled and imagined, how to check it"
---

# Close-up scene: the 3D ground

From zoom 8 on the flat map the camera tilts into a landscape (`footsteps-web/components/footsteps/layers/Close3DLayer.ts`,
`lib/close3d.ts`). On by default; `?close3d=0` keeps the map flat.

| Part | Source | Label |
|---|---|---|
| Relief | AWS Terrarium elevation tiles, drawn 1.6 times taller | measured |
| Water | flat at the year's sea level (`lib/climate.ts`) | modelled |
| Ground colour | the year's Earth image (`terrain_image.py`) with a baked hillshade, sand shore, rock, snow | modelled |
| Biome under each spot | Krapp2021 biome per 0.5° cell, Beyer climate ([habitat-lookup](habitat-lookup.md)) | modelled |
| Plant marks (`?plants=1`) | cones and blobs by biome, hand-placed | imagined (off: they read as toys) |
| Surface detail (`?ground=1`) | procedural pattern in the fragment shader, below | imagined |

## `?ground=1`: the biome painted on the ground

Off by default until Will has looked at it on prod. The "3D:" note under the year then reads "3D: ground measured, surface imagined"
(`close3dNote` in `lib/close3d.ts`; its hover text says the biome is modelled and the pattern imagined).
No new download: everything is noise computed in the shader.

**Data shape.** Each ground vertex carries a `Cover` (`coverFor` in `lib/close3d.ts`) in the mesh's `texCoords`: two numbers that
the GPU interpolates, so both are smooth axes, never a class id.

- `dryCold`: 0 desert sand, 1 grass, 2 ice or snow. Grass sits in the middle, so a blend across a biome edge passes through a
  natural neighbour.
- `layer`: below -0.75 open water (no detail), -0.5 wet low ground, 0 bare of trees, up to 1 closed tree canopy.

| Biome (Krapp code) | Cover |
|---|---|
| 1-11 forests, 15 woodland | grass underlay, `layer` = the biome's tree share from `VEGETATION` (0.55-0.95 for forests) |
| 12, 16-18 savanna, parkland | few crowns (0.16-0.3) |
| 13-14 shrubland | 0.2 |
| 19-20 grassland, 22-26 tundra | grass, no crowns |
| 21 desert, 27 barren | sand |
| 28 land ice, or ground above the snow line | ice |
| low (under 5 m above the year's sea; desert under 3 m), flat (under 0.006 m/m) land | wet: reeds and pools, no trees |
| steeper than about 0.5 m/m (shader, from the mesh normal) | rock strata over any of the above |

Wet ground is a geometry rule: the elevation tiles carry no rivers, so a marsh shows only where land is low and flat (Mesopotamia,
Dutch coast, deltas), not along a river in higher ground.

**Shader** (`layers/groundDetail.ts`, a deck.gl `LayerExtension` injected into the ground `SimpleMeshLayer`): grass tone patches, grain
and clumps; a lumpy canopy (crowns where noise is high, dark gaps between; sparse crowns for savanna); sand megadunes, dunes,
ripples and grain; ice streaks, cooler tone and a net of cracks; reed-olive wet ground with dark pools; banded rock on steep slopes.

**Size follows the pixel.** A pixel at close-up zoom is 20-80 m, far bigger than a tuft or a crown. Every pattern is noise on the
ground's metres with a nominal size (a crown is ~14 m), but its lattice never drops below about 3 pixels: it grows with the pixel size and
cross-fades between doublings, so the texture stays visible and does not shimmer. Dunes, ripples and cracks fade out when
their wavelength falls under a few pixels. The pattern is anchored to the ground (it does not slide when you pan) but changes
look as you zoom. It is a texture, not a map of trees.

**Cost.** One fragment shader, no texture or tile. Noise is evaluated only for the families present at a pixel. Measured 2026-11-21
(production build, headed Chromium on an Apple GPU, 1440 × 900, camera wiggling, frame limit lifted; Amazon and Sahara three runs each,
the other scenes one): mean 19.9 fps off and 21.6 on at zoom 10, 15.8 off and 15.3 on at zoom 12, over nine runs each. Single runs
ranged from 10 to 48 fps either way, so the shader's cost is inside the noise: the frame is limited by the page's CPU work (settlements,
tile meshes), not by this shader.

## Check it

```bash
pnpm --dir footsteps-web build && python3 -m http.server -d footsteps-web/out 4600   # needs public/grid, terrain, habitat
node footsteps-web/scripts/measure-ground.mjs http://localhost:4600 /tmp/ground-out
```

It loads five scenes (Amazon 1000 CE, Sahara 1000 CE, Mongolian steppe 0 CE, Scandinavia 20,000 BCE, Mesopotamia 3000 BCE) at zoom
10 and 12, with and without `?ground=1`, saves the pairs and prints fps per run. It needs a headed browser (headless Chromium
throttles animation frames). Frame rate is limited by the page's CPU work as much as by the GPU, so repeat runs and compare means.

## Limits

- The pattern is the same formula everywhere a family applies: two forests with the same biome look alike up to the noise.
  Conifer and broadleaf crowns are not told apart; savanna is single crowns.
- Biome borders follow the 0.5° cells, so a change of cover is a sharp line.
- The relief colour and baked hillshade are unchanged; the shader multiplies and tints them.
- Globe view is not supported (the shader reads mesh offsets as degrees); the close-up is flat-map only.

## People and animals (`?figures=1`)

Opt-in until reviewed on production. At the zoom where individual footprints appear, the newest of each person's three prints becomes a small upright silhouette; the two older prints remain its trail. Adults and children differ in size. With `?routine=1`, asleep people lie down, resting people sit, and walkers carry a staff/tool or a load according to their existing `DayPlan`. Without routine, the existing walking/rest rhythm continues. Shapes, poses, equipment and positions are imagined. `footprintData`, person ids, `describePerson`, year-morph opacity, and other-human picking keep their existing contract. No second routine scheduler is introduced.

`PeopleLayer` uses the same GPU gait for both looks, with an upright camera-facing quad (or a ground-plane quad while asleep) in the newest-print slot. `?figures=0` or omitting the parameter preserves footprints. The current sparse-cell rule still draws no individuals below 15 people per group; a Kalahari 1800 scene may contain wildlife without human figures.

`useAnimalsLayer` loads fauna blocks and the food model independently of hover and `?food=1`, only in the opt-in street view. `lib/animals.ts` builds at most 120 stable instances (up to 72 wild, reserving room for livestock) around the view, on an illustrative fixed geographic lattice (~550 m north–south, narrower east–west at high latitudes): plant eaters in small groups of three, predators singly. Each candidate must be in its own PHYLACINE 1° range cell at the millennium step, and outside the habitat sea/ice mask. Only the loaded 30° block is used; animals in a neighbouring block appear when the view centre enters it. The selection uses the same notable large animals as the hover card. This is a selection of species, not abundance or a reconstructed animal census.

Farmer/herder groups can have small domestic herds (cattle, sheep/goats, horses, camels, llamas/alpacas, dogs) only when the full food-model roster allows them at that cell and era; the four-food hover summary is not used. Domestic herds are placed by occupied patches near the existing people, including people at the nearer year-morph endpoint. Wild candidates stay at least 350 m from people’s home spots, domestic candidates 85 m. Bounded shader wander stays within 12 m; land checks include a 16 m margin. This avoids groups at home, not people on arbitrary routine trips. The habitat mask is coarse (0.5°); it cannot resolve a river bank or individual field.

Animals are cool grey; people retain the warm palette. Silhouettes distinguish broad body forms (quadruped, elephant/mammoth, camelid, horned ungulate), not every species' anatomy. Picking names the species and says “range modelled (PHYLACINE), this animal imagined”; domestic picking instead says “availability modelled (food spread model), this domestic animal imagined”. No PHYLACINE claim is made for livestock.

People and animals retain the existing overlay-on-terrain depth policy: they do not sample elevation and can show through a hill. Their readable pixel size is illustrative, not a measured height. Animation changes uniforms only, with no per-frame JavaScript loop over instances.

Reproduce screenshots, picking and street-zoom fps with a headed GPU browser:

```bash
node footsteps-web/scripts/measure-figures.mjs http://localhost:4444 <evidence-directory>
```

The harness uses public production data to supply this checkout's missing gitignored assets. It visits Kalahari 1800, Mongolia 1000, Ukraine 15,000 BCE and Nile 1500, day and night, plus default footprints and Grid/Dots. Its JSON report records the actual loaded layers and species, GPU picks, errors and frame rates; screenshots and report belong outside git. The script chooses a nearby populated group from the real data for the closest view when one exists. A species named in an acceptance scene is not forced into that scene if the range/spread model does not supply it.

The current food export has no dog taxon; the renderer accepts dogs if the model supplies them, but does not invent them independently.
