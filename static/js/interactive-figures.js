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
      layer.append(region);
    });
    return layer;
  }

  figures.forEach((figure, index) => {
    const wrapper = make("figure", "interactive-figure");
    const canvas = make("div", "figure-canvas");
    figure.image.before(wrapper);
    canvas.append(figure.image);
    const info = createInfo(figure, `figure-info-${index}`);
    if (figure.hotspots?.length) canvas.append(createHotspots(figure, info));
    wrapper.append(canvas);
    if (figure.hotspots?.length) wrapper.append(info);
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
