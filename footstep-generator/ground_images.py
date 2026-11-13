"""Paint the hover card's ground-view pictures (docs/ops/ground-view.md).

One small WebP per scene in footsteps-web/lib/groundScenes.json (landscape x era), made once with an
image model and committed under footsteps-web/public/ground/. Nothing is generated while the app runs.
Every picture is IMAGINED (docs/philosophy/vision.md); index.json records the model and prompt version.

    op-scope deep-footsteps -- python3 footstep-generator/ground_images.py generate [--only ID ...] [--force]
    python3 footstep-generator/ground_images.py prompts          # print every prompt, no key needed
    python3 footstep-generator/ground_images.py index            # rewrite index.json from the files present

The key comes from the OPENROUTER_API_KEY environment variable only (AGENTS.md "Secrets"): never pass
it as an argument, and nothing here writes it anywhere.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCENES_JSON = ROOT / "footsteps-web" / "lib" / "groundScenes.json"
OUT_DIR = ROOT / "footsteps-web" / "public" / "ground"

#: Cheapest model in the research 0004 comparison that gives a usable 16:9 landscape (about $0.034 a picture).
MODEL = "google/gemini-3.1-flash-lite-image"
ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
WIDTH, HEIGHT = 480, 270  # shown at 208 x 117 CSS px in the card, so 2x
WEBP_QUALITY = 78


def load_scenes() -> dict:
    return json.loads(SCENES_JSON.read_text())


def scene_id(scene: dict) -> str:
    return f"{scene['landscape']}-{scene['era']}"


def build_prompt(scenes: dict, scene: dict) -> str:
    """The template in groundScenes.json filled for one scene. The only place a prompt is made."""
    return scenes["template"].format(
        place=scenes["landscapes"][scene["landscape"]]["place"],
        time=scenes["eras"][scene["era"]]["time"],
        detail=scene["detail"],
    )


def extract_image(response: dict) -> bytes:
    """The first image of an OpenRouter chat completion (a base64 data URL), as bytes."""
    try:
        url = response["choices"][0]["message"]["images"][0]["image_url"]["url"]
    except (KeyError, IndexError, TypeError) as e:
        raise ValueError(f"no image in response: {str(response)[:300]}") from e
    if not url.startswith("data:image/") or ";base64," not in url:
        raise ValueError("image is not a base64 data URL")
    return base64.b64decode(url.split(";base64,", 1)[1])


def to_webp(raw: bytes) -> bytes:
    """Crop to 16:9 from the centre, resize to the card's 2x size, encode."""
    from PIL import Image

    img = Image.open(io.BytesIO(raw)).convert("RGB")
    w, h = img.size
    target = WIDTH / HEIGHT
    if w / h > target:
        box_w = round(h * target)
        left = (w - box_w) // 2
        img = img.crop((left, 0, left + box_w, h))
    else:
        box_h = round(w / target)
        top = (h - box_h) // 2
        img = img.crop((0, top, w, top + box_h))
    img = img.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    img.save(out, "WEBP", quality=WEBP_QUALITY, method=6)
    return out.getvalue()


def request_image(key: str, prompt: str) -> bytes:
    import requests

    r = requests.post(
        ENDPOINT,
        headers={"Authorization": f"Bearer {key}"},
        json={
            "model": MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "modalities": ["image", "text"],
            "image_config": {"aspect_ratio": "16:9"},
        },
        timeout=180,
    )
    r.raise_for_status()
    return extract_image(r.json())


def write_index(scenes: dict, out_dir: Path = OUT_DIR) -> dict:
    """index.json lists the pictures that exist, for the card, with where they came from. `version`
    changes whenever the set of files does, so cached copies are not reused after a regeneration."""
    present = sorted(scene_id(s) for s in scenes["scenes"] if (out_dir / f"{scene_id(s)}.webp").exists())
    previous = json.loads((out_dir / "index.json").read_text()) if (out_dir / "index.json").exists() else {}
    version = previous.get("version", 0) + (1 if previous.get("scenes") != present else 0)
    index = {
        "version": max(version, 1),
        "kind": "imagined",
        "model": MODEL,
        "promptVersion": scenes["promptVersion"],
        "scenes": present,
        "bytes": sum((out_dir / f"{i}.webp").stat().st_size for i in present),
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "index.json").write_text(json.dumps(index, indent=1) + "\n")
    return index


def generate(only: list[str], force: bool) -> int:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        print(
            "OPENROUTER_API_KEY is not set. Run under: op-scope deep-footsteps -- python3 "
            "footstep-generator/ground_images.py generate",
            file=sys.stderr,
        )
        return 2
    scenes = load_scenes()
    chosen = [s for s in scenes["scenes"] if not only or scene_id(s) in only]
    unknown = set(only) - {scene_id(s) for s in scenes["scenes"]}
    if unknown:
        print(f"unknown scene ids: {sorted(unknown)}", file=sys.stderr)
        return 2
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    failed = 0
    for scene in chosen:
        sid = scene_id(scene)
        path = OUT_DIR / f"{sid}.webp"
        if path.exists() and not force:
            print(f"skip {sid} (exists; --force to repaint)")
            continue
        try:
            data = to_webp(request_image(key, build_prompt(scenes, scene)))
        except Exception as e:  # keep going: one bad picture should not lose the rest
            failed += 1
            print(f"FAIL {sid}: {type(e).__name__}: {str(e)[:200]}", file=sys.stderr)
            continue
        path.write_bytes(data)
        print(f"ok   {sid} {len(data) / 1024:.0f} KB")
        time.sleep(0.5)
    index = write_index(scenes)
    print(f"{len(index['scenes'])}/{len(scenes['scenes'])} pictures, {index['bytes'] / 1024:.0f} KB total")
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("generate", help="paint missing pictures (needs OPENROUTER_API_KEY in the environment)")
    g.add_argument("--only", nargs="*", default=[], metavar="ID", help="scene ids, e.g. tundra-glacial")
    g.add_argument("--force", action="store_true", help="repaint pictures that already exist")
    sub.add_parser("prompts", help="print every prompt")
    sub.add_parser("index", help="rewrite index.json from the files present")
    args = ap.parse_args(argv)
    if args.cmd == "generate":
        return generate(args.only, args.force)
    scenes = load_scenes()
    if args.cmd == "prompts":
        for s in scenes["scenes"]:
            print(f"{scene_id(s)}\n  {build_prompt(scenes, s)}\n")
        return 0
    index = write_index(scenes)
    print(f"{len(index['scenes'])} pictures listed (version {index['version']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
