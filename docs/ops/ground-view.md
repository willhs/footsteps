---
id: ground-view
type: reference
purpose: "How the hover card's painted ground view works: scenes, prompt template, how to regenerate, labels and limits"
---

# Ground view: a painted picture of what the spot looked like

The hover card (on by default, [habitat-lookup](habitat-lookup.md)) can show one small picture at the top: the landscape
under the cursor at the slider's year, seen from the ground. It is **imagined**: a painted guess, not a record. Every
picture carries a corner tag "Imagined" and a caption naming the facts it was chosen from ("A painted guess from:
Shrub tundra · −12 °C · foraging"). Research and options: [research 0004](../research/0004-ground-view/research.md).

## How a picture is chosen

Pure code, no network per hover: `footsteps-web/lib/groundScene.ts`.

1. The habitat lookup gives the Krapp biome at the cursor. `lib/groundScenes.json` groups the 27 land biomes into 9
   **landscapes** (ice, tundra, boreal, temperate-forest, steppe, savanna, rainforest, desert, scrub). A test fails if a
   biome has no landscape or two.
2. The **era** is `farming` or `herding` where HYDE says people live there (same rule as the card's way-of-life row),
   else `glacial` before 9,700 BCE (`GLACIAL_END`), else `holocene`. Before HYDE, people are assumed to be foragers
   (modelled), so the era comes from the date alone.
3. Scene id = `landscape-era`. 19 scenes are listed; when the exact one is not painted the nearest era stands in
   (`rainforest-farming` shows `rainforest-holocene`) and the caption says "Nearest picture: warm-period".
4. Open sea gets no picture. The card first fetches `/ground/index.json` (once, on first hover). A scene not listed there
   shows no picture and no tag, so a half-generated set is safe.

Animals are deliberately **not** in the pictures (research 0004: models draw them badly and the picture would claim more than the
data does), and neither are people. The caption lists only measured or modelled inputs. The fauna dataset ([fauna](fauna.md)) is not read by the
card yet.

## Prompt template

One template, filled per scene (`groundScenes.json` → `template`, built by `ground_images.build_prompt`; `python3
footstep-generator/ground_images.py prompts` prints all 19):

> A painted landscape illustration seen from the ground at human eye level, wide 16:9 frame. Place: **{place}**. Time: **{time}**.
> **{detail}** Show no people, no animals, no text and no buildings, except what this description names. Soft natural light,
> muted colours, gentle painterly brush texture, not photorealistic.

`{place}` comes from the landscape (e.g. "open arctic tundra: low shrubs, lichen and moss over wet ground…"), `{time}` from the era
("the last Ice Age, colder and drier than today, with a thin pale light"), `{detail}` from the scene (farming scenes name small
fields and a few huts in the distance, herding names a distant tent). Bump `promptVersion` when the template or any text changes.

## Regenerate

```bash
op-scope deep-footsteps -- python3 footstep-generator/ground_images.py generate            # missing scenes only
op-scope deep-footsteps -- python3 footstep-generator/ground_images.py generate --only tundra-glacial --force
python3 footstep-generator/ground_images.py index                                         # rewrite index.json
```

The key is read from the `OPENROUTER_API_KEY` environment variable only and never written anywhere (AGENTS.md "Secrets").
The model is `MODEL` in the script (Gemini 3.1 Flash Lite Image through OpenRouter's chat endpoint with `modalities: ["image","text"]`,
about $0.034 a picture, so a full set is under $1). Each image is centre-cropped to 16:9 and saved as a 480 × 270 WebP (quality 78) in
`footsteps-web/public/ground/`, which is committed; `index.json` there records the model, prompt version, the scenes present and the total
bytes, and its `version` changes whenever the set does so Cloudflare's day cache is bypassed.

**Look at every picture before committing it.** Reject (repaint with `--only … --force`) any with people, animals, text, the wrong biome,
or clothing, bodies or ornament that read as a stereotype.

## Cost to the visitor

Nothing loads until the cursor rests over land (`?hover=0` turns the card off). Then: `index.json` (under 1 KB) once, and one picture of about 15–25 KB the first time
a scene is hovered (browser-cached after). The whole set is about 0.4 MB and is never downloaded at once. `Caddyfile` caches `/ground/*` like the other images.

## Limits

- A picture is a single stock image for a whole landscape class and era, so two distant spots with the same class share it.
- The Ice Age and Holocene split is by date only; the real temperature is in the caption.
- Scenes with no painting fall back to a nearby era; the caption says so.
- The generated images carry the provider's own watermark if any (Gemini adds an invisible SynthID). Provider terms for redistributing
  outputs were not read (research 0004 "Licence loose ends").
