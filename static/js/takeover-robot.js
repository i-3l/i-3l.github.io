// 3D R1 Pro pose beside the takeover video. Loaded on demand by takeovers.js; renders only when the
// displayed frame changes or the view is dragged, so it costs nothing while paused or off screen.
import * as THREE from './vendor/three/three.module.min.js';
import { OrbitControls } from './vendor/three/OrbitControls.js';
import { GLTFLoader } from './vendor/three/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt/meshopt_decoder.module.js';
import { createLeaderInset } from './takeover-joylo.js?v=6';

// Column order of the joint tracks written by scripts/export_takeovers.py.
const COLUMNS = [
  'torso_link1', 'torso_link2', 'torso_link3', 'torso_link4',
  'left_arm_link1', 'left_arm_link2', 'left_arm_link3', 'left_arm_link4', 'left_arm_link5', 'left_arm_link6', 'left_arm_link7',
  'right_arm_link1', 'right_arm_link2', 'right_arm_link3', 'right_arm_link4', 'right_arm_link5', 'right_arm_link6', 'right_arm_link7',
];
const FINGERS = [['left_gripper_finger_link1', 'left_gripper_finger_link2'], ['right_gripper_finger_link1', 'right_gripper_finger_link2']];
const HOME = new THREE.Vector3(2.6, 1.75, 2.75);
// Aimed a little ahead of the robot so fully extended arms stay inside the panel.
const TARGET = new THREE.Vector3(0.35, 0.95, 0);

export async function createRobotView(host, { modelUrl, leaderUrl, policyColor, takeoverColor }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f85, 1.4));
  const keyLight = new THREE.DirectionalLight(0xfff3e7, 2.0);
  keyLight.position.set(2, 3, 2.5);
  const fillLight = new THREE.DirectionalLight(0xdceeff, 0.7);
  fillLight.position.set(-3, 1.5, -2);
  scene.add(keyLight, fillLight);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.target.copy(TARGET);

  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48),
    new THREE.MeshBasicMaterial({ color: policyColor, transparent: true, opacity: 0.35 }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.002;
  scene.add(disc);

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(modelUrl);
  const robot = gltf.scene;
  // The CAD meshes ship without normals (they were unreliable); shade per face and light both sides.
  robot.traverse(node => {
    if (node.material) { node.material.flatShading = true; node.material.side = THREE.DoubleSide; node.material.needsUpdate = true; }
  });
  scene.add(robot);
  const joints = {};
  robot.traverse(node => {
    const spec = node.userData.joint;
    if (spec) joints[node.name] = { node, type: spec.type, axis: new THREE.Vector3(...spec.axis).normalize(),
      origin: node.quaternion.clone(), position: node.position.clone() };
  });
  for (const name of [...COLUMNS, ...FINGERS.flat()]) if (!joints[name]) throw new Error(`Robot model is missing joint ${name}`);

  let track = null, columns = 0, scale = 1, frame = -1, rendered = false, visible = true;
  let leader = null, taskVersion = 0;
  const bodyOrientation = new THREE.Quaternion();
  const resetButton = host.querySelector('.takeover-robot-reset');
  const leaderHost = host.querySelector('.takeover-leader');
  const leaderStatus = leaderHost.querySelector('.takeover-leader-status');

  function render() {
    if (!visible || document.hidden) { rendered = false; return; }
    renderer.setViewport(0, 0, host.clientWidth, host.clientHeight);
    renderer.render(scene, camera);
    if (leader && track) {
      joints.torso_link4.node.getWorldQuaternion(bodyOrientation);
      leader.render(renderer, camera, bodyOrientation);
    }
    rendered = true;
  }
  function setJoint(joint, value) {
    if (joint.type === 'revolute') joint.node.quaternion.copy(joint.origin).multiply(new THREE.Quaternion().setFromAxisAngle(joint.axis, value));
    else joint.node.position.copy(joint.position).addScaledVector(joint.axis, value);
  }
  function pose(index) {
    const row = index * columns;
    for (let i = 0; i < COLUMNS.length; i++) setJoint(joints[COLUMNS[i]], track[row + i] / scale);
    FINGERS.forEach((pair, i) => pair.forEach(name => setJoint(joints[name], track[row + COLUMNS.length + i] / scale)));
    if (leader) leader.pose(track, row, scale);
    leaderHost.dataset.frame = String(index);
  }
  function resize() {
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (leader) leader.resize(host);
    render();
  }
  function resetView() {
    camera.position.copy(HOME);
    controls.target.copy(TARGET);
    controls.update();
    resetButton.hidden = true;
    render();
  }
  controls.addEventListener('change', () => { resetButton.hidden = false; render(); });
  resetButton.addEventListener('click', resetView);
  new ResizeObserver(resize).observe(host);
  resetView();

  // The main robot and video stay usable if this optional model is unavailable.
  leaderHost.hidden = false;
  createLeaderInset(leaderHost.querySelector('.takeover-leader-viewport'), loader, leaderUrl).then(view => {
    leader = view;
    leaderHost.dataset.state = 'ready';
    if (track && frame >= 0) pose(frame);
    resize();
  }).catch(error => {
    leaderHost.dataset.state = 'error';
    leaderHost.hidden = true;
    console.warn('JoyLo+ pose preview unavailable:', error);
  });

  return {
    // Load a task's Int16 joint track; returns once the robot can be posed.
    async setTask(task) {
      const version = ++taskVersion;
      track = null;
      frame = -1;
      leaderHost.hidden = true;
      leaderHost.dataset.frame = '';
      const spec = task.joints;
      const response = await fetch(spec.file);
      if (!response.ok) throw new Error('Joint track could not be loaded');
      const buffer = await response.arrayBuffer();
      if (version !== taskVersion) return;
      if (spec.columns !== 20 || !(spec.scale > 0) || buffer.byteLength !== task.frames * spec.columns * 2) {
        throw new Error('Invalid joint track');
      }
      track = new Int16Array(buffer);
      columns = spec.columns;
      scale = spec.scale;
      leaderHost.dataset.task = task.key;
      leaderHost.hidden = leaderHost.dataset.state === 'error';
      if (leader) leader.resize(host);
    },
    update(index, takeover) {
      disc.material.color.set(takeover ? takeoverColor : policyColor);
      leaderHost.classList.toggle('is-takeover', takeover);
      leaderStatus.textContent = takeover ? 'Takeover' : 'Policy';
      leaderHost.setAttribute('aria-label', `JoyLo+ pose preview from recorded robot-arm joints: ${takeover ? 'human takeover' : 'policy control'}`);
      if (track && index !== frame && (index + 1) * columns <= track.length) { frame = index; pose(index); }
      render();
    },
    setVisible(on) {
      visible = on;
      if (on && !rendered) render();
    },
  };
}
