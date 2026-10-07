# I3L project website

Editable static project page for **I3L: Iterative Interactive Imitation Learning for Whole-Body Mobile Manipulation**.

Cloned from https://github.com/i-3l/i-3l.github.io. The interactive additions use
plain JavaScript and CSS. There is no build step or runtime package installation.

## Preview and edit

From this directory, run:

```sh
python3 scripts/serve.py 8765
```

`scripts/serve.py` is a static server with HTTP Range support, so videos can seek and keep
their position when the rollout speed changes. Plain `python3 -m http.server` also works, but
video seeking does not.

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
- `static/videos/rollouts/` — autonomous rollout clips, one per task, each pre-rendered at 1×, 2×, 4×, and 8× (`<task>_<speed>x.mp4`) from the raw 1× footage with the same crop and trim as the I3L video slides, plus a poster frame (`<task>.jpg`); `static/js/rollouts.js` swaps clips when the speed selector changes
- `static/paper.pdf` — drop the compiled paper here (the Paper button links to it)

## Interactive figures

Every figure follows one pattern: **hover, tap, or Tab to part of a figure** to highlight it
and show its details in a tooltip beside the pointer. Specific numbers live in
these tooltips, not in the surrounding text.

- **Plots drawn from data** — intervention trends, whole-body activation shares, and the operator
  study are rendered as SVG from the `chart` entries in `static/js/figure-config.js`. Hovering a
  task, operator, or body part highlights it in every panel; legend entries highlight on hover and
  pin on click. The original PNG stays in the page as the no-JavaScript and print fallback.
- **Photo figures** — the teaser, hardware, tasks, and task-stage figures outline the hovered region with an orange border (the rest of the image is not dimmed), using hotspots from
  the `hotspots` arrays. Each entry is
  `["Title", [left, top, width, height], "Short note shown in the tooltip."]`, with bounds in
  normalized image coordinates (0–1).
- **Follow a task** — the tasks figure and the task-stage figure outline a task on hover (no
  tooltip). Clicking one (or a task in the intervention-trend legend) highlights that task across
  the page: both figures, its rollout clip, its table and explorer rows, its trend line, and its
  body-part bar. A "Following …" bar at the bottom clears it (or press Escape). These figures use
  `tasks: [[name, bounds], ...]` in `figure-config.js`; names must match the task names used in
  the tables and charts.
- **Tables** — the success and strategy tables also render as bar explorers with value tooltips;
  the published tables stay available under "View published table".

Data sources: trend values were extracted from the vector paths of the paper figure
(`intervention_trends_horizontal.pdf`) and match the published 63.4% / 69.5% / 72.0% reductions;
operator-study values are computed from `figures/operator-study/source-data.json` in the paper repo;
activation shares are the printed labels of Fig. 6.

## Change figures or data

Replace images under `static/images/`, or update their paths in `index.html`.
Images with `teaser-image` or `method-image` receive spotlight regions (or an SVG
chart) from `figure-config.js`. Customize their titles, hotspot bounds, and notes
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

Intervention-trend and operator-study values live in the `chart` entries of
`figure-config.js` (sources listed under *Interactive figures*). The task-stage
curves (`correction.png`) have no source data in the repository, so that figure
uses spotlight regions only; no values have been estimated from pixels.

## Browser checks

The optional tests cover hover/focus tooltips and highlighting, figures staying inline,
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
