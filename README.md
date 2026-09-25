# I3L project website

Editable static project page for **I3L: Iterative Interactive Imitation Learning for Whole-Body Mobile Manipulation**.

Cloned from https://github.com/i-3l/i-3l.github.io. The interactive additions use
plain JavaScript and CSS. There is no build step or runtime package installation.

## Preview and edit

From this directory, run:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://localhost:8765. Edit a file and refresh the browser to see changes.
This serves your local copy; publishing changes to GitHub Pages is a separate step.

- `index.html` — the page
- `static/css/index.css` — site styles (Bulma + custom)
- `static/css/interactive-figures.css` — component explanation and chart styles
- `static/js/figure-config.js` — figure titles, component explanations, and activation data
- `static/js/interactive-figures.js` — inline component explanations and charts
- `static/css/hardware-viewer.css` — hardware section and responsive 3D viewer
- `static/js/hardware-viewer.js` — lazy loading and startup fallback
- `static/js/hardware-scene.js` — 3D rendering, joint articulation, and camera controls
- `static/models/` — self-contained GLB models exported from the repository CAD
- `static/images/` — figures exported from the paper
- `static/videos/walkthrough.mp4` — walkthrough video (poster frame: `static/images/video_poster.jpg`)
- `static/paper.pdf` — drop the compiled paper here (the Paper button links to it)

## Component explanations

All seven figures have numbered component hotspots. **Hover, click, tap, or use
Tab to focus a component** to show its explanation directly below the figure.
The explanation stays visible until you select another component, so it is easy
to read. Each information card links to the corresponding figure in the paper.
Figures stay inline when clicked; there is no enlarged popup viewer.

The annotations cover the correction/retraining loop, leader arms and touch
detection, each evaluation task, intervention metrics, task-stage failure modes,
whole-body activation shares, and the three operators. Descriptions use the
existing paper, captions, and published results; they do not invent curve values.

To edit the explanations, change the `hotspots` array for an image in
`static/js/figure-config.js`. Each entry is:

```js
["Component title", [left, top, width, height], "Explanation shown on hover or click."]
```

The bounds use normalized image coordinates (0–1). A `source: [figure, page]`
entry controls the paper link. You can modify text or move a component region
without changing the interaction code.

## Additional interactions

- **Success and learning-strategy results:** filter tasks, toggle comparisons,
  and hover, tap, or focus a bar for its published value. CSV downloads contain all
  comparison columns for the selected task group, including hidden comparisons.
  The source tables remain available under “View published table”.
- **Whole-body activation figure:** expand “Explore activation values” for the
  corresponding comparisons and CSV download.

Original images and tables remain readable with JavaScript disabled. Printing
shows the original figures and published tables.

## Change figures or data

Replace images under `static/images/`, or update their paths in `index.html`.
Images with `teaser-image` or `method-image` receive inline component explanations
from `figure-config.js`. Customize their titles, hotspot bounds, and descriptions
there. Bounds are `[left, top, width, height]`, normalized to the original image
dimensions, with all coordinates between 0 and 1.

The success and strategy charts read their values directly from `#success-results`
and `#strategy-results` in `index.html`. **Edit those tables to update the charts.**
Preserve the group-row class and the table structure. Success cells may contain
percentages or counts with percentages, such as `23/25 (92%)`; strategy cells
contain numeric percentages. An invalid numeric cell leaves that original table
visible instead of creating a misleading chart.

Body-part activation values in `figure-config.js` are transcribed from the printed
labels in `static/images/whole_body_takeover.png` (paper Figure 6). The absent
popcorn torso segment is zero. Published rounding is preserved, including totals
of 99.9%.

The repository contains raster exports, **not the underlying numeric series**,
for intervention trends, task-stage curves, and the operator study. Those figures
provide inline component explanations. Exact point tooltips or per-series
filtering for those curves require the original plotting data; no values have
been estimated from pixels.

## Browser checks

The optional tests cover component hover/click/focus, figures staying inline,
task/series filters, published values, CSV export, mobile layout, printing, and
the no-JavaScript fallback. They start their own temporary server and block
external requests.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/playwright install chromium
.venv/bin/python -m unittest discover -s tests -v
```

To use an existing Chrome installation instead of downloading Chromium:

```sh
I3L_CHROME=/usr/bin/google-chrome .venv/bin/python -m unittest discover -s tests -v
```

## Interactive hardware

The **Explore hardware** link goes to `#hardware`. The viewer loads the R1 Pro
leaders as the section approaches the viewport; Franka loads only when selected.
R1 Pro shows a **bimanual pair with 14 independent joints**. Use Left arm / Right
arm to choose which seven joints to adjust; both arms remain visible and retain
their poses. Franka shows one seven-joint leader.
Drag to orbit, right-drag to pan, and scroll or pinch to zoom. Camera buttons and
keyboard controls provide alternatives: focus the canvas and use arrow keys to
orbit, +/− to zoom, and 0/Home to fit. The seven labeled sliders move joints within
the source URDF limits. Reset pose restores both arms' illustrated starting poses and
camera. Auto-rotate is opt-in and pauses offscreen, in background tabs, and while
printing. Nothing animates automatically, including with reduced motion enabled.

The original hardware figure remains available if JavaScript or WebGL is
unavailable. A failed model load can be retried; a failed configuration switch
keeps the current model. Printing uses the original hardware figure.

The assets come from the sibling I3L repository:

- `assets/gello_r1pro_urdf/robot_7dof.urdf` and its referenced STL meshes
- `assets/gello_franka_urdf/robot.urdf` and its referenced STL meshes

Exports retain visual colors, link transforms, joint axes, and joint limits.
Positions use 16-bit quantization per mesh and normals use signed 8-bit
quantization; all source triangles are retained. Meshopt compression reduces the
downloads to about 4.6 MB (R1 Pro) and 2.2 MB (Franka). The files use standard
`KHR_mesh_quantization` and `EXT_meshopt_compression` glTF extensions. Joint
metadata is stored in node `extras.joint`. Collision/inertial geometry is omitted;
the viewer is an illustration, not a physics or collision simulator. The R1 Pro
starting pose bends joints 2 and 4. Franka starts in an upright home preset with
a horizontal forearm and downward grip, and Reset pose returns to that preset.
Its CAD-relative joint angles are `[0, 64.288, 60.965, 125.495, -25.481, -94.564, -45]`
degrees; these include the exported assembly offsets and are not robot motor
commands. The display rotation maps the Franka source model's +X-up axis onto
the viewer's +Y-up axis.

For R1 Pro, the viewer clones the left-leader assembly and reflects it across
the display's sagittal plane to form the right leader, matching the bilateral
setup described in `iiil/configs/gello/gello_r1pro.yaml`. The two hierarchies share
mesh buffers but have independent joint transforms. The 0.24 m mount spacing
and connecting bar are illustrative, not calibrated assembly dimensions. Model
downloads remain the original individual leader exports.

To regenerate from updated CAD, run from this website directory:

```sh
python3 scripts/export_hardware.py ../FrankaTrain/I3L/assets
node scripts/compress_hardware.mjs
```

The first command needs Python 3.9+ (standard library only); the second needs
Node 18+. Neither is needed to serve the website. The exporter records source
and output SHA-256 hashes in `static/models/sources.json`; compression updates the
output hashes. Both generation scripts and the encoder are checked in.

The runtime uses local, pinned copies of Three.js 0.180.0 and meshoptimizer 0.24.0,
with licenses and provenance under `static/js/vendor/`. It makes no external
requests for models, decoders, or renderer code. The hardware browser tests load
the real models and check lazy loading, articulation, limits, reset, switching,
downloads, camera controls, mobile touch, printing, retry, and no-JS/no-WebGL
fallbacks. Headless hardware tests enable Chromium's software WebGL renderer.

## Private website measurement

`static/js/analytics.js` records page loads and deliberate figure, chart, link,
download and hardware interactions through the site's Cloudflare collector.
Passive observations include section reach, scroll depth, approximate active time,
model load time and viewer errors. The dashboard and database are private.

No cookies or persistent browser identifiers are used. Five reloads count as five
pageviews and an estimated single visitor within the same UTC day. Multi-day
visitor estimates are visitor-days. Location is approximate, and blockers, bots
and network failures affect coverage. Do Not Track, Global Privacy Control and
`?analytics=off` disable tracking.

Clear the analytics script's `data-endpoint` in `index.html` to disable collection.
Keep account credentials, dashboard configuration, and raw data out of this public
repository. Collector failure must never prevent the page or viewer from working.
