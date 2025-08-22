---
description: Run full tests and builds (Python + Next.js)
auto_execution_mode: 1
---

- __Objective__
  - Validate generator via pytest, lint/build the frontend, and run basic smoke checks.

- __Install dependencies__
// turbo
```bash
# Python
poetry install --sync
# Frontend
cd footsteps-web && pnpm install && cd ..
```

- __Run Python tests__
// turbo
```bash
cd footstep-generator
poetry run python tests/test_basic.py
poetry run pytest tests/ -q
poetry run python tests/test_integration.py
cd ..
```

- __Frontend lint, build, test__
// turbo
```bash
cd footsteps-web
pnpm lint
pnpm build
pnpm test
cd ..
```

- __Optional: quick API smoke test__
// turbo
```bash
# Ensure tiles exist and dev server is running at :4444 before this step
YEAR=2020
curl -sI "http://localhost:4444/api/tiles/${YEAR}/0/0/0/0.pbf" || true
```

- __CI reference__
  - GitHub Actions workflows: `.github/workflows/ci.yml`, `deploy-data.yml`, `deploy.yml`
  - Data deploy (local): `iac/scripts/deploy-data-local.sh`
