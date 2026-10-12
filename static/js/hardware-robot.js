import * as THREE from './vendor/three/three.module.min.js';
import { frankaRobotAngle } from './franka-joint-map.js';

// Inverse of the robot-to-leader mapping used by the takeover illustration.
const ARM_SIGNS = {
  left: [1, -1, -1, 1, -1, -1, 1],
  right: [1, 1, 1, 1, 1, 1, -1],
};

export async function createHardwareRobot(loader, url, model) {
  const { scene: robot } = await loader.loadAsync(url);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8f6f3);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f85, 1.4));
  const key = new THREE.DirectionalLight(0xfff3e7, 2);
  key.position.set(2, 3, 2.5);
  const fill = new THREE.DirectionalLight(0xdceeff, 0.7);
  fill.position.set(-3, 1.5, -2);
  scene.add(key, fill);
  // Robot +X forward / -Z left -> leader -Z forward / -X left.
  // The upright Franka CAD extends along +X; R1 leaders face -Z.
  robot.rotation.y = model === 'franka' ? 0 : Math.PI / 2;
  scene.add(robot);
  const joints = {};
  robot.traverse(node => {
    if (node.material && model === 'r1pro') {
      node.material.flatShading = true;
      node.material.side = THREE.DoubleSide;
      node.material.needsUpdate = true;
    }
    if (node.userData.joint) joints[node.name] = {
      node, origin: node.quaternion.clone(), lower: node.userData.joint.lower, upper: node.userData.joint.upper,
      axis: new THREE.Vector3(...node.userData.joint.axis).normalize(),
    };
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(model === 'r1pro' ? 0.62 : 0.28, 48),
    new THREE.MeshBasicMaterial({ color: 0x5d7fb5, transparent: true, opacity: 0.25 }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.002;
  scene.add(disc);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  const rotation = new THREE.Quaternion();
  const bounds = new THREE.Box3(), center = new THREE.Vector3();
  const corner = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  let viewport = null;

  return {
    setJoint(arm, number, radians) {
      const joint = joints[model === 'franka' ? `panda_joint${number}` : `${arm}_arm_link${number}`];
      if (!joint) return;
      const angle = model === 'franka'
        ? frankaRobotAngle(number - 1, radians)
        : radians * ARM_SIGNS[arm][number - 1];
      joint.node.quaternion.copy(joint.origin).multiply(
        rotation.setFromAxisAngle(joint.axis, angle));
    },
    resize(panel, host) {
      const parent = panel.getBoundingClientRect(), rect = host.getBoundingClientRect();
      viewport = { x: rect.left - parent.left, y: parent.bottom - rect.bottom,
        width: rect.width, height: rect.height };
    },
    render(renderer, deviceCamera) {
      if (!viewport?.width || !viewport.height) return;
      const { x, y, width, height } = viewport;
      deviceCamera.getWorldQuaternion(camera.quaternion);
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      bounds.setFromObject(robot).getCenter(center);
      // Fit the articulated geometry in this view, even at the slider limits.
      let halfHeight = 0.1;
      robot.traverse(part => {
        if (!part.geometry) return;
        if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
        const box = part.geometry.boundingBox;
        for (const px of [box.min.x, box.max.x]) for (const py of [box.min.y, box.max.y]) for (const pz of [box.min.z, box.max.z]) {
          corner.set(px, py, pz).applyMatrix4(part.matrixWorld).sub(center);
          halfHeight = Math.max(halfHeight, Math.abs(corner.dot(up)), Math.abs(corner.dot(right)) * height / width);
        }
      });
      camera.top = halfHeight * 1.1;
      camera.bottom = -camera.top;
      camera.right = camera.top * width / height;
      camera.left = -camera.right;
      camera.updateProjectionMatrix();
      camera.position.set(0, 0, 4).applyQuaternion(camera.quaternion).add(center);
      renderer.setViewport(x, y, width, height);
      renderer.setScissor(x, y, width, height);
      renderer.setScissorTest(true);
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
    },
    dispose() {
      const geometries = new Set(), materials = new Set(), textures = new Set();
      scene.traverse(node => {
        if (node.geometry) geometries.add(node.geometry);
        for (const material of node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : []) {
          materials.add(material);
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
      geometries.forEach(value => value.dispose());
      materials.forEach(value => value.dispose());
      textures.forEach(value => value.dispose());
    },
  };
}
