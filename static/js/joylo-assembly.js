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
    // The GLB colors the left leader's Joy-Con purple; the right one is yellow.
    let yellow;
    right.traverse(node => {
      if (!node.isMesh || !/^switch_control_r_updated__(15|18)$/.test(node.name)) return;
      yellow ??= Object.assign(node.material.clone(), { name: 'joycon_right' });
      yellow.color.set(0xf2b01e);
      node.material = yellow;
    });
    assembly.add(source, right);
    // Fit the bar into both L-shaped brackets: their inner side flanges are
    // 0.0305 m beyond each leader origin, and their rear plates lie at Z=0.04025 m.
    const halfSpan = leaderOffset + 0.0305, depth = 0.045;
    const mount = new THREE.Mesh(new THREE.BoxGeometry(halfSpan * 2, 0.05, depth),
      new THREE.MeshStandardMaterial({ color: 0x898780, metalness: 0.35, roughness: 0.65 }));
    mount.position.z = 0.04025 + depth / 2;
    assembly.add(mount);
  } else {
    // The exported tree roots the arm at the rotating shoulder and puts the
    // fixed mounting bracket below joint 0. Re-root it at that bracket so
    // joint 0 turns the entire arm, with the inverse joint transform.
    const yaw = source.getObjectByName('joint_0');
    const shoulder = yaw.parent, root = shoulder.parent, bracket = yaw.children[0];
    yaw.updateMatrix();
    const origin = yaw.matrix.clone();
    shoulder.remove(yaw);
    yaw.remove(bracket);
    root.remove(shoulder);
    root.add(bracket);
    origin.decompose(bracket.position, bracket.quaternion, bracket.scale);
    bracket.add(yaw);
    yaw.position.set(0, 0, 0);
    yaw.quaternion.identity();
    yaw.scale.set(1, 1, 1);
    yaw.userData.joint = { ...yaw.userData.joint, axis: yaw.userData.joint.axis.map(value => -value) };
    yaw.add(shoulder);
    origin.invert().decompose(shoulder.position, shoulder.quaternion, shoulder.scale);
    // Franka's CAD is X-up; the GLB export already applies the URDF Z-up
    // conversion. Rotate its remaining +X axis onto the viewer's +Y axis.
    source.rotation.z = Math.PI / 2;
    source.userData.arm = 'single';
    assembly.add(source);
  }
  return assembly;
}
