import * as THREE from './vendor/three/three.module.min.js';

// Shared geometry for the hardware explorer and the episode pose inset.
export function assembleLeaders(source, key) {
  const assembly = new THREE.Group();
  if (key === 'r1pro') {
    // The source URDF describes the left leader. Reflect a second copy across
    // the sagittal plane; only transforms are cloned, so mesh buffers are shared.
    // Mount spacing and the connecting bar are illustrative, not calibrated CAD.
    const right = source.clone(true);
    const leaderOffset = 0.12;
    source.position.x = -leaderOffset;
    source.userData.arm = 'left';
    right.position.x = leaderOffset;
    right.scale.x = -1;
    right.userData.arm = 'right';
    assembly.add(source, right);
    // Fit the bar into both L-shaped brackets: their inner side flanges are
    // 0.0305 m beyond each leader origin, and their rear plates lie at Z=0.04025 m.
    const halfSpan = leaderOffset + 0.0305, depth = 0.045;
    const mount = new THREE.Mesh(new THREE.BoxGeometry(halfSpan * 2, 0.05, depth),
      new THREE.MeshStandardMaterial({ color: 0x898780, metalness: 0.35, roughness: 0.65 }));
    mount.position.z = 0.04025 + depth / 2;
    assembly.add(mount);
  } else {
    // Franka's CAD is X-up; the GLB export already applies the URDF Z-up
    // conversion. Rotate its remaining +X axis onto the viewer's +Y axis.
    source.rotation.z = Math.PI / 2;
    source.userData.arm = 'single';
    assembly.add(source);
  }
  return assembly;
}
