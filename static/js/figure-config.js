/* Editable figure content.
 *
 * hotspots: [title, [left, top, width, height], short note], bounds from 0 to 1. Hovering a region
 *   outlines it and shows the note in a tooltip.
 * tasks: [task name, bounds]. Hovering outlines the task (no tooltip); clicking selects it everywhere.
 * chart: replaces the image with an interactive SVG drawn from the published data. The image stays
 *   in the page as the no-JavaScript and print fallback.
 */
(() => {
  const TASKS = [
    // Colors and values extracted from the vector paths of intervention_trends (Fig. 5).
    ["Boxing Books up for Storage", "#405b8c"],
    ["Prepare Make-Ahead Breakfast Bowls", "#66824b"],
    ["Turning on Radio", "#a64d60"],
    ["Open Fridge and Pick Up Radio", "#8870a3"],
    ["Make Microwave Popcorn", "#d2aa54"],
    ["Mug Hanging", "#705044"],
    ["Pick-and-Place Strawberries", "#8fa7ce"],
    ["Peg Insertion", "#bd8ca6"]
  ];
  const trendSeries = values => TASKS.map(([name, color], index) => ({ name, color, values: values[index] }));

  window.I3L_FIGURES = {
    "teaser.jpg": {
      source: [1, 1],
      hotspots: [
        ["Whole-body correction", [0, 0, 0.305, 1], "As the policy nears a failure, the operator grasps JoyLo+ and corrects the arms, torso, and base together."],
        ["Iterative retraining", [0.312, 0, 0.309, 1], "Corrections are aggregated with prior demonstrations, the policy is retrained, and the new policy is redeployed."],
        ["Tasks and embodiments", [0.628, 0, 0.372, 1], "Three robots across simulated and real-world tasks."]
      ]
    },
    "hardware.jpeg": {
      source: [2, 3],
      hotspots: [
        ["Actuated leader arms", [0, 0, 0.367, 0.76], "Track the policy during autonomy; gravity-compensated for hand guidance during correction."],
        ["Copper touch electrodes", [0.375, 0.12, 0.103, 0.55], "Grasping the grip requests takeover."],
        ["Touch sensing", [0.48, 0.12, 0.108, 0.55], "A capacitive-sensing board and microcontroller report touch state to the host."],
        ["Hands off → hands on", [0.589, 0.06, 0.16, 0.59], "Touch switches the leaders from policy tracking to hand guidance."],
        ["Whole-body gate", [0.62, 0.72, 0.117, 0.27], "One takeover hands over arms, torso, base, and grippers."],
        ["Franka and R1 Pro", [0.764, 0, 0.236, 0.79], "The same interaction supports single-arm and bimanual whole-body control."]
      ]
    },
    // Task figures: hovering outlines a task; clicking it highlights that task across the page.
    // Entries are [task name, bounds]; names must match the task names used in tables and charts.
    "tasks.jpeg": {
      source: [3, 4],
      tasks: [
        ["Prepare Make-Ahead Breakfast Bowls", [0, 0, 0.27, 0.505]],
        ["Boxing Books up for Storage", [0.27, 0, 0.265, 0.505]],
        ["Mug Hanging", [0.535, 0, 0.202, 0.505]],
        ["Pick-and-Place Strawberries", [0.737, 0, 0.263, 0.505]],
        ["Make Microwave Popcorn", [0, 0.505, 0.27, 0.495]],
        ["Turning on Radio", [0.27, 0.505, 0.265, 0.495]],
        ["Peg Insertion", [0.535, 0.505, 0.202, 0.495]],
        ["Open Fridge and Pick Up Radio", [0.737, 0.505, 0.263, 0.495]]
      ]
    },
    "correction.png": {
      source: [5, 6],
      tasks: [
        ["Prepare Make-Ahead Breakfast Bowls", [0.014, 0, 0.486, 0.236]],
        ["Boxing Books up for Storage", [0.51, 0, 0.49, 0.236]],
        ["Mug Hanging", [0.014, 0.239, 0.486, 0.25]],
        ["Peg Insertion", [0.51, 0.239, 0.49, 0.25]],
        ["Make Microwave Popcorn", [0.014, 0.49, 0.486, 0.245]],
        ["Turning on Radio", [0.51, 0.49, 0.49, 0.245]],
        ["Pick-and-Place Strawberries", [0.014, 0.736, 0.486, 0.24]],
        ["Open Fridge and Pick Up Radio", [0.51, 0.736, 0.49, 0.24]]
      ]
    },
    "intervention_trends.png": {
      source: [4, 5],
      chart: {
        type: "trends",
        label: "Intervention burden across correction rounds",
        meanColor: "#29383d",
        panels: [
          {
            title: "(a) Takeover count", axis: "Takeovers / episode", unit: "takeovers / episode", digits: 2, max: 2.5, ticks: [0, 0.5, 1, 1.5, 2, 2.5],
            mean: [1.325, 0.89, 0.59, 0.485],
            series: trendSeries([
              [2.20, 1.68, 1.28, 0.52], [2.32, 1.52, 1.12, 0.52], [1.20, 0.48, 0.36, 0.80], [0.76, 0.44, 0.36, 0.56],
              [1.16, 0.64, 0.40, 0.32], [1.00, 0.88, 0.36, 0.28], [0.92, 0.72, 0.32, 0.40], [1.04, 0.76, 0.52, 0.48]
            ])
          },
          {
            title: "(b) Takeover percentage", axis: "Frames under takeover (%)", unit: "of frames under takeover", suffix: "%", digits: 1, max: 25, ticks: [0, 5, 10, 15, 20, 25],
            mean: [14.10, 8.90, 5.34, 4.30],
            series: trendSeries([
              [9.24, 8.70, 5.75, 2.24], [14.94, 9.98, 4.78, 1.72], [15.10, 7.49, 4.50, 7.25], [5.95, 2.62, 2.77, 4.70],
              [12.27, 6.35, 4.05, 2.41], [20.96, 13.79, 6.48, 4.38], [11.99, 9.48, 7.31, 5.66], [22.34, 12.78, 7.05, 6.04]
            ])
          },
          {
            title: "(c) Takeover duration", axis: "Seconds / episode", unit: "under takeover / episode", suffix: " s", digits: 2, max: 12, ticks: [0, 3, 6, 9, 12],
            mean: [4.96, 3.40, 2.18, 1.39],
            series: trendSeries([
              [6.90, 7.13, 4.88, 1.83], [11.47, 8.28, 4.85, 1.96], [3.57, 1.68, 1.15, 1.78], [1.19, 0.51, 0.60, 1.07],
              [4.97, 2.61, 1.62, 1.08], [4.52, 3.15, 1.52, 0.93], [1.83, 1.29, 0.96, 0.82], [5.23, 2.52, 1.85, 1.65]
            ])
          },
          {
            title: "(d) Success rate", axis: "Success (%)", unit: "of collection episodes takeover-free", finalUnit: "autonomous success",
            suffix: "%", digits: 1, max: 100, ticks: [0, 20, 40, 60, 80, 100], bars: true,
            // Rounds 1–4: takeover-free collection episodes (% of 25). Final: autonomous evaluation success.
            mean: [19.5, 38.0, 53.0, 56.0, 93.85], baseline: { value: 58.25, label: "Demo-only" },
            series: trendSeries([
              [12, 4, 8, 36, 92], [4, 20, 28, 60, 96], [24, 60, 68, 32, 96], [24, 56, 64, 56, 90],
              [20, 56, 64, 76, 100], [24, 24, 72, 72, 92], [20, 44, 68, 60, 92.8], [28, 40, 52, 56, 92]
            ])
          }
        ]
      }
    },
    "whole_body_takeover.png": {
      source: [6, 6],
      chart: {
        type: "stacked",
        label: "Share of body-part activations (%)",
        // Printed labels from Fig. 6; rounding preserved, not renormalized to 100%.
        series: [["Base", "#b65c00"], ["Torso", "#d3a95a"], ["Left arm", "#7f9a78"], ["Right arm", "#356d73"]],
        rows: [
          ["Boxing Books up for Storage", [30.9, 13.1, 28.4, 27.6]],
          ["Make Microwave Popcorn", [42.2, 0, 37.9, 19.8]],
          ["Prepare Make-Ahead Breakfast Bowls", [27.9, 3.8, 36.5, 31.7]],
          ["Turning on Radio", [35.6, 7.6, 47.0, 9.8]]
        ]
      }
    },
    "operator_study.png": {
      source: [7, 7],
      chart: {
        type: "lines",
        label: "Operator study on Franka mug hanging",
        // Computed from 2027-ICRA-I3L/figures/operator-study/source-data.json (cumulative over rounds).
        x: ["R1", "R2", "R3"],
        series: [["Operator 1", "#356d73"], ["Operator 2", "#b85c00"], ["Operator 3", "#7e9878"]],
        panels: [
          { title: "(a) Intervention share", axis: "Cumulative share (%)", unit: "of timesteps under human control (cumulative)", suffix: "%", digits: 1,
            min: 10, max: 35, ticks: [10, 15, 20, 25, 30, 35],
            values: [[16.149, 14.233, 11.823], [34.592, 24.61, 19.885], [16.384, 15.565, 14.677]] },
          { title: "(b) Takeover-free", axis: "Cumulative episodes", unit: "takeover-free episodes so far", digits: 0,
            min: 0, max: 45, ticks: [0, 15, 30, 45],
            values: [[8, 19, 34], [6, 12, 30], [13, 28, 41]] }
        ]
      }
    }
  };
})();
