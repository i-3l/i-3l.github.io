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
// JoyLo+ faces -Z with its left leader on -X; the robot faces +X with its left arm on -Z.
const CAD_TO_ROBOT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

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
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 5);
  const bounds = new THREE.Box3();
  const right = new THREE.Vector3(), up = new THREE.Vector3(), corner = new THREE.Vector3();
  const target = new THREE.Vector3();
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
    },
    render(renderer, robotCamera, bodyOrientation) {
      if (!viewport || !viewport.width || !viewport.height) return;
      // Follow the robot's upper body as well as the shared orbit view. Only
      // orientation is shared; the inset keeps its own centered framing/scale.
      leaders.quaternion.copy(bodyOrientation).multiply(CAD_TO_ROBOT);
      robotCamera.getWorldQuaternion(camera.quaternion);
      bounds.setFromObject(leaders).getCenter(target);
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      // Fill the inset with the actual pose rather than a large all-poses box.
      // Fit projected part bounds so orbiting and fully extended arms stay visible.
      let halfHeight = 0.08;
      leaders.traverse(part => {
        if (!part.geometry) return;
        if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
        const box = part.geometry.boundingBox;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          corner.set(x, y, z).applyMatrix4(part.matrixWorld).sub(target);
          halfHeight = Math.max(halfHeight, Math.abs(corner.dot(up)), Math.abs(corner.dot(right)) * viewport.height / viewport.width);
        }
      });
      camera.top = halfHeight * 1.08;
      camera.bottom = -camera.top;
      camera.right = camera.top * viewport.width / viewport.height;
      camera.left = -camera.right;
      camera.updateProjectionMatrix();
      camera.position.set(0, 0, 1.5).applyQuaternion(camera.quaternion).add(target);
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
