import runpy
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    script = repo_root / "footstep-generator" / "verify_tiles.py"
    if not script.exists():
        raise SystemExit(f"verify_tiles.py not found at {script}")
    runpy.run_path(str(script), run_name="__main__")


if __name__ == "__main__":
    main()

