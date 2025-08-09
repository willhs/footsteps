# Repository Guidelines

Concise rules for contributing to Footsteps of Time. Keep diffs minimal, performance high, and tests green.

## Project Structure & Module Organization
- `humans-globe/`: Next.js + TypeScript front-end.
  - `app/`: routes, `globals.css` and layout.
  - `components/`: React components (e.g., `FootstepsViz.tsx`, `TimeSlider.tsx`).
  - `public/`: static assets.
- `footstep-generator/`: Python data pipeline scripts and tests.
  - `tests/`: pytest suites (`test_*.py`).
- `data/`: generated artifacts (large, usually git-ignored).
- `docs/`, `screenshots/`: supplementary docs and UI references.

## Build, Test, and Development Commands
- Frontend dev: `cd humans-globe && pnpm i && pnpm dev` (starts Next on port 4444).
- Frontend build: `pnpm build && pnpm start` (production build/serve).
- Frontend lint/format: `pnpm lint` • `pnpm format`.
- Frontend tests: `pnpm test` (Jest + Testing Library).
- Python setup: from repo root, `poetry install`.
- Python tests: `poetry run pytest footstep-generator`.

## Coding Style & Naming Conventions
- TypeScript: strict mode, functional components, React hooks; imports via `@/` alias; Tailwind in `globals.css` where appropriate.
- Python: PEP 8/257, type hints, pure functions; formatting via Black/Isort; mypy for typing.
- Names: descriptive, no abbreviations; files `PascalCase.tsx` for React components, `snake_case.py` for Python modules.

## Testing Guidelines
- Frontend: co-locate `*.test.tsx` near components; test interactions and rendering; avoid snapshot churn.
- Python: place `test_*.py` in `footstep-generator/tests`; test pure functions and data transforms.
- Add tests for all non-trivial logic; prefer fast, deterministic tests.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `perf:`, `chore:`). Small, focused changes.
- PRs: clear description, motivation, and scope; link issues; attach screenshots/GIFs for UI; ensure `pnpm lint && pnpm test` and `poetry run pytest` pass.

## Notes for Performance-Critical Code
- `humans-globe/components/FootstepsViz.tsx`: keep >60 fps; batch GPU buffers, avoid per-frame allocations.
- `humans-globe/components/TimeSlider.tsx`: maintain <16 ms drag latency; no heavy work in render/handlers.
