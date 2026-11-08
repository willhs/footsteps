// Available target years from HYDE 3.5 data (one PMTiles archive per year).
// 30 time periods, 10,000 BCE to 1900 CE. Post-1900 HYDE years are not yet in the
// raw data copy (NAS: /volume2/deep-footsteps/data/raw/hyde-3.5).
export const TARGET_YEARS = [
  // Deep Prehistory - Every millennium
  -10000, -9000, -8000, -7000, -6000, -5000, -4000, -3000, -2000, -1000,

  // Classical Period - Complete coverage every century
  0, 100, 200, 300, 400, 500, 600, 700, 800, 900,

  // Medieval to modern - every century to 1900 CE
  1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900,
];

