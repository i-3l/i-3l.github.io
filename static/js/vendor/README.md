# Hardware viewer dependencies

These files are served locally, with no runtime CDN dependency or build step.

- **Three.js 0.180.0** (MIT): https://github.com/mrdoob/three.js/tree/r180
  - `three/three.module.min.js` and `three/three.core.min.js`: package `build/`
  - `three/OrbitControls.js`: `examples/jsm/controls/OrbitControls.js`
  - `three/GLTFLoader.js`: `examples/jsm/loaders/GLTFLoader.js`
  - `three/BufferGeometryUtils.js`: `examples/jsm/utils/BufferGeometryUtils.js`
  - License: `three/LICENSE`
  - Addon imports of `three` and `../utils/BufferGeometryUtils.js` have been changed
    to local relative paths. No other source modifications.
- **meshoptimizer 0.24.0** (MIT): https://github.com/zeux/meshoptimizer/tree/v0.24
  - `meshopt/meshopt_decoder.module.js`: package file of the same name, unmodified
  - License: `meshopt/LICENSE.md`
  - The matching encoder is in `scripts/vendor/` with its license. The extension
    is `.mjs` so Node 18+ recognizes it as an ES module; its contents are unchanged.
    It is only used to generate assets and is never loaded by the website.

Files were retrieved from the version-pinned npm packages through jsDelivr:
`https://cdn.jsdelivr.net/npm/three@0.180.0/` and
`https://cdn.jsdelivr.net/npm/meshoptimizer@0.24.0/`.
