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
- `static/css/interactive-figures.css` — figure viewer and chart styles
- `static/js/figure-config.js` — figure titles, focused panels, and activation data
- `static/js/interactive-figures.js` — viewer, touch/keyboard controls, and charts
- `static/css/hardware-viewer.css` — hardware section and responsive 3D viewer
- `static/js/hardware-viewer.js` — lazy loading and startup fallback
- `static/js/hardware-scene.js` — 3D rendering, joint articulation, and camera controls
- `static/models/` — self-contained GLB models exported from the repository CAD
- `static/images/` — figures exported from the paper
- `static/videos/` — put the walkthrough / teaser video here
- `static/paper.pdf` — drop the compiled paper here (the Paper button links to it)

## Component explanations

All seven figures have numbered component hotspots. **Hover, click, tap, or use
Tab to focus a component** to show its explanation directly below the figure.
The explanation stays visible until you select another component, so it is easy
to read. Each information card links to the corresponding figure in the paper.
The same components remain interactive when a figure is enlarged.

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

- **All seven figures:** use Explore to expand a figure. Choose a Focus panel and
  Explore to inspect a task, hardware section, or subplot. Use the mouse wheel,
  pinch gesture, or +/− buttons to zoom; drag or use arrow keys to pan. Fit (or 0)
  resets the current panel. Escape closes the viewer and restores keyboard focus.
  Previous/Next traverses the figures; Download original saves the complete image.
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
Images with `teaser-image` or `method-image` are automatically expandable.
Add entries to `figure-config.js` to customize their titles and Focus panels.
Panel bounds are `[left, top, width, height]`, normalized to the original image
dimensions, with all coordinates between 0 and 1. Cropping happens only in the
viewer; image files stay intact.

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
support panel selection, zoom, pan, and original-image download. Exact point
tooltips or per-series filtering for those curves require the original plotting
data; no values have been estimated from pixels.

## Browser checks

The optional tests cover component hover/click/focus, all figures, keyboard focus, zoom/pan, touch pinch,
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
leader as the section approaches the viewport; Franka loads only when selected.
Each model is a **single leader assembly**, not a complete robot or bimanual rig.
Drag to orbit, right-drag to pan, and scroll or pinch to zoom. Camera buttons and
keyboard controls provide alternatives: focus the canvas and use arrow keys to
orbit, +/− to zoom, and 0/Home to fit. The seven labeled sliders move joints within
the source URDF limits. Reset pose restores the illustrated starting pose and
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
starting pose bends joints 2 and 4; Franka starts at zero joint angles, with its
display orientation flipped to put the mount below the arm.

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
