import * as THREE from './vendor/three/three.module.min.js';
import { assembleLeaders } from './joylo-assembly.js';

// Robot-space angles -> left-source CAD angles. The controller's encoder signs
// are [1,-1,-1,1,-1,-1,1] on the left and [-1,-1,-1,-1,-1,-1,1] on the right.
// The right leader uses a reflected left-arm URDF, so negate its encoder angles
// once more (the same conversion used by the bilateral gravity model).
const ARMS = [
  { name: 'left', column: 4, signs: [1, -1, -1, 1, -1, -1, 1] },
  { name: 'right', column: 11, signs: [1, 1, 1, 1, 1, 1, -1] },
];

export async function createLeaderInset(host, loader, modelUrl) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8f6f3);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x837466, 1.3));
  const key = new THREE.DirectionalLight(0xfff3e7, 2.4);
  key.position.set(2, 3, 4);
  const fill = new THREE.DirectionalLight(0xdceeff, 0.8);
  fill.position.set(-3, 1, -2);
  scene.add(key, fill);
  const gltf = await loader.loadAsync(modelUrl);
  const leaders = assembleLeaders(gltf.scene, 'r1pro');
  scene.add(leaders);
  const arms = ARMS.map(spec => {
    const source = leaders.children.find(node => node.userData.arm === spec.name);
    const joints = [];
    source.traverse(node => {
      if (node.userData.joint) joints[Number(node.userData.joint.name)] = {
        node, origin: node.quaternion.clone(),
        axis: new THREE.Vector3(...node.userData.joint.axis).normalize(),
      };
    });
    if (joints.length !== 7 || Array.from(joints).some(joint => !joint)) {
      throw new Error(`JoyLo+ model is missing ${spec.name} arm joints`);
    }
    return { ...spec, joints };
  });
  // Fixed framing avoids camera motion as the arms move. Orbiting the R1 view
  // leaves this small front view in place, like a picture-in-picture video.
  const halfHeight = 0.32;
  const camera = new THREE.OrthographicCamera(-0.43, 0.43, halfHeight, -halfHeight, 0.01, 5);
  camera.position.set(0.36, 0.25, 1.1);
  camera.lookAt(0.04, -0.10, 0);
  const rotation = new THREE.Quaternion();
  let viewport = null;

  return {
    pose(track, row, scale) {
      for (const arm of arms) arm.joints.forEach((joint, index) => {
        const angle = track[row + arm.column + index] / scale * arm.signs[index];
        joint.node.quaternion.copy(joint.origin).multiply(rotation.setFromAxisAngle(joint.axis, angle));
      });
    },
    resize(panel) {
      const parent = panel.getBoundingClientRect();
      const bounds = host.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      viewport = { x: bounds.left - parent.left, y: parent.bottom - bounds.bottom,
        width: bounds.width, height: bounds.height };
      camera.left = -halfHeight * bounds.width / bounds.height;
      camera.right = -camera.left;
      camera.updateProjectionMatrix();
    },
    render(renderer) {
      if (!viewport || !viewport.width || !viewport.height) return;
      const { x, y, width, height } = viewport;
      // Share the R1 renderer and frame clock; no second WebGL context or loop.
      renderer.setViewport(x, y, width, height);
      renderer.setScissor(x, y, width, height);
      renderer.setScissorTest(true);
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
    },
  };
}
