/* Progressive enhancement: the original figures and tables work without JavaScript.
 * No runtime libraries, build step, or network requests are needed for interactions.
 */
(() => {
  "use strict";

  const config = window.I3L_FIGURES || {};
  const colors = ["#496d88", "#819273", "#c45b28", "#76568f"];
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const button = (text, action, className = "figure-control") => {
    const element = make("button", className, text);
    element.type = "button";
    element.addEventListener("click", action);
    return element;
  };
  const figures = Array.from(document.querySelectorAll("img.teaser-image, img.method-image"))
    .map(image => ({ image, title: image.alt || "Figure", ...config[image.src.split("/").pop()] }));

  function createInfo(figure, id) {
    const info = make("div", "figure-info");
    info.id = id;
    info.setAttribute("role", "status");
    info.setAttribute("aria-live", "polite");
    info.setAttribute("aria-atomic", "true");
    info.append(make("strong", "info-title", "Explore the components"));
    info.append(make("p", "info-body", "Hover over a numbered component, or click or tap it, to learn more. You can also Tab to a component to show its explanation."));
    const source = make("a", "info-source", `Paper · Figure ${figure.source?.[0] || ""}`);
    source.href = `./static/paper.pdf#page=${figure.source?.[1] || 1}`;
    source.target = "_blank";
    source.rel = "noopener";
    info.append(source);
    return info;
  }

  function createHotspots(figure, info) {
    const layer = make("div", "hotspot-layer");
    layer.setAttribute("role", "group");
    layer.setAttribute("aria-label", `Components in ${figure.title}`);
    (figure.hotspots || []).forEach(([title, bounds, description], index) => {
      const region = button("", select, "hotspot-region");
      region.setAttribute("aria-label", `${index + 1}. ${title}`);
      region.setAttribute("aria-controls", info.id);
      region.setAttribute("aria-describedby", info.id);
      region.setAttribute("aria-pressed", "false");
      region.style.left = `${bounds[0] * 100}%`;
      region.style.top = `${bounds[1] * 100}%`;
      region.style.width = `${bounds[2] * 100}%`;
      region.style.height = `${bounds[3] * 100}%`;
      const dot = make("span", "hotspot-dot", String(index + 1));
      dot.setAttribute("aria-hidden", "true");
      region.append(dot);
      function select() {
        layer.querySelectorAll('[aria-pressed="true"]').forEach(other => other.setAttribute("aria-pressed", "false"));
        region.setAttribute("aria-pressed", "true");
        info.querySelector(".info-title").textContent = title;
        info.querySelector(".info-body").textContent = description;
        info.classList.add("has-selection");
      }
      region.addEventListener("pointerenter", event => { if (event.pointerType !== "touch") select(); });
      region.addEventListener("focus", select);
      region.addEventListener("dblclick", event => event.stopPropagation());
      layer.append(region);
    });
    return layer;
  }

  // A single native dialog gives every figure the same keyboard, touch, and zoom controls.
  const dialog = make("dialog", "figure-dialog");
  dialog.setAttribute("aria-labelledby", "figure-viewer-title");
  const header = make("div", "viewer-header");
  const heading = make("h2", "viewer-title");
  heading.id = "figure-viewer-title";
  const close = button("Close ×", () => dialog.close());
  header.append(heading, close);

  const toolbar = make("div", "viewer-toolbar");
  const panelLabel = make("label", "figure-field", "Focus");
  const panelSelect = make("select", "figure-select");
  panelSelect.id = "figure-viewer-panel";
  panelLabel.htmlFor = panelSelect.id;
  panelLabel.append(panelSelect);
  const zoomOut = button("−", () => zoomBy(1 / 1.4));
  zoomOut.setAttribute("aria-label", "Zoom out");
  const zoomIn = button("+", () => zoomBy(1.4));
  zoomIn.setAttribute("aria-label", "Zoom in");
  const zoomLabel = make("output", "viewer-zoom", "100%");
  zoomLabel.setAttribute("aria-label", "Zoom relative to fitted panel");
  const fitButton = button("Fit", () => fit());
  const download = make("a", "figure-control", "Download original");
  download.setAttribute("download", "");
  toolbar.append(panelLabel, zoomOut, zoomLabel, zoomIn, fitButton, download);

  const stage = make("div", "viewer-stage");
  stage.tabIndex = 0;
  stage.setAttribute("role", "group");
  stage.setAttribute("aria-label", "Figure canvas. Use plus and minus to zoom, arrow keys to pan, and zero to fit.");
  const crop = make("div", "viewer-crop");
  const fullImage = make("img", "viewer-image");
  fullImage.draggable = false;
  crop.append(fullImage);
  stage.append(crop);
  const footer = make("div", "viewer-footer");
  const viewerInfo = make("div", "viewer-info");
  const caption = make("p", "viewer-caption");
  const help = make("p", "figure-hint", "Scroll or pinch to zoom · Drag to pan · + / − to zoom · Arrow keys to pan · 0 to fit · Esc to close");
  const navigation = make("div", "viewer-navigation");
  const previous = button("← Previous figure", () => showFigure(current - 1));
  const counter = make("span", "figure-hint");
  const next = button("Next figure →", () => showFigure(current + 1));
  navigation.append(previous, counter, next);
  footer.append(viewerInfo, caption, help, navigation);
  dialog.append(header, toolbar, stage, footer);
  document.body.append(dialog);

  let current = 0;
  let returnFocus = null;
  let viewerHotspots = null;
  let panelBounds = [0, 0, 1, 1];
  let scale = 1;
  let fitScale = 1;
  let x = 0;
  let y = 0;
  let cropWidth = 1;
  let cropHeight = 1;
  const pointers = new Map();

  function populatePanels(select, figure) {
    select.replaceChildren(new Option("Whole figure", "-1"));
    (figure.panels || []).forEach(([name], index) => select.add(new Option(name, String(index))));
  }

  function render() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const renderedWidth = cropWidth * scale;
    const renderedHeight = cropHeight * scale;
    x = renderedWidth < width ? (width - renderedWidth) / 2 : Math.max(width - renderedWidth, Math.min(0, x));
    y = renderedHeight < height ? (height - renderedHeight) / 2 : Math.max(height - renderedHeight, Math.min(0, y));
    crop.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    zoomLabel.value = `${Math.round(scale / fitScale * 100)}%`;
    zoomOut.disabled = scale <= fitScale * 1.001;
    zoomIn.disabled = scale >= fitScale * 7.999;
    // Position interactive regions independently so their numbered markers stay readable when zooming.
    if (viewerHotspots) {
      const [panelX, panelY, panelWidth, panelHeight] = panelBounds;
      Array.from(viewerHotspots.children).forEach((region, index) => {
        const [left, top, regionWidth, regionHeight] = figures[current].hotspots[index][1];
        const startX = Math.max(left, panelX);
        const startY = Math.max(top, panelY);
        const endX = Math.min(left + regionWidth, panelX + panelWidth);
        const endY = Math.min(top + regionHeight, panelY + panelHeight);
        region.hidden = endX <= startX || endY <= startY;
        region.style.left = `${x + (startX - panelX) * fullImage.naturalWidth * scale}px`;
        region.style.top = `${y + (startY - panelY) * fullImage.naturalHeight * scale}px`;
        region.style.width = `${Math.max(0, endX - startX) * fullImage.naturalWidth * scale}px`;
        region.style.height = `${Math.max(0, endY - startY) * fullImage.naturalHeight * scale}px`;
      });
    }
  }

  function fit() {
    if (!dialog.open || !fullImage.complete || !fullImage.naturalWidth || !stage.clientWidth) return;
    const bounds = figures[current].panels?.[Number(panelSelect.value)]?.[1] || [0, 0, 1, 1];
    const [left, top, width, height] = bounds;
    panelBounds = bounds;
    cropWidth = width * fullImage.naturalWidth;
    cropHeight = height * fullImage.naturalHeight;
    crop.style.width = `${cropWidth}px`;
    crop.style.height = `${cropHeight}px`;
    fullImage.style.width = `${fullImage.naturalWidth}px`;
    fullImage.style.height = `${fullImage.naturalHeight}px`;
    fullImage.style.left = `${-left * fullImage.naturalWidth}px`;
    fullImage.style.top = `${-top * fullImage.naturalHeight}px`;
    scale = fitScale = Math.min(stage.clientWidth / cropWidth, stage.clientHeight / cropHeight) * 0.96;
    x = (stage.clientWidth - cropWidth * scale) / 2;
    y = (stage.clientHeight - cropHeight * scale) / 2;
    stage.dataset.ready = "true";
    stage.setAttribute("aria-busy", "false");
    crop.style.visibility = "visible";
    if (viewerHotspots) viewerHotspots.style.visibility = "visible";
    render();
  }

  function zoomBy(factor, anchorX = stage.clientWidth / 2, anchorY = stage.clientHeight / 2) {
    if (stage.dataset.ready !== "true") return;
    const newScale = Math.max(fitScale, Math.min(fitScale * 8, scale * factor));
    x = anchorX - (anchorX - x) * newScale / scale;
    y = anchorY - (anchorY - y) * newScale / scale;
    scale = newScale;
    render();
  }

  function showFigure(index, panel = -1) {
    if (index < 0 || index >= figures.length) return;
    current = index;
    const figure = figures[current];
    heading.textContent = figure.title;
    populatePanels(panelSelect, figure);
    panelSelect.value = String(panel);
    stage.dataset.ready = "false";
    stage.setAttribute("aria-busy", "true");
    crop.style.visibility = "hidden";
    zoomIn.disabled = zoomOut.disabled = true;
    viewerHotspots?.remove();
    viewerHotspots = null;
    viewerInfo.replaceChildren();
    if (figure.hotspots?.length) {
      const info = createInfo(figure, "viewer-component-info");
      viewerInfo.append(info);
      viewerHotspots = createHotspots(figure, info);
      viewerHotspots.style.visibility = "hidden";
      stage.append(viewerHotspots);
    }
    fullImage.alt = figure.image.alt;
    fullImage.src = figure.image.src;
    download.href = figure.image.src;
    const originalCaption = figure.image.closest("figure").nextElementSibling;
    caption.textContent = figure.note || originalCaption?.textContent.trim() || figure.image.alt;
    caption.hidden = !!figure.hotspots?.length;
    previous.disabled = current === 0;
    next.disabled = current === figures.length - 1;
    counter.textContent = `${current + 1} / ${figures.length}`;
    pointers.clear();
    if (fullImage.complete) fit();
  }

  function openFigure(index, panel = -1) {
    returnFocus = document.activeElement;
    dialog.showModal();
    showFigure(index, panel);
    close.focus();
  }

  fullImage.addEventListener("load", fit);
  panelSelect.addEventListener("change", fit);
  dialog.addEventListener("close", () => {
    // A queued close event can arrive after another figure has already opened.
    if (dialog.open) return;
    pointers.clear();
    stage.classList.remove("is-dragging");
    // Native dialogs normally restore focus immediately. Do not steal it back
    // if the user has since moved to another control before this event runs.
    if (document.activeElement === document.body || dialog.contains(document.activeElement)) {
      returnFocus?.focus({ preventScroll: true });
    }
  });
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll('button:not(:disabled), select, a[href], [tabindex="0"]'))
      .filter(element => element.getClientRects().length && !element.closest("[hidden]"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  new ResizeObserver(() => { if (dialog.open) fit(); }).observe(stage);
  stage.addEventListener("wheel", event => {
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    zoomBy(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.005), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  stage.addEventListener("dblclick", event => {
    const rect = stage.getBoundingClientRect();
    if (scale > fitScale * 1.1) fit();
    else zoomBy(2, event.clientX - rect.left, event.clientY - rect.top);
  });
  stage.addEventListener("keydown", event => {
    if (["+", "=", "-", "0", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "+" || event.key === "=") zoomBy(1.4);
      if (event.key === "-") zoomBy(1 / 1.4);
      if (event.key === "0") fit();
      if (event.key === "ArrowLeft") x += 60;
      if (event.key === "ArrowRight") x -= 60;
      if (event.key === "ArrowUp") y += 60;
      if (event.key === "ArrowDown") y -= 60;
      render();
    }
  });
  stage.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const component = event.target.closest(".hotspot-region");
    if (!component) stage.focus({ preventScroll: true });
    (component || stage).setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.classList.add("is-dragging");
  });
  stage.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    const before = Array.from(pointers.values());
    const old = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = Array.from(pointers.values());
    if (after.length === 1) {
      x += event.clientX - old.x;
      y += event.clientY - old.y;
    } else if (after.length === 2) {
      const distance = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const midpoint = points => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
      const a = midpoint(before);
      const b = midpoint(after);
      const rect = stage.getBoundingClientRect();
      if (distance(before) > 0) zoomBy(distance(after) / distance(before), a.x - rect.left, a.y - rect.top);
      x += b.x - a.x;
      y += b.y - a.y;
    }
    render();
  });
  const releasePointer = event => {
    pointers.delete(event.pointerId);
    if (!pointers.size) stage.classList.remove("is-dragging");
  };
  stage.addEventListener("pointerup", releasePointer);
  stage.addEventListener("pointercancel", releasePointer);
  stage.addEventListener("lostpointercapture", releasePointer);

  figures.forEach((figure, index) => {
    const wrapper = make("figure", "interactive-figure");
    const canvas = make("div", "figure-canvas");
    const opener = button("", () => openFigure(index), "figure-image-button");
    opener.setAttribute("aria-label", `Expand ${figure.title}`);
    opener.setAttribute("aria-haspopup", "dialog");
    figure.image.before(wrapper);
    opener.append(figure.image);
    canvas.append(opener);
    const info = createInfo(figure, `figure-info-${index}`);
    if (figure.hotspots?.length) canvas.append(createHotspots(figure, info));
    const controls = make("div", "figure-toolbar");
    const label = make("label", "figure-field", "Focus");
    const select = make("select", "figure-select");
    select.id = `figure-panel-${index}`;
    label.htmlFor = select.id;
    populatePanels(select, figure);
    label.append(select);
    const explore = button("Explore ↗", () => openFigure(index, Number(select.value)));
    explore.setAttribute("aria-label", `Explore ${figure.title}`);
    explore.setAttribute("aria-haspopup", "dialog");
    controls.append(label, explore);
    wrapper.append(canvas);
    if (figure.hotspots?.length) wrapper.append(info);
    wrapper.append(controls);
    if (figure.activation) {
      const details = make("details", "chart-details");
      details.append(make("summary", "", "Explore activation values"));
      details.append(createChart({
        title: "Body-part activation share", series: figure.activation.series,
        rows: figure.activation.rows, unit: "%", palette: ["#b65c00", "#a68129", "#6c8767", "#326c75"],
        note: "Published figure labels (%). Values retain the original rounding; no renormalization. Popcorn has no torso activations."
      }));
      wrapper.append(details);
    }
  });

  // Read the existing published tables so edits to index.html also update the charts.
  function readTable(table) {
    let group = "";
    const rows = [];
    table.querySelectorAll("tbody tr").forEach(row => {
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

  function downloadCSV(series, rows, filename) {
    const quote = value => `"${String(value).replaceAll('"', '""')}"`;
    const text = [["Group", "Task / setting", ...series], ...rows.map(row => [row.group || "", row.label, ...row.values])]
      .map(row => row.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const link = make("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function createChart({ title, series, rows, note, unit = "%", palette = colors, singleGroup = false }) {
    const chart = make("section", "results-explorer");
    chart.setAttribute("aria-label", title);
    chart.append(make("h3", "explorer-title", title));
    const controls = make("div", "chart-controls");
    const groups = Array.from(new Set(rows.map(row => row.group).filter(Boolean)));
    const groupSelect = make("select", "figure-select");
    groupSelect.setAttribute("aria-label", singleGroup ? "Task" : "Tasks");
    const groupLabel = make("label", "figure-field", singleGroup ? "Task" : "Tasks");
    groupLabel.append(groupSelect);
    if (!singleGroup) groupSelect.add(new Option("All tasks", ""));
    groups.forEach(group => groupSelect.add(new Option(group, group)));
    if (groups.length) controls.append(groupLabel);
    const exportButton = button("Download CSV", () => downloadCSV(series, filteredRows(), `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`));
    controls.append(exportButton);
    chart.append(controls);
    const legend = make("fieldset", "chart-legend");
    legend.append(make("legend", "figure-hint", "Show comparisons"));
    const visible = new Set(series.map((_, index) => index));
    series.forEach((name, index) => {
      const label = make("label", "legend-item");
      label.style.setProperty("--series-color", palette[index % palette.length]);
      const checkbox = make("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) visible.add(index);
        else visible.delete(index);
        draw();
      });
      label.append(checkbox, make("span", "", name));
      legend.append(label);
    });
    chart.append(legend);
    const readout = make("p", "chart-readout", "Hover, tap, or focus a bar to inspect its published value.");
    readout.setAttribute("role", "status");
    readout.setAttribute("aria-live", "polite");
    readout.setAttribute("aria-atomic", "true");
    const plot = make("div", "comparison-plot");
    chart.append(readout, plot, make("p", "figure-hint chart-source", note));
    const filteredRows = () => rows.filter(row => !groups.length || !groupSelect.value || row.group === groupSelect.value);
    function draw() {
      plot.replaceChildren();
      readout.textContent = "Hover, tap, or focus a bar to inspect its published value.";
      if (!visible.size) {
        plot.append(make("p", "chart-empty", "Select a comparison above to show its values."));
        return;
      }
      let lastGroup = null;
      filteredRows().forEach(row => {
        if (row.group && row.group !== lastGroup) {
          plot.append(make("h4", "chart-group", row.group));
          lastGroup = row.group;
        }
        const rowElement = make("div", "chart-row");
        rowElement.append(make("div", "chart-row-label", row.label));
        const bars = make("div", "chart-bars");
        row.values.forEach((value, index) => {
          if (!visible.has(index)) return;
          const original = row.originals?.[index];
          const label = `${row.group ? `${row.group} · ` : ""}${row.label} · ${series[index]}: ${original?.includes("%") ? original : `${value}${unit}`}`;
          const mark = button("", () => inspect(), "chart-mark");
          mark.setAttribute("aria-label", label);
          mark.style.setProperty("--series-color", palette[index % palette.length]);
          const fill = make("span", "chart-fill");
          fill.style.width = `${value}%`;
          const valueText = make("span", "chart-value", `${value}${unit}`);
          mark.append(fill, make("span", "chart-series-name", series[index]), valueText);
          const inspect = () => {
            readout.textContent = label;
            plot.querySelector(".is-selected")?.classList.remove("is-selected");
            mark.classList.add("is-selected");
          };
          mark.addEventListener("pointerenter", inspect);
          mark.addEventListener("focus", inspect);
          bars.append(mark);
        });
        rowElement.append(bars);
        plot.append(rowElement);
      });
      plot.append(make("p", "chart-axis", `Bar length: 0–100${unit}`));
    }
    groupSelect.addEventListener("change", draw);
    draw();
    return chart;
  }

  const tableCharts = [
    ["success-results", "Explore autonomous success", false],
    ["strategy-results", "Compare correction-learning strategies", true]
  ];
  tableCharts.forEach(([id, title, singleGroup]) => {
    const table = document.getElementById(id);
    if (!table) return;
    const data = readTable(table);
    if (!data.rows.length || data.rows.some(row => row.values.some(value => !Number.isFinite(value) || value < 0 || value > 100))) return;
    const wrapper = table.parentElement;
    const chart = createChart({
      ...data, title, singleGroup,
      palette: singleGroup ? ["#496d88", "#819273", "#76568f", "#c45b28"] : colors,
      note: "Full-task success (%), from the published table below. Downloads include all comparison columns for the selected tasks."
    });
    const details = make("details", "chart-details published-table");
    details.append(make("summary", "", "View published table"));
    wrapper.before(chart, details);
    details.append(wrapper);
  });

  // Closed <details> content is omitted by some browsers when printing.
  let closedTables = [];
  window.addEventListener("beforeprint", () => {
    closedTables = Array.from(document.querySelectorAll(".published-table:not([open])"));
    closedTables.forEach(details => { details.open = true; });
  });
  window.addEventListener("afterprint", () => {
    closedTables.forEach(details => { details.open = false; });
    closedTables = [];
  });
})();
