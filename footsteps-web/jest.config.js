const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js', '@testing-library/jest-dom'],
  // Prevent Playwright e2e tests from being picked up by Jest
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
};

// pixelmatch (used by scripts/visual-lib.mjs, pinned in lib/visualRegression.test.ts) ships ES modules only: let Jest transform it.
// next/jest keeps its own list of packages it still transforms (geist), so that list is widened after it is built.
module.exports = async () => {
  const config = await createJestConfig(customJestConfig)();
  config.transformIgnorePatterns = config.transformIgnorePatterns.map((p) => p.replace('(geist)', '(geist|pixelmatch)'));
  return config;
};
