import { defineConfig, devices } from '@playwright/test';

// E2E config: runs Next dev server on port 4444
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:4545',
    trace: 'retain-on-failure',
  },
  // Run locally; CI can adjust workers
  retries: 0,
  fullyParallel: false,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm exec next dev -p 4545',
    port: 4545,
    timeout: 120_000,
    reuseExistingServer: true,
    env: {
      // Serve PMTiles via Next public/pmtiles or route interception
      NEXT_PUBLIC_PMTILES_BASE: process.env.NEXT_PUBLIC_PMTILES_BASE || 'http://localhost:4545/pmtiles',
      HUMANS_TILES_DIR: process.env.HUMANS_TILES_DIR || '',
      NEXT_PUBLIC_DISABLE_BASEMAP: 'true',
      // Ensure SW stays disabled during tests to allow browser disk cache
      NEXT_PUBLIC_SW_ENABLE: 'false',
    },
  },
});
