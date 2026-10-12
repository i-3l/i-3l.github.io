// CAD -> Panda joint coordinates, derived by aligning the successive joint
// axes after rooting the CAD at its stationary bracket. Angles are radians.
// These are model assembly offsets, not encoder signs or motor calibration.
export const FRANKA_SIGNS = [-1, -1, -1, -1, -1, 1, -1];
const OFFSETS = [1.95285, 64.28778, 59.01079, 35.50031, -25.48125, 184.56404, 0]
  .map(degrees => degrees * Math.PI / 180);
// Limits from the bundled Panda model. Restrict the controls to the shared
// range so the robot cannot silently stop while the CAD continues to move.
const LOWER = [-2.9671, -1.8326, -2.9671, -3.1416, -2.9671, -0.0873, -2.9671];
const UPPER = [2.9671, 1.8326, 2.9671, 0, 2.9671, 3.8223, 2.9671];

export function frankaRobotAngle(index, cadAngle) {
  return FRANKA_SIGNS[index] * cadAngle + OFFSETS[index];
}

export function frankaCadLimits(index, lower, upper) {
  const a = (LOWER[index] - OFFSETS[index]) / FRANKA_SIGNS[index];
  const b = (UPPER[index] - OFFSETS[index]) / FRANKA_SIGNS[index];
  return { lower: Math.max(lower, Math.min(a, b)), upper: Math.min(upper, Math.max(a, b)) };
}
