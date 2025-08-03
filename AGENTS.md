# AGENTS.md – Guide for OpenAI Codex & other AI Agents

Welcome 👋  
This file provides **Codex** (and other AI agents) with the context it needs to navigate, understand, and contribute to the **Footsteps of Time** code-base.

## 1 • Project Snapshot

| Key             | Value |
|-----------------|-------|
| **Name**        | Footsteps of Time |
| **Mission**     | Show humanity’s spread from ‑100 000 BCE → today on an interactive globe |
| **Tech Stack**  | • Next.js 14 + TypeScript + deck.gl (3-D globe) ↔<br>• Python 3.11 (Poetry) for data generation |
| **Data**        | HYDE population grids + Reba city database |

## 2 • Repository Topology (high-level)

```
/                # root
│
├── humans-globe/        # Next.js front-end (TypeScript)
│   ├── app/                 # Next 14 app-router pages
│   ├── components/          # React/TSX UI components
│   └── public/              # Static assets (e.g. textures, icons)
│
├── footstep-generator/      # Python package that builds mbtiles & CSV from HYDE grids
│   ├── footstep_generator/  # Source code (PEP 517)
│   └── scripts/             # One-off data utilities
│
├── data/                    # Generated artefacts (large; git-ignored when possible)
│
├── docs/                    # Additional technical docs
│
└── AGENTS.md                # You are here
```

> **AI Agents:** When you need to add or modify code, locate the correct sub-project first (TS/React vs Python) and keep cross-language boundaries clean.

## 3 • Coding Conventions & Style

### TypeScript / React (Next.js)
1. Prefer **functional components** & React hooks.
2. Use **descriptive names**; avoid abbreviations (see user rule #3).
3. Keep UI stateless when possible; lift state up deliberately.
4. CSS lives in `app/globals.css` or component-scoped CSS Modules.
5. Alias imports with `@/` as configured in `tsconfig.json`.
6. Run `npm run lint` before committing.

### Python (footstep-generator)
1. Follow **PEP 8** & **PEP 257** docstrings.
2. Use **type hints** (`from __future__ import annotations`).
3. Keep functions pure; side-effects belong in CLI wrappers.
4. Manage deps with **Poetry**; add any new libs via `poetry add <pkg>`.

### General Rules
- “**Less code is good code**” → remove dead paths, avoid over-engineering.
- **Do not change lines you don’t have to.** Keep diffs minimal.
- Commit messages: `feat:`, `fix:`, `chore:`, `docs:`, `style:`, `refactor:`, `test:`, `perf:`, `ci:`, `build:`, `release:`, `nitpick:` conventional commits.

## 4 • Testing & Validation

| Layer  | Command | Notes |
|--------|---------|-------|
| **Frontend** | `npm run lint` | ESLint + Prettier
| | `npm run dev` | Manual QA in browser; ensure globe loads & slider works
| **Backend / Python** | `poetry run pytest` | Unit tests (add tests alongside modules)

AI Agents should:
1. Create/extend tests when adding non-trivial logic.
2. Pass **all** linters & tests before suggesting merge.

## 5 • Pull-Request Checklist

1. Title & description clearly explain the change.
2. All new code is **documented** & **typed**.
3. No lint or test failures (`npm run lint && poetry run pytest`).
4. Diffs keep unrelated changes out.
5. Screenshots / GIFs attached for UI tweaks.
6. PR reviewers: `@will` (owner) as default.

## 6 • Folder-Specific Notes for AI

- `humans-globe/components/Globe.tsx`  
  Contains `deck.gl` globe with heat shader overlay.  
  Performance >60 fps is critical; batch GPU buffers, avoid per-frame allocations.

- `humans-globe/components/TimeSlider.tsx`  
  Non-linear mapping 100 k yr → present.  
  If you edit, keep thumb drag responsive < 16 ms.

- `footstep-generator/footstep_generator/tiles.py`  
  Handles mbtile creation. Expensive; cache where possible.

## 7 • Interaction Hints for Codex

- **Read before writing**: request outline (`view_file_outline`) of a file to understand context.
- Prefer **atomic commits**: one feature/bug-fix at a time.
- If scope is unclear, **ask for clarification** (user rule #4).

---
Made with ❤️ 2025-08-03
