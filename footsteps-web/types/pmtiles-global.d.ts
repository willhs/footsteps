import type { SharedPromiseCache } from 'pmtiles';

declare global {
  namespace NodeJS {
    interface Global {
      __pmtilesApiCache?: SharedPromiseCache;
    }
  }
}

export {};
