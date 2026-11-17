// @deck.gl/layers' CJS build does `__toESM(require('@mapbox/tiny-sdf'), 1)` and then `.default`: in node
// mode that is the whole ESM namespace, not the TinySDF class, so TextLayer throws "not a constructor".
// next.config.js points '@mapbox/tiny-sdf' here; this hands back the class itself.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a CJS shim must require()
module.exports = require('tiny-sdf-esm').default;
