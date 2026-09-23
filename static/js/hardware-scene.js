import * as THREE from './vendor/three/three.module.min.js';
import { OrbitControls } from './vendor/three/OrbitControls.js';
import { GLTFLoader } from './vendor/three/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt/meshopt_decoder.module.js';

const models = {
  r1pro: { title: 'R1 Pro JoyLo+', label: 'R1 Pro bimanual leaders', pose: [0, -20, 0, -50, 0, 0, 0],
    description: 'Explore both seven-joint leaders. Select an arm to move its joints independently.' },
  // CAD-relative home: upright upper arm, horizontal forearm, grip down.
  // These angles include the URDF's assembly offsets, not robot motor angles.
  franka: { title: 'Franka JoyLo+', label: 'Franka leader', pose: [0, 64.288, 60.965, 125.495, -25.481, -94.564, -45],
    description: 'Explore the seven-joint leader from its home position. Reset pose returns it home.' }
};

function assembleLeaders(source, key) {
  const assembly = new THREE.Group();
  if (key === 'r1pro') {
    // The source URDF describes the left leader. Reflect a second copy across
    // the sagittal plane; only transforms are cloned, so mesh buffers are shared.
    // Mount spacing and the connecting bar are illustrative, not calibrated CAD.
    const right = source.clone(true);
    source.position.x = -0.12;
    source.userData.arm = 'left';
    right.position.x = 0.12;
    right.scale.x = -1;
    right.userData.arm = 'right';
    assembly.add(source, right);
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.045),
      new THREE.MeshStandardMaterial({ color: 0x898780, metalness: 0.35, roughness: 0.65 }));
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

function disposeModel(model) {
  const geometries = new Set(), materials = new Set();
  model.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => materials.add(m));
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

export async function createHardwareViewer(root) {
  const host = root.querySelector('#hardware-canvas');
  const placeholder = root.querySelector('#hardware-placeholder');
  const status = root.querySelector('#hardware-status');
  const modelButtons = [...root.querySelectorAll('[data-model]')];
  const rotateButton = root.querySelector('[data-view="rotate"]');
  const jointControls = root.querySelector('#hardware-joint-controls');
  const armControls = root.querySelector('#hardware-arm-controls');
  const armButtons = [...armControls.querySelectorAll('[data-arm]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0xf8f6f3, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-describedby', 'hardware-help');
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x837466, 1.1));
  const keyLight = new THREE.DirectionalLight(0xfff3e7, 2.4);
  keyLight.position.set(2, 3, 4);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xdceeff, 0.8);
  fillLight.position.set(-3, 1, -2);
  scene.add(fillLight);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.001, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.autoRotateSpeed = 0.8;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let model, selected, joints = [], frame = 0, visible = true, printing = false;
  let busy = false, destroyed = false, fittedDistance = 1, previousTime = 0;
  const notice = document.createElement('p');
  notice.className = 'hardware-joint-note';
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  root.querySelector('#hardware-model-description').after(notice);

  function render() {
    if (!destroyed && !document.hidden && !printing && visible) renderer.render(scene, camera);
  }

  function animate(time) {
    frame = 0;
    if (destroyed || !controls.autoRotate || !visible || document.hidden || printing) return;
    controls.update(previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0);
    previousTime = time;
    render();
    frame = requestAnimationFrame(animate);
  }

  function syncAnimation() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    if (controls.autoRotate && visible && !document.hidden && !printing && !destroyed) frame = requestAnimationFrame(animate);
    render();
  }

  function stopRotation() {
    controls.autoRotate = false;
    rotateButton.setAttribute('aria-pressed', 'false');
    syncAnimation();
  }

  function fit() {
    if (!model) return;
    const bounds = new THREE.Box3().setFromObject(model);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const direction = selected === 'r1pro'
      ? new THREE.Vector3(0.35, 0.35, 1.5).normalize()
      : new THREE.Vector3(1, 0.45, 1.25).normalize();
    const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const horizontal = vertical * camera.aspect;
    // Project each part's box separately; a single world-aligned box adds large
    // empty corners around an articulated arm, especially on narrow screens.
    // Leave space above and below the model for the label and camera controls.
    fittedDistance = 0;
    model.traverse(part => {
      if (!part.geometry) return;
      if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
      const box = part.geometry.boundingBox;
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            const corner = new THREE.Vector3(x, y, z).applyMatrix4(part.matrixWorld).sub(sphere.center);
            fittedDistance = Math.max(fittedDistance,
              Math.abs(corner.dot(right)) / horizontal * 1.15 + corner.dot(direction),
              Math.abs(corner.dot(up)) / vertical * 1.4 + corner.dot(direction));
          }
        }
      }
    });
    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).add(direction.multiplyScalar(fittedDistance));
    camera.near = Math.max(sphere.radius / 100, 0.0001);
    camera.far = fittedDistance * 30;
    camera.updateProjectionMatrix();
    controls.minDistance = sphere.radius * 0.25;
    controls.maxDistance = fittedDistance * 5;
    controls.update();
    render();
  }

  function resize() {
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    fit();
  }

  function zoom(factor) {
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
    camera.position.copy(controls.target).add(offset);
    controls.update();
    render();
  }

  function setJoint(joint, degrees) {
    const radians = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(degrees), joint.lower, joint.upper);
    joint.node.quaternion.copy(joint.origin).multiply(new THREE.Quaternion().setFromAxisAngle(joint.axis, radians));
    joint.input.value = String(THREE.MathUtils.radToDeg(radians));
    const label = `${Math.round(THREE.MathUtils.radToDeg(radians))}°`;
    joint.output.value = label;
    joint.input.setAttribute('aria-valuetext', `${Math.round(THREE.MathUtils.radToDeg(radians))} degrees`);
    render();
  }

  function selectArm(arm) {
    armButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.arm === arm)));
    joints.forEach(joint => { joint.row.hidden = joint.arm !== arm; });
  }

  function buildJoints() {
    joints = [];
    model.children.filter(leader => leader.userData.arm).forEach(leader => {
      const armJoints = [];
      leader.traverse(node => {
        if (node.userData.joint) armJoints.push({ ...node.userData.joint, node,
          arm: leader.userData.arm, origin: node.quaternion.clone(),
          axis: new THREE.Vector3(...node.userData.joint.axis).normalize() });
      });
      armJoints.sort((a, b) => Number(a.name) - Number(b.name));
      armJoints.forEach((joint, index) => {
        joint.number = index + 1;
        joint.initial = models[selected].pose[index];
      });
      joints.push(...armJoints);
    });
    jointControls.replaceChildren();
    joints.forEach(joint => {
      const row = document.createElement('div');
      row.className = 'hardware-joint';
      const heading = document.createElement('div');
      heading.className = 'hardware-joint-heading';
      const label = document.createElement('label');
      label.htmlFor = `hardware-joint-${joint.arm}-${joint.number}`;
      label.textContent = `${joint.arm === 'single' ? '' : `${joint.arm === 'left' ? 'Left' : 'Right'} `}Joint ${joint.number}`;
      const output = document.createElement('output');
      output.htmlFor = label.htmlFor;
      const input = document.createElement('input');
      input.id = label.htmlFor;
      input.type = 'range';
      input.min = String(THREE.MathUtils.radToDeg(joint.lower));
      input.max = String(THREE.MathUtils.radToDeg(joint.upper));
      input.step = 'any';
      joint.input = input;
      joint.output = output;
      joint.row = row;
      input.addEventListener('input', () => { stopRotation(); setJoint(joint, Number(input.value)); });
      // An explicit degree step is predictable even when URDF limits are fractional.
      input.addEventListener('keydown', event => {
        const delta = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
        if (delta) { event.preventDefault(); stopRotation(); setJoint(joint, Number(input.value) + delta); }
      });
      heading.append(label, output);
      row.append(heading, input);
      jointControls.append(row);
      setJoint(joint, joint.initial);
    });
    armControls.hidden = selected !== 'r1pro';
    selectArm(selected === 'r1pro' ? 'left' : 'single');
  }

  async function selectModel(key) {
    if (busy || selected === key) return;
    const focusedButton = document.activeElement;
    busy = true;
    stopRotation();
    notice.hidden = true;
    root.setAttribute('aria-busy', 'true');
    modelButtons.forEach(button => { button.disabled = true; });
    placeholder.hidden = false;
    status.textContent = `Loading ${models[key].label}…`;
    try {
      const url = new URL(`../models/joylo-${key}.glb`, import.meta.url);
      const result = await loader.loadAsync(url.href, progress => {
        if (progress.total) status.textContent = `Loading ${models[key].label}… ${Math.round(progress.loaded / progress.total * 100)}%`;
      });
      if (destroyed) { disposeModel(result.scene); return; }
      if (model) { scene.remove(model); disposeModel(model); }
      model = assembleLeaders(result.scene, key);
      scene.add(model);
      selected = key;
      buildJoints();
      root.querySelector('#hardware-model-title').textContent = models[key].title;
      root.querySelector('#hardware-model-description').textContent = models[key].description;
      root.querySelector('#hardware-model-label').textContent = `${models[key].label} · ${joints.length} joints`;
      canvas.setAttribute('aria-label', `Interactive 3D model of the ${models[key].label}. Drag or use arrow keys to rotate.`);
      modelButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.model === key)));
      root.dataset.model = key;
      root.dataset.state = 'ready';
      root.querySelector('.hardware-models').hidden = false;
      root.querySelector('.hardware-camera-controls').hidden = false;
      root.querySelector('#hardware-joints').hidden = false;
      placeholder.hidden = true;
      notice.textContent = `${models[key].label} loaded. ${joints.length} joints available.`;
      fit();
    } catch (error) {
      if (!model) throw error;
      placeholder.hidden = true;
      notice.hidden = false;
      notice.textContent = `Could not load ${models[key].label}. ${models[selected].label} is still shown. Select the other configuration to try again.`;
    } finally {
      busy = false;
      root.setAttribute('aria-busy', 'false');
      modelButtons.forEach(button => { button.disabled = false; });
      if (modelButtons.includes(focusedButton) && document.activeElement === document.body) {
        focusedButton.focus({ preventScroll: true });
      }
    }
  }

  // Do not attach UI handlers or observers until the initial model succeeds.
  try {
    await selectModel('r1pro');
  } catch (error) {
    controls.dispose();
    renderer.dispose();
    notice.remove();
    throw error;
  }
  host.replaceChildren(canvas);
  resize();
  controls.addEventListener('change', render);
  controls.addEventListener('start', stopRotation);
  modelButtons.forEach(button => button.addEventListener('click', () => selectModel(button.dataset.model)));
  armButtons.forEach(button => button.addEventListener('click', () => selectArm(button.dataset.arm)));
  root.querySelector('#hardware-reset').addEventListener('click', () => {
    stopRotation();
    joints.forEach(joint => setJoint(joint, joint.initial));
    fit();
  });
  root.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    switch (button.dataset.view) {
      case 'in': zoom(0.8); break;
      case 'out': zoom(1.25); break;
      case 'fit': stopRotation(); fit(); break;
      case 'rotate':
        controls.autoRotate = !controls.autoRotate;
        rotateButton.setAttribute('aria-pressed', String(controls.autoRotate));
        syncAnimation();
        break;
    }
  }));
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0', 'Home'].includes(event.key)) return;
    event.preventDefault();
    stopRotation();
    if (event.key === '0' || event.key === 'Home') return fit();
    if (event.key === '+' || event.key === '=') return zoom(0.9);
    if (event.key === '-') return zoom(1.1);
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if (event.key === 'ArrowLeft') spherical.theta -= 0.1;
    if (event.key === 'ArrowRight') spherical.theta += 0.1;
    if (event.key === 'ArrowUp') spherical.phi -= 0.1;
    if (event.key === 'ArrowDown') spherical.phi += 0.1;
    spherical.makeSafe();
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    controls.update();
  });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    syncAnimation();
  });
  observer.observe(host);
  document.addEventListener('visibilitychange', syncAnimation);
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) stopRotation(); });
  // No motion starts automatically, including when reduced motion is requested.
  window.addEventListener('beforeprint', () => { printing = true; syncAnimation(); });
  window.addEventListener('afterprint', () => { printing = false; resize(); syncAnimation(); });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    stopRotation();
    placeholder.hidden = false;
    status.textContent = 'The 3D view was interrupted. Waiting for graphics to recover; the hardware overview and downloads remain available below.';
  });
  canvas.addEventListener('webglcontextrestored', () => { placeholder.hidden = true; render(); });
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    destroyed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    resizeObserver.disconnect();
    controls.dispose();
    disposeModel(model);
    renderer.dispose();
  });
}
