/* Editable figure titles and panel bounds: [left, top, width, height], from 0 to 1.
 * Bounds select regions of the original image; they do not approximate plot data.
 */
window.I3L_FIGURES = {
  "teaser.jpg": {
    title: "I3L at a glance",
    source: [1, 1],
    hotspots: [
      ["Whole-body correction with JoyLo+", [0, 0, 0.305, 1], "When the policy approaches a failure, the operator takes over through JoyLo+ and supplies a targeted correction. The interface can coordinate the arms, torso, base, and grippers."],
      ["The iterative learning loop", [0.312, 0, 0.309, 1], "Original demonstrations and active human corrections are aggregated for retraining. Each round starts from the same initial weights, then redeploys the updated policy to collect corrections for its remaining failures."],
      ["Three embodiments, eight tasks", [0.628, 0, 0.372, 1], "I3L is evaluated on A1, Franka, and R1 Pro across simulated and real-world tasks. Four rounds of corrective learning achieve at least 90% autonomous success on each of the eight tasks."]
    ],
    panels: [
      ["Whole-body corrections", [0, 0, 0.31, 1]],
      ["Iterative corrective learning", [0.31, 0, 0.315, 1]],
      ["Tasks and embodiments", [0.625, 0, 0.375, 1]]
    ]
  },
  "hardware.jpeg": {
    title: "JoyLo+ hardware interface",
    source: [2, 3],
    hotspots: [
      ["Actuated leader arms", [0, 0, 0.367, 0.76], "Franka uses one seven-joint leader; R1 Pro uses two. During autonomy, the motors track the policy’s arm targets. During correction, gravity compensation lets the operator guide the leaders by hand."],
      ["Copper touch electrodes", [0.375, 0.12, 0.103, 0.55], "Conductive copper in the grip detects the operator’s touch. Grasping the interface requests takeover without first having to move a leader that is tracking the policy."],
      ["Touch detection and signal logic", [0.48, 0.12, 0.108, 0.55], "An MPR121 capacitive-sensing board and ESP32-S3 controller report touch state to the host. Separate touch/release thresholds and a release cooldown maintain takeover through brief interruptions in contact."],
      ["Hands off → hands on", [0.589, 0.06, 0.16, 0.59], "The touch signal rises when the operator grasps the grip. That event changes the interface from policy-target tracking to gravity-compensated hand guidance."],
      ["Whole-body human gate", [0.62, 0.72, 0.117, 0.27], "On R1 Pro, touching a grip or using a JoyCon transfers command of both arms, torso, base, and grippers together. Releasing the interface returns control to the policy, which replans from the corrected state."],
      ["Franka and R1 Pro execution", [0.764, 0, 0.236, 0.79], "The same interaction supports single-arm Franka manipulation and bimanual whole-body R1 Pro manipulation. The leaders guide the arms; JoyCon inputs control the torso, mobile base, and grippers."]
    ],
    panels: [
      ["JoyLo+ leaders", [0, 0, 0.37, 1]],
      ["Capacitive takeover", [0.37, 0, 0.385, 0.69]],
      ["Robot execution", [0.76, 0, 0.24, 0.8]],
      ["Control loop", [0.37, 0.68, 0.63, 0.32]]
    ]
  },
  "tasks.jpeg": {
    title: "Tasks and embodiments",
    source: [3, 4],
    hotspots: [
      ["Prepare Make-Ahead Breakfast Bowls", [0, 0, 0.27, 0.505], "Real-world R1 Pro task involving drawer opening, bowl handling, bread placement, and final bowl placement. Autonomous success improves from 4% to 96% with 100 corrections, compared with 76% after 100 additional demonstrations."],
      ["Boxing Books up for Storage", [0.27, 0, 0.265, 0.505], "A long-horizon real-world R1 Pro task with basket and book handling. Autonomous success increases from 12% to 92% with corrections; the additional-demonstration baseline reaches 52%."],
      ["Mug Hanging", [0.535, 0, 0.202, 0.505], "A precision, contact-rich Franka task using the single-arm JoyLo+ interface. Success rises from 6/25 episodes (24%) to 23/25 (92%) after corrective learning."],
      ["Pick-and-Place Strawberries", [0.737, 0, 0.263, 0.505], "A controlled A1 simulation task in BEHAVIOR. Success rates are averaged over evaluation seeds: 53.2% for the base policy, 55.6% with additional demonstrations, and 92.8% with four rounds of corrections."],
      ["Make Microwave Popcorn", [0, 0.505, 0.27, 0.495], "Real-world R1 Pro task with popcorn pickup and microwave interaction. Corrections increase success from 5/25 episodes (20%) to 25/25 (100%); additional demonstrations reach 80%."],
      ["Turning on Radio", [0.27, 0.505, 0.265, 0.495], "Real-world R1 Pro task involving navigation, radio pickup, and pressing the power button. Success increases from 24% to 96% with corrections, versus 56% with additional demonstrations."],
      ["Peg Insertion", [0.535, 0.505, 0.202, 0.495], "A precision Franka task requiring a successful grasp and aligned insertion. Corrections improve autonomous success from 7/25 episodes (28%) to 23/25 (92%)."],
      ["Open Fridge and Pick Up Radio", [0.737, 0.505, 0.263, 0.495], "A controlled R1 Pro simulation task in BEHAVIOR. Four-round HG-DAgger reaches 90.0% success, compared with 39.6% for the base policy and 30.4% after additional demonstrations."]
    ],
    panels: [
      ["Breakfast bowls", [0, 0, 0.27, 0.505]],
      ["Boxing books", [0.27, 0, 0.265, 0.505]],
      ["Mug hanging", [0.535, 0, 0.202, 0.505]],
      ["Strawberries", [0.737, 0, 0.263, 0.505]],
      ["Microwave popcorn", [0, 0.505, 0.27, 0.495]],
      ["Turning on radio", [0.27, 0.505, 0.265, 0.495]],
      ["Peg insertion", [0.535, 0.505, 0.202, 0.495]],
      ["Open fridge", [0.737, 0.505, 0.263, 0.495]]
    ]
  },
  "intervention_trends.png": {
    title: "Intervention burden across rounds",
    source: [4, 5],
    hotspots: [
      ["Fewer takeovers", [0, 0, 0.247, 0.865], "The dark line is the equal-weight mean across eight tasks; colored points show individual tasks. From Round 1 to Round 4, the mean number of takeovers per episode falls by 63.4%."],
      ["Less time under human control", [0.25, 0, 0.247, 0.865], "This panel measures the fraction of execution frames under intervention. The task-averaged fraction falls by 69.5% between Rounds 1 and 4. This is a frame percentage, not a count of takeover events."],
      ["Shorter intervention duration", [0.5, 0, 0.246, 0.865], "This panel measures total seconds under intervention per episode. The equal-weight task mean decreases by 72.0% from Round 1 to Round 4; all three burden measures decline in every round."],
      ["Collection and final evaluation", [0.75, 0, 0.25, 0.865], "Rounds 1–4 show takeover-free episodes during correction collection. The final bar reports autonomous evaluation after training: every task reaches at least 90% success. The dashed 58.3% line is the demo-only evaluation baseline."]
    ],
    note: "Rounds 1–4 are correction collection. Final success is autonomous evaluation; the demo-only reference is 58.3%. The dark line is the equal-weight mean across eight tasks.",
    panels: [
      ["Takeover count", [0, 0, 0.247, 0.865]],
      ["Takeover percentage", [0.25, 0, 0.247, 0.865]],
      ["Takeover duration", [0.5, 0, 0.246, 0.865]],
      ["Success rate", [0.75, 0, 0.25, 0.865]],
      ["Task legend", [0.155, 0.88, 0.715, 0.12]]
    ]
  },
  "correction.png": {
    title: "Task-stage correction patterns",
    source: [5, 6],
    hotspots: [
      ["Breakfast: later-stage bottlenecks", [0.014, 0, 0.486, 0.236], "Intervention during drawer opening and bread placement diminishes across rounds, while late-stage intervention remains around bowl placement. The annotations show handle/bowl misalignment and contact with the bowl."],
      ["Books: basket pickup remains", [0.51, 0, 0.49, 0.236], "By Round 4, intervention around book pickup decreases substantially, while a prominent peak remains around basket pickup. This illustrates how corrections shift toward the updated policy’s remaining bottlenecks."],
      ["Mug: grasp and placement", [0.014, 0.239, 0.486, 0.25], "The annotated failures are a wrong grasp and a mug that is not on the rack. Red arrows point to corrected failures; green arrows identify successful behaviors at pickup and hanging."],
      ["Peg: grasp and insertion alignment", [0.51, 0.239, 0.49, 0.25], "The two annotated failure modes are a misaligned grasp and a misaligned insertion. The curves separate intervention over pickup and insertion progress across four correction rounds."],
      ["Popcorn: multiple correction stages", [0.014, 0.49, 0.486, 0.245], "Annotations identify misaligned popcorn, a misaligned microwave-handle grasp, and hitting the table. The sequence spans pickup, opening the microwave, placing popcorn, and closing the microwave."],
      ["Radio: navigation, grasp, button", [0.51, 0.49, 0.49, 0.245], "Corrections address hitting the table, a misaligned radio grasp, and missing the button. Episode progress separates navigation, radio pickup, and button pressing."],
      ["Strawberries: pickup and placement", [0.014, 0.736, 0.486, 0.24], "The simulation example shows failed grasp and stuck states across picking and placing the red and purple strawberries. Curves describe intervention rate along normalized episode progress."],
      ["Fridge: handle and radio alignment", [0.51, 0.736, 0.49, 0.24], "The annotated failures are missing the fridge handle and misalignment with the radio. The sequence covers opening the fridge, navigating, and placing the radio."]
    ],
    note: "Intervention rate (%) over normalized episode progress. Dotted, dash-dot, dashed, and solid orange curves indicate Rounds 1–4. Red arrows mark corrected failures; green arrows mark successful behavior.",
    panels: [
      ["Breakfast bowls", [0.014, 0, 0.486, 0.236]],
      ["Boxing books", [0.51, 0, 0.49, 0.236]],
      ["Mug hanging", [0.014, 0.239, 0.486, 0.25]],
      ["Peg insertion", [0.51, 0.239, 0.49, 0.25]],
      ["Microwave popcorn", [0.014, 0.49, 0.486, 0.245]],
      ["Turning on radio", [0.51, 0.49, 0.49, 0.245]],
      ["Strawberries", [0.014, 0.736, 0.486, 0.24]],
      ["Open fridge", [0.51, 0.736, 0.49, 0.24]],
      ["Round and annotation legend", [0, 0.976, 1, 0.024]]
    ]
  },
  "whole_body_takeover.png": {
    title: "Whole-body activation shares",
    source: [6, 6],
    hotspots: [
      ["Base corrections", [0.31, 0.01, 0.12, 0.105], "Base motion accounts for an average of 34.2% of body-part activation votes across the four real-world tasks. The JoyCon allows base corrections as part of a coordinated whole-body takeover."],
      ["Torso corrections", [0.44, 0.01, 0.13, 0.105], "Torso activation averages 8.2% in the three tasks where it occurs. Shares are 13.1% for Books, 3.8% for Breakfast, and 7.6% for Radio; Popcorn has no torso segment."],
      ["Left-arm corrections", [0.58, 0.01, 0.165, 0.105], "The actuated leader guides the left arm during takeover. Left-arm shares are 28.4% for Books, 37.9% for Popcorn, 36.5% for Breakfast, and 47.0% for Radio. Gripper activity is assigned to its respective arm."],
      ["Right-arm corrections", [0.75, 0.01, 0.19, 0.105], "Right-arm shares are 27.6% for Books, 19.8% for Popcorn, 31.7% for Breakfast, and 9.8% for Radio. Left- and right-arm use is more balanced in Books and Breakfast than in Radio and Popcorn."],
      ["Books activation breakdown", [0.26, 0.175, 0.71, 0.1], "Base 30.9% · Torso 13.1% · Left arm 28.4% · Right arm 27.6%. Each body part receives one vote per takeover segment after three consecutive active frames; multiple parts may contribute within one segment."],
      ["Popcorn activation breakdown", [0.26, 0.325, 0.71, 0.1], "Base 42.2% · Torso 0% · Left arm 37.9% · Right arm 19.8%. The printed shares total 99.9% because of rounding. These are activation-vote shares, not percentages of time."],
      ["Breakfast activation breakdown", [0.26, 0.475, 0.71, 0.1], "Base 27.9% · Torso 3.8% · Left arm 36.5% · Right arm 31.7%. The shares pool four rounds of 25 episodes, describing coordinated use of the base, torso, and both arms."],
      ["Radio activation breakdown", [0.26, 0.625, 0.71, 0.1], "Base 35.6% · Torso 7.6% · Left arm 47.0% · Right arm 9.8%. Radio corrections are more left-arm dominant than the Books and Breakfast tasks."]
    ],
    note: "Each body part receives one vote per takeover segment after three consecutive active frames. Shares are pooled over four 25-episode rounds.",
    panels: [
      ["Boxing books", [0, 0.16, 1, 0.15]],
      ["Microwave popcorn", [0, 0.31, 1, 0.15]],
      ["Breakfast bowls", [0, 0.46, 1, 0.15]],
      ["Turning on radio", [0, 0.61, 1, 0.14]]
    ],
    // Transcribed from the printed labels in whole_body_takeover.png (Fig. 6).
    // Printed rounding is preserved; values are not renormalized to 100%.
    activation: {
      series: ["Base", "Torso", "Left arm", "Right arm"],
      rows: [
        { label: "Boxing Books up for Storage", values: [30.9, 13.1, 28.4, 27.6] },
        { label: "Make Microwave Popcorn", values: [42.2, 0, 37.9, 19.8] },
        { label: "Prepare Make-Ahead Breakfast Bowls", values: [27.9, 3.8, 36.5, 31.7] },
        { label: "Turning on Radio", values: [35.6, 7.6, 47.0, 9.8] }
      ]
    }
  },
  "operator_study.png": {
    title: "Operator study on mug hanging",
    source: [7, 7],
    hotspots: [
      ["Operator 1", [0.24, 0.915, 0.17, 0.085], "Cumulative intervention share decreases from 16.1% in Round 1 to 11.8% by Round 3. The percentages accumulate timesteps across the operator’s collection history; they are not individual-round rates."],
      ["Operator 2", [0.415, 0.915, 0.17, 0.085], "Cumulative intervention share decreases from 34.6% to 19.9% across three rounds. Each operator collects 25 episodes per round, using their own iteratively updated policy."],
      ["Operator 3", [0.59, 0.915, 0.17, 0.085], "Cumulative intervention share decreases from 16.4% to 14.7% across three rounds. All three operators show declining cumulative intervention burden despite differing teleoperation experience."],
      ["Takeover-free episodes", [0.63, 0.115, 0.36, 0.66], "This panel counts cumulative episodes completed without a takeover. By Round 3, these account for 40–55% of each operator’s cumulative collection. The complete study contains 225 episodes: 3 operators × 3 rounds × 25 episodes."]
    ],
    note: "Each operator collects 25 episodes per round. Both panels show cumulative measurements across rounds, rather than individual-round rates.",
    panels: [
      ["Cumulative intervention share", [0, 0, 0.49, 0.905]],
      ["Cumulative takeover-free episodes", [0.52, 0, 0.48, 0.905]],
      ["Operator legend", [0.235, 0.915, 0.53, 0.085]]
    ]
  }
};
