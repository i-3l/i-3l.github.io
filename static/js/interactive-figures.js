/* Progressive enhancement: the original figures and tables work without JavaScript.
 * No runtime libraries, build step, or network requests are needed for interactions.
 *
 * Every figure follows one pattern: hovering, focusing, or tapping part of it highlights that part
 * (dimming the rest) and shows its details in a tooltip next to the pointer.
 */
(() => {
  "use strict";

  const config = window.I3L_FIGURES || {};
  const SVG_NS = "http://www.w3.org/2000/svg";
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const svg = (tag, attrs = {}, parent) => {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    if (parent) parent.append(element);
    return element;
  };
  const button = (text, action, className) => {
    const element = make("button", className, text);
    element.type = "button";
    element.addEventListener("click", action);
    return element;
  };
  // Round half up on the decimal value (toFixed alone turns 0.485 into "0.48").
  const format = (value, digits = 1) => (Math.round(Number(value) * 10 ** digits + 1e-9) / 10 ** digits).toFixed(digits);

  /* ---------- Shared tooltip ---------- */

  const tip = make("div", "viz-tip");
  tip.id = "viz-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  const tipTitle = make("strong", "viz-tip-title");
  const tipBody = make("span", "viz-tip-body");
  tip.append(tipTitle, tipBody);
  document.body.append(tip);
  let tipOwner = null;

  function placeTip(x, y) {
    const pad = 12;
    const { width, height } = tip.getBoundingClientRect();
    let left = x + pad;
    let top = y - height - pad;
    if (left + width > window.innerWidth - 8) left = Math.max(8, x - width - pad);
    if (top < 8) top = y + pad + 8;
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
  function showTip(owner, title, body, x, y) {
    tipOwner = owner;
    tipTitle.textContent = title;
    tipBody.textContent = body || "";
    tipBody.hidden = !body;
    tip.hidden = false;
    placeTip(x, y);
  }
  function hideTip(owner) {
    if (owner && owner !== tipOwner) return;
    tip.hidden = true;
    tipOwner = null;
  }

  /* Wires one element to the tooltip and to a highlight callback (no tooltip when title is null).
   * Touch: a tap shows the tooltip until the next tap elsewhere. */
  let activeClear = null;
  function interact(element, { title, body, activate, deactivate }) {
    const show = (x, y) => {
      if (activeClear && activeClear !== clear) activeClear();
      activeClear = clear;
      activate?.();
      if (title != null) showTip(element, title, body, x, y);
    };
    function clear() {
      if (activeClear === clear) activeClear = null;
      deactivate?.();
      hideTip(element);
    }
    element.addEventListener("pointerenter", event => show(event.clientX, event.clientY));
    element.addEventListener("pointermove", event => {
      if (event.pointerType !== "touch" && tipOwner === element) placeTip(event.clientX, event.clientY);
    });
    element.addEventListener("pointerleave", event => { if (event.pointerType !== "touch") clear(); });
    element.addEventListener("focus", () => {
      const box = element.getBoundingClientRect();
      show(box.left + box.width / 2, box.top);
    });
    element.addEventListener("blur", clear);
    element.addEventListener("click", event => {
      if (event.pointerType === "touch" || event.detail === 0) return;
      show(event.clientX, event.clientY);
    });
    if (title != null) element.setAttribute("aria-describedby", tip.id);
  }
  document.addEventListener("pointerdown", event => {
    if (!event.target.closest?.("[aria-describedby='viz-tip']")) activeClear?.();
  });
  window.addEventListener("scroll", () => { if (!tip.hidden && !tipOwner?.matches(":hover, :focus")) activeClear?.(); }, { passive: true });

  /* Dims every [data-key] mark except those matching `key`; null falls back to the pinned legend entry. */
  function highlight(root, key) {
    key = key ?? root.pinnedKey ?? null;
    root.classList.toggle("has-focus", key != null);
    root.querySelectorAll("[data-key]").forEach(element => {
      const match = element.dataset.key === key;
      element.classList.toggle("is-focus", key != null && match);
      element.classList.toggle("is-dim", key != null && !match);
    });
  }

  /* ---------- Follow one task across the page ---------- */
  // Clicking a task (task figures or trend legend) selects it. Every element tagged with data-task
  // for that task gets .is-task-selected; containers marked data-task-scope get .has-task-match.

  let selectedTask = null;
  const taskListeners = [];
  const onTaskChange = listener => taskListeners.push(listener);
  const tagTask = (element, name) => {
    element.dataset.task = name;
    element.classList.toggle("is-task-selected", name === selectedTask);
  };
  const followBar = make("div", "task-follow");
  followBar.setAttribute("role", "status");
  followBar.hidden = true;
  const followName = make("strong", "task-follow-name");
  followBar.append(make("span", "", "Following "), followName, button("Clear", () => selectTask(null), "task-follow-clear"));
  document.body.append(followBar);

  /* Selects `name`, or clears the selection when it is null or already selected. */
  function selectTask(name) {
    selectedTask = name && name !== selectedTask ? name : null;
    document.body.classList.toggle("has-task-selection", Boolean(selectedTask));
    document.querySelectorAll("[data-task]").forEach(element => {
      element.classList.toggle("is-task-selected", element.dataset.task === selectedTask);
      if (element.classList.contains("task-region")) element.setAttribute("aria-pressed", String(element.dataset.task === selectedTask));
    });
    document.querySelectorAll("[data-task-scope]").forEach(scope => {
      scope.classList.toggle("has-task-match", Boolean(scope.querySelector(".is-task-selected")));
    });
    followName.textContent = selectedTask || "";
    followBar.hidden = !selectedTask;
    taskListeners.forEach(listener => listener(selectedTask));
  }
  document.addEventListener("keydown", event => { if (event.key === "Escape" && selectedTask) selectTask(null); });

  /* Legend buttons highlight a series on hover/focus; clicking pins it (or selects its task page-wide). */
  function createLegend(root, entries) {
    const legend = make("div", "viz-legend");
    legend.setAttribute("role", "group");
    legend.setAttribute("aria-label", "Highlight a series");
    root.syncLegend = () => legend.querySelectorAll("button").forEach(other => other.setAttribute("aria-pressed", String(other.dataset.key === root.pinnedKey)));
    entries.forEach(({ key, name, color, line, summary, task }) => {
      const item = button("", () => {
        if (task) return selectTask(task);
        root.pinnedKey = root.pinnedKey === key ? null : key;
        root.syncLegend();
        highlight(root, null);
      }, "viz-legend-item");
      item.dataset.key = key;
      item.setAttribute("aria-pressed", "false");
      item.setAttribute("aria-label", summary ? `Highlight ${name}. ${summary}` : `Highlight ${name}`);
      const swatch = make("span", line ? "viz-swatch is-line" : "viz-swatch");
      swatch.style.setProperty("--series-color", color);
      item.append(swatch, make("span", "", name));
      item.addEventListener("pointerenter", () => highlight(root, key));
      item.addEventListener("focus", () => highlight(root, key));
      item.addEventListener("pointerleave", () => highlight(root, null));
      item.addEventListener("blur", () => highlight(root, null));
      legend.append(item);
    });
    return legend;
  }

  /* ---------- Image figures: outlined hotspots ---------- */

  function createHotspots(canvas, figure) {
    const isTaskFigure = Boolean(figure.tasks);
    const layer = make("div", "hotspot-layer");
    layer.setAttribute("role", "group");
    layer.setAttribute("aria-label", isTaskFigure ? `Tasks in ${figure.title}: select one to highlight it across the page` : `Parts of ${figure.title}`);
    (figure.tasks || figure.hotspots).forEach(([title, bounds, note]) => {
      const region = make("button", isTaskFigure ? "hotspot-region task-region" : "hotspot-region");
      region.type = "button";
      region.setAttribute("aria-label", title);
      if (isTaskFigure) {
        tagTask(region, title);
        region.setAttribute("aria-pressed", "false");
        region.addEventListener("click", () => selectTask(title));
      }
      region.style.left = `${bounds[0] * 100}%`;
      region.style.top = `${bounds[1] * 100}%`;
      region.style.width = `${bounds[2] * 100}%`;
      region.style.height = `${bounds[3] * 100}%`;
      interact(region, {
        title: isTaskFigure ? null : title, body: note,
        activate: () => {
          layer.querySelectorAll(".is-active").forEach(other => other.classList.remove("is-active"));
          region.classList.add("is-active");
          canvas.classList.add("is-spotlit", "was-explored");
        },
        deactivate: () => {
          region.classList.remove("is-active");
          if (!layer.querySelector(".is-active")) canvas.classList.remove("is-spotlit");
        }
      });
      layer.append(region);
    });
    const touch = matchMedia("(hover: none)").matches;
    const hint = make("span", "figure-hint-badge",
      isTaskFigure ? `${touch ? "Tap" : "Click"} a task to follow it` : `${touch ? "Tap" : "Hover"} to explore`);
    if (isTaskFigure) canvas.dataset.taskScope = "";
    hint.setAttribute("aria-hidden", "true");
    canvas.append(layer, hint);
  }

  /* ---------- Charts drawn from data ---------- */

  function panelFrame(width, height, margin, panel, categories) {
    const plot = svg("svg", { viewBox: `0 0 ${width} ${height}`, class: "viz-svg", role: "presentation" });
    const min = panel.min ?? 0;
    const band = (width - margin.l - margin.r) / categories.length;
    const x = index => margin.l + (index + 0.5) * band;
    const y = value => margin.t + (1 - (value - min) / (panel.max - min)) * (height - margin.t - margin.b);
    const grid = svg("g", { class: "viz-grid" }, plot);
    panel.ticks.forEach(tick => {
      svg("line", { x1: margin.l, x2: width - margin.r, y1: y(tick), y2: y(tick) }, grid);
      svg("text", { x: margin.l - 6, y: y(tick), class: "viz-tick", "text-anchor": "end", "dominant-baseline": "middle" }, grid)
        .textContent = tick;
    });
    svg("line", { x1: margin.l, x2: margin.l, y1: margin.t, y2: height - margin.b, class: "viz-axis" }, grid);
    categories.forEach((label, index) => {
      svg("text", { x: x(index), y: height - margin.b + 15, class: "viz-tick", "text-anchor": "middle" }, grid).textContent = label;
    });
    return { plot, x, y, band };
  }

  function panelShell(panel) {
    const shell = make("figure", "viz-panel");
    shell.append(make("figcaption", "viz-panel-title", panel.title));
    if (panel.axis) shell.append(make("p", "viz-panel-axis", panel.axis));
    return shell;
  }

  function trendsChart(chart) {
    const root = make("div", "viz viz-trends");
    const panels = make("div", "viz-panels");
    root.append(panels);
    const width = 240, height = 196, margin = { l: 34, r: 6, t: 8, b: 22 };
    const rounds = ["R1", "R2", "R3", "R4"];
    const tasks = chart.panels[0].series;
    const reading = (panel, value) => `${format(value, panel.digits)}${panel.suffix || ""} ${panel.unit}`;

    chart.panels.forEach(panel => {
      const categories = panel.bars ? [...rounds, "Final"] : rounds;
      const shell = panelShell(panel);
      const { plot, x, y, band } = panelFrame(width, height, margin, panel, categories);
      const unitFor = index => (index === 4 ? panel.finalUnit : panel.unit);
      // Success rates are whole percentages except seed averages, so drop a trailing ".0" in (d).
      const valueText = (value, index) => `${format(value, panel.digits).replace(panel.bars ? /\.0$/ : /$^/, "")}${panel.suffix || ""} ${unitFor(index)}`;

      if (panel.bars) {
        svg("rect", { x: x(4) - band / 2, y: margin.t, width: band, height: height - margin.t - margin.b, class: "viz-final-band" }, plot);
        panel.mean.forEach((value, index) => {
          const bar = svg("rect", {
            x: x(index) - band * 0.31, width: band * 0.62, y: y(value), height: y(0) - y(value),
            class: index === 4 ? "viz-bar is-final" : "viz-bar", tabindex: 0, role: "img",
            "aria-label": `Task mean · ${categories[index]}: ${valueText(value, index)}`
          }, plot);
          bar.dataset.key = "mean";
          interact(bar, {
            title: `Task mean · ${categories[index]}`, body: valueText(value, index),
            activate: () => highlight(root, "mean"), deactivate: () => highlight(root, null)
          });
        });
        const base = panel.baseline;
        const line = svg("g", { class: "viz-baseline", tabindex: 0, role: "img", "aria-label": `${base.label} baseline: ${format(base.value, 1)}% autonomous success` }, plot);
        svg("line", { x1: margin.l, x2: width - margin.r, y1: y(base.value), y2: y(base.value) }, line);
        svg("line", { x1: margin.l, x2: width - margin.r, y1: y(base.value), y2: y(base.value), class: "viz-hit" }, line);
        svg("text", { x: margin.l + 4, y: y(base.value) - 4, class: "viz-note" }, line).textContent = base.label;
        line.dataset.key = "baseline";
        interact(line, {
          title: `${base.label} baseline`, body: `${format(base.value, 1)}% autonomous success with 100 extra demonstrations`,
          activate: () => highlight(root, "baseline"), deactivate: () => highlight(root, null)
        });
      } else {
        const meanLine = svg("polyline", { points: panel.mean.map((value, index) => `${x(index)},${y(value)}`).join(" "), class: "viz-mean-line" }, plot);
        meanLine.style.stroke = chart.meanColor;
        meanLine.dataset.key = "mean";
      }

      // Per-task dots (jittered like the paper figure) and a trajectory revealed on highlight.
      panel.series.forEach((task, taskIndex) => {
        const key = `task-${taskIndex}`;
        const offset = (taskIndex - (panel.series.length - 1) / 2) * band * 0.055;
        const roundCount = panel.bars ? 4 : task.values.length;
        const path = svg("polyline", {
          points: task.values.slice(0, roundCount).map((value, index) => `${x(index) + offset},${y(value)}`).join(" "),
          class: "viz-task-line"
        }, plot);
        path.style.stroke = task.color;
        path.dataset.key = key;
        task.values.forEach((value, index) => {
          const dot = svg("circle", { cx: x(index) + offset, cy: y(value), r: 3.1, class: "viz-dot" }, plot);
          dot.style.fill = task.color;
          dot.dataset.key = key;
          interact(dot, {
            title: `${task.name} · ${categories[index]}`, body: valueText(value, index),
            activate: () => highlight(root, key), deactivate: () => highlight(root, null)
          });
        });
      });

      if (!panel.bars) {
        panel.mean.forEach((value, index) => {
          const change = index ? ` (${value < panel.mean[0] ? "−" : "+"}${format(Math.abs(100 * (value / panel.mean[0] - 1)), 0)}% vs R1)` : "";
          const dot = svg("circle", {
            cx: x(index), cy: y(value), r: 4.6, class: "viz-mean-dot", tabindex: 0, role: "img",
            "aria-label": `Task mean · ${rounds[index]}: ${reading(panel, value)}${change}`
          }, plot);
          dot.style.fill = chart.meanColor;
          dot.dataset.key = "mean";
          interact(dot, {
            title: `Task mean · ${rounds[index]}`, body: `${reading(panel, value)}${change}`,
            activate: () => highlight(root, "mean"), deactivate: () => highlight(root, null)
          });
        });
      }
      shell.append(plot);
      panels.append(shell);
    });

    root.append(createLegend(root, [
      { key: "mean", name: "Task mean", color: chart.meanColor, line: true },
      ...tasks.map((task, index) => ({
        key: `task-${index}`, name: task.name, color: task.color, task: task.name,
        summary: chart.panels.map(panel => `${panel.title}: ${panel.series[index].values.map(value => format(value, panel.digits)).join(", ")}`).join("; ")
      }))
    ]));
    onTaskChange(name => {
      const index = tasks.findIndex(task => task.name === name);
      if (index >= 0) root.pinnedKey = `task-${index}`;
      else if (root.pinnedKey?.startsWith("task-")) root.pinnedKey = null;
      root.syncLegend();
      highlight(root, null);
    });
    return root;
  }

  function linesChart(chart) {
    const root = make("div", "viz viz-lines");
    const panels = make("div", "viz-panels");
    root.append(panels);
    const width = 260, height = 200, margin = { l: 34, r: 12, t: 8, b: 22 };
    chart.panels.forEach(panel => {
      const shell = panelShell(panel);
      const { plot, x, y } = panelFrame(width, height, margin, panel, chart.x);
      chart.series.forEach(([name, color], seriesIndex) => {
        const key = `series-${seriesIndex}`;
        const values = panel.values[seriesIndex];
        const line = svg("polyline", { points: values.map((value, index) => `${x(index)},${y(value)}`).join(" "), class: "viz-line" }, plot);
        line.style.stroke = color;
        line.dataset.key = key;
        values.forEach((value, index) => {
          const body = `${format(value, panel.digits)}${panel.suffix || ""} ${panel.unit}`;
          const dot = svg("circle", {
            cx: x(index), cy: y(value), r: 4.4, class: "viz-dot is-solid", tabindex: 0, role: "img",
            "aria-label": `${name} · ${chart.x[index]}: ${body}`
          }, plot);
          dot.style.fill = color;
          dot.dataset.key = key;
          interact(dot, {
            title: `${name} · ${chart.x[index]}`, body,
            activate: () => highlight(root, key), deactivate: () => highlight(root, null)
          });
        });
      });
      shell.append(plot);
      panels.append(shell);
    });
    root.append(createLegend(root, chart.series.map(([name, color], index) => ({ key: `series-${index}`, name, color, line: true }))));
    return root;
  }

  function stackedChart(chart) {
    const root = make("div", "viz viz-stacked");
    root.dataset.taskScope = "";
    root.append(createLegend(root, chart.series.map(([name, color], index) => ({ key: `part-${index}`, name, color }))));
    const rows = make("div", "viz-stack-rows");
    chart.rows.forEach(([label, values]) => {
      const row = make("div", "viz-stack-row");
      tagTask(row, label);
      row.append(make("span", "viz-stack-label", label));
      const bar = make("div", "viz-stack-bar");
      values.forEach((value, index) => {
        if (!value) return;
        const [part, color] = chart.series[index];
        const segment = make("button", "viz-segment");
        segment.type = "button";
        segment.style.width = `${value}%`;
        segment.style.setProperty("--series-color", color);
        segment.dataset.key = `part-${index}`;
        segment.setAttribute("aria-label", `${label} · ${part}: ${format(value)}%`);
        interact(segment, {
          title: `${label} · ${part}`, body: `${format(value)}% of body-part activations`,
          activate: () => highlight(root, `part-${index}`), deactivate: () => highlight(root, null)
        });
        bar.append(segment);
      });
      row.append(bar);
      rows.append(row);
    });
    const axis = make("div", "viz-stack-axis");
    [0, 25, 50, 75, 100].forEach(tick => {
      const label = make("span", "", String(tick));
      label.style.left = `${tick}%`;
      axis.append(label);
    });
    rows.append(axis);
    root.append(rows, make("p", "viz-axis-title", chart.label));
    return root;
  }

  const chartBuilders = { trends: trendsChart, lines: linesChart, stacked: stackedChart };

  /* ---------- Wire up figures ---------- */

  Array.from(document.querySelectorAll("img.teaser-image, img.method-image")).forEach(image => {
    const figure = { title: image.alt || "Figure", ...config[image.src.split("/").pop()] };
    if (!figure.hotspots && !figure.tasks && !figure.chart) return;
    const wrapper = make("figure", "interactive-figure");
    const canvas = make("div", "figure-canvas");
    image.before(wrapper);
    canvas.append(image);
    wrapper.append(canvas);
    if (figure.chart) {
      const chart = chartBuilders[figure.chart.type](figure.chart);
      chart.setAttribute("role", "group");
      chart.setAttribute("aria-label", figure.chart.label);
      canvas.classList.add("has-chart");
      image.classList.add("chart-fallback");
      canvas.append(chart);
    } else {
      createHotspots(canvas, figure);
    }
  });

  document.querySelectorAll(".rollout-tile").forEach(tile => {
    const name = tile.querySelector(".rollout-task")?.textContent.trim();
    if (name) tagTask(tile, name);
  });

  /* ---------- Published tables: vertical grouped bars ---------- */

  // Read the existing published tables so edits to index.html also update the charts.
  function readTable(table) {
    let group = "";
    const rows = [];
    table.querySelectorAll("tbody tr").forEach(row => {
      tagTask(row, row.cells[0].textContent.trim());
      if (row.classList.contains("group-row")) {
        group = row.textContent.trim();
      } else {
        const cells = Array.from(row.cells, cell => cell.textContent.trim());
        rows.push({
          label: cells[0], group, originals: cells.slice(1),
          values: cells.slice(1).map(cell => {
            const percent = cell.match(/([\d.]+)%/);
            return percent ? Number(percent[1]) : Number(cell);
          })
        });
      }
    });
    return { series: Array.from(table.querySelectorAll("thead th")).slice(1).map(cell => cell.textContent.trim()), rows };
  }

  /* One block of columns: the bars of each row grouped above a short label, on a 0–100% scale.
   * Values are left off the bars; hovering a bar gives its published value. */
  function columnBlock(root, rows, { series, colors, short, apartFirst }) {
    const block = make("div", "viz-col-block");
    const groups = make("div", "viz-col-groups");
    const labels = make("div", "viz-col-labels");
    const grid = make("div", "viz-col-grid");
    grid.setAttribute("aria-hidden", "true");
    [0, 25, 50, 75, 100].forEach(tick => {
      const line = make("span", "viz-col-tick", String(tick));
      line.style.bottom = `${tick}%`;
      grid.append(line);
    });
    groups.append(grid);
    rows.forEach((row, rowIndex) => {
      const group = make("div", "viz-col-group");
      const label = make("div", "viz-col-label");
      if (apartFirst && rowIndex === 0) [group, label].forEach(element => element.classList.add("is-apart"));
      tagTask(group, row.label);
      tagTask(label, row.label);
      row.values.forEach((value, index) => {
        const original = row.originals[index];
        const shown = original.includes("%") ? original : `${original}%`;
        const bar = make("button", "viz-col-bar");
        bar.type = "button";
        bar.style.height = `${value}%`;
        bar.style.setProperty("--series-color", colors[index % colors.length]);
        bar.dataset.key = `series-${index}`;
        bar.setAttribute("aria-label", `${row.group ? `${row.group} · ` : ""}${row.label} · ${series[index]}: ${shown}`);
        interact(bar, {
          title: row.label, body: `${series[index]}: ${shown}`,
          activate: () => { bar.classList.add("is-selected"); highlight(root, bar.dataset.key); },
          deactivate: () => { bar.classList.remove("is-selected"); highlight(root, null); }
        });
        group.append(bar);
      });
      // "Round 1 (25)" → "R1" over "25"; tasks without a count keep one line.
      const [, name, count] = row.label.match(/^(.*?)(?: \((\d+)\))?$/);
      label.append(make("span", "viz-col-name", short[name] || name));
      if (count) label.append(make("span", "viz-col-count", count));
      label.title = row.label;
      groups.append(group);
      labels.append(label);
    });
    block.append(groups, labels);
    return block;
  }

  function columnsChart({ series, rows }, options) {
    const root = make("div", "viz viz-columns");
    root.dataset.taskScope = "";
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", options.label);
    root.append(createLegend(root, series.map((name, index) => ({ key: `series-${index}`, name, color: options.colors[index % options.colors.length] }))));

    const axis = "Full-task success (%)";
    const grouped = [];
    rows.forEach(row => {
      if (grouped.at(-1)?.name !== row.group) grouped.push({ name: row.group, rows: [] });
      grouped.at(-1).rows.push(row);
    });
    const frame = make("div", options.panels ? "viz-col-frame is-panels" : "viz-col-frame");
    grouped.forEach(({ name, rows: groupRows }) => {
      const section = make("div", "viz-col-section");
      section.style.setProperty("--columns", groupRows.length);
      const plot = columnBlock(root, groupRows, { ...options, series });
      const heading = make("div", "viz-col-heading", options.short[name] || name);
      heading.title = name;
      tagTask(heading, name);
      if (options.panels) section.append(heading, make("p", "viz-panel-axis", axis), plot);
      else section.append(plot, heading);
      frame.append(section);
    });
    if (!options.panels) root.append(make("p", "viz-panel-axis", axis));
    root.append(frame);
    return root;
  }

  Object.entries(window.I3L_TABLE_CHARTS || {}).forEach(([id, options]) => {
    const table = document.getElementById(id);
    if (!table) return;
    const data = readTable(table);
    if (!data.rows.length || data.rows.some(row => row.values.some(value => !Number.isFinite(value) || value < 0 || value > 100))) return;
    const wrapper = table.parentElement;
    const chart = columnsChart(data, { short: {}, ...options });
    // The table stays in the page for print and no-JavaScript readers, hidden on screen.
    wrapper.classList.add("is-charted");
    wrapper.before(chart);
  });

})();
