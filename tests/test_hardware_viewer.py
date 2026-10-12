"""Exercise the real local CAD models, renderer, controls, and fallbacks."""
import functools
import os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import threading
import unittest

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class HardwareViewerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}/'
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(
            executable_path=os.environ.get('I3L_CHROME'), headless=True,
            args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1440, 'height': 1000})
        self.context.route('**/*', lambda r: r.continue_() if r.request.url.startswith(self.url) else r.abort())
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def load(self):
        self.page.goto(self.url + '#hardware')
        expect(self.page.locator('#hardware-viewer')).to_have_attribute('data-state', 'ready', timeout=30000)
        return self.page.locator('#hardware-canvas canvas')

    def test_lazy_loading_models_articulation_and_reset(self):
        requested = []
        self.page.on('request', lambda r: requested.append(r.url))
        self.page.set_viewport_size({'width': 1440, 'height': 650})
        self.page.goto(self.url, wait_until='networkidle')
        self.assertFalse(any('.glb' in url or 'hardware-scene' in url for url in requested))
        self.page.get_by_role('link', name='Hardware', exact=True).click()
        expect(self.page.locator('#hardware-viewer')).to_have_attribute('data-state', 'ready', timeout=30000)
        canvas = self.page.locator('#hardware-canvas canvas')
        self.assertFalse(any('joylo-franka.glb' in url for url in requested))
        for model in ['r1pro', 'franka']:
            self.page.locator(f'button[data-model="{model}"]').click()
            expect(self.page.locator('#hardware-viewer')).to_have_attribute('data-model', model, timeout=30000)
            inputs = self.page.locator('#hardware-joint-controls input')
            self.assertEqual(inputs.count(), 14 if model == 'r1pro' else 7)
            initial = inputs.evaluate_all('(nodes) => nodes.map(n => n.value)')
            before = canvas.screenshot()
            # Joint 4 moves the distal assembly; this must change actual rendered pixels.
            inputs.nth(3).evaluate('(n) => { n.value = (Number(n.min) + Number(n.max))/2; n.dispatchEvent(new Event("input")); }')
            self.assertNotEqual(before, canvas.screenshot())
            self.page.get_by_role('button', name='Reset pose', exact=True).click()
            self.assertEqual(initial, inputs.evaluate_all('(nodes) => nodes.map(n => n.value)'))
            # Every range is keyboard operable and bounded by the source limits.
            for index in range(inputs.count()):
                if model == 'r1pro':
                    self.page.get_by_role('button', name='Left arm' if index < 7 else 'Right arm', exact=True).click()
                slider = inputs.nth(index)
                slider.focus()
                slider.press('Home')
                minimum = float(slider.get_attribute('min'))
                self.assertAlmostEqual(float(slider.input_value()), minimum, places=5)
                slider.press('ArrowRight')
                self.assertAlmostEqual(float(slider.input_value()), minimum + 1, places=5)
                slider.press('End')
                self.assertAlmostEqual(float(slider.input_value()), float(slider.get_attribute('max')), places=5)
                slider.press('ArrowRight')
                self.assertLessEqual(float(slider.input_value()), float(slider.get_attribute('max')) + 1e-8)
            self.page.get_by_role('button', name='Reset pose', exact=True).click()
        with self.page.expect_download() as info:
            self.page.locator('.hardware-downloads a').last.click()
        self.assertEqual(info.value.suggested_filename, 'joylo-franka.glb')
        self.assertEqual(Path(info.value.path()).read_bytes()[:4], b'glTF')

    def test_bimanual_arms_move_independently_and_reset_together(self):
        canvas = self.load()
        expect(self.page.locator('#hardware-model-label')).to_contain_text('14 joints')
        inputs = self.page.locator('#hardware-joint-controls input')
        initial = inputs.evaluate_all('(nodes) => nodes.map(n => n.value)')
        for arm, offset in [('Left', 0), ('Right', 7)]:
            before_values = inputs.evaluate_all('(nodes) => nodes.map(n => n.value)')
            before_image = canvas.screenshot()
            self.page.get_by_role('button', name=f'{arm} arm', exact=True).click()
            expect(self.page.locator('#hardware-joint-controls').get_by_role('slider')).to_have_count(7)
            self.page.get_by_label(f'{arm} Joint 4', exact=True).evaluate(
                '(n) => { n.value = -85; n.dispatchEvent(new Event("input")); }')
            self.assertNotEqual(before_image, canvas.screenshot())
            after_values = inputs.evaluate_all('(nodes) => nodes.map(n => n.value)')
            changed = [i for i in range(14) if before_values[i] != after_values[i]]
            self.assertEqual(changed, [offset + 3])
        self.page.get_by_role('button', name='Reset pose', exact=True).click()
        self.assertEqual(initial, inputs.evaluate_all('(nodes) => nodes.map(n => n.value)'))
        # Switching configurations must rebuild both independent joint trees.
        self.page.get_by_role('button', name='Franka leader', exact=True).click()
        expect(self.page.locator('#hardware-viewer')).to_have_attribute('data-model', 'franka', timeout=30000)
        expect(self.page.locator('#hardware-arm-controls')).to_be_hidden()
        self.page.get_by_role('button', name='R1 Pro bimanual', exact=True).click()
        expect(self.page.locator('#hardware-viewer')).to_have_attribute('data-model', 'r1pro', timeout=30000)
        expect(self.page.get_by_role('button', name='Left arm', exact=True)).to_have_attribute('aria-pressed', 'true')
        self.assertEqual(initial, inputs.evaluate_all('(nodes) => nodes.map(n => n.value)'))

    def test_crossbar_contacts_both_mounting_corners(self):
        # Expose assembly only in the test response; use the shipped CAD meshes
        # to measure physical contact, independently of the bar's dimensions.
        source = (ROOT / 'static/js/hardware-scene.js').read_text()
        self.page.route('**/hardware-scene.js', lambda route: route.fulfill(
            body=source + '\nexport { assembleLeaders };', content_type='text/javascript'))
        self.page.goto(self.url)
        contacts = self.page.evaluate('''async () => {
            const THREE = await import('/static/js/vendor/three/three.module.min.js');
            const { GLTFLoader } = await import('/static/js/vendor/three/GLTFLoader.js');
            const { MeshoptDecoder } = await import('/static/js/vendor/meshopt/meshopt_decoder.module.js');
            const { assembleLeaders } = await import('/static/js/hardware-scene.js');
            const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
            const { scene } = await loader.loadAsync('/static/models/joylo-r1pro.glb');
            const model = assembleLeaders(scene, 'r1pro');
            model.updateMatrixWorld(true);
            const bar = new THREE.Box3().setFromObject(model.children.find(node => node.isMesh));
            const contacts = [], inset = 0.01;
            for (const leader of model.children.filter(node => node.userData.arm)) {
                const side = leader.userData.arm === 'left' ? -1 : 1;
                const end = side < 0 ? bar.min.x : bar.max.x;
                const origin = new THREE.Vector3(end - side * inset, 0, bar.min.z + inset);
                const bracket = leader.getObjectByName('1');
                for (const [face, direction] of [
                    ['rear plate', new THREE.Vector3(0, 0, -1)],
                    ['side flange', new THREE.Vector3(side, 0, 0)]
                ]) {
                    const hit = new THREE.Raycaster(origin, direction).intersectObject(bracket, true)[0];
                    contacts.push({ arm: leader.userData.arm, face, gap: hit ? hit.distance - inset : null });
                }
            }
            return contacts;
        }''')
        self.assertEqual(len(contacts), 4)
        for contact in contacts:
            with self.subTest(arm=contact['arm'], face=contact['face']):
                self.assertIsNotNone(contact['gap'], 'Bar misses the mounting face')
                # Ten micrometres allow for the exported mesh quantization.
                self.assertAlmostEqual(contact['gap'], 0, delta=0.00001)

    def test_orbit_zoom_keyboard_rotation_and_print(self):
        self.page.emulate_media(reduced_motion='reduce')
        canvas = self.load()
        rotate = self.page.get_by_role('button', name='Auto-rotate', exact=True)
        expect(rotate).to_have_attribute('aria-pressed', 'false')
        canvas.focus()
        before = canvas.screenshot()
        canvas.press('ArrowLeft')
        orbited = canvas.screenshot()
        self.assertNotEqual(before, orbited)
        canvas.press('0')
        self.assertNotEqual(orbited, canvas.screenshot())
        self.page.get_by_role('button', name='Zoom in', exact=True).click()
        self.assertNotEqual(before, canvas.screenshot())
        self.page.get_by_role('button', name='Fit view', exact=True).click()
        rotate.click()
        expect(rotate).to_have_attribute('aria-pressed', 'true')
        self.page.get_by_role('button', name='Reset pose', exact=True).click()
        expect(rotate).to_have_attribute('aria-pressed', 'false')
        self.page.emulate_media(media='print')
        expect(self.page.locator('#hardware-viewer')).not_to_be_visible()
        expect(self.page.locator('img[src$="hardware.jpeg"]')).to_be_visible()

    def test_mobile_touch_and_resize(self):
        self.page.set_viewport_size({'width': 390, 'height': 844})
        canvas = self.load()
        self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        canvas.scroll_into_view_if_needed()
        before = canvas.screenshot()
        rect = canvas.bounding_box()
        x, y = rect['x'] + rect['width']/2, rect['y'] + rect['height']/2
        cdp = self.context.new_cdp_session(self.page)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x+65, 'y': y+20}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        self.assertNotEqual(before, canvas.screenshot())
        before = canvas.screenshot()
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x-25, 'y': y}, {'x': x+25, 'y': y}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x-50, 'y': y}, {'x': x+50, 'y': y}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        self.assertNotEqual(before, canvas.screenshot())
        self.page.locator('#hardware-viewer').screenshot(path='/tmp/i3l-hardware-mobile.png')
        self.page.set_viewport_size({'width': 1200, 'height': 900})
        self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        expect(canvas).to_be_visible()

    def test_robot_preview_follows_joints_orbit_and_configuration(self):
        # Observe the real render calls without adding a debug API to the site.
        for module, name in [('hardware-scene.js', 'device'), ('hardware-robot.js', 'robot')]:
            source = (ROOT / 'static/js' / module).read_text().replace(
                'renderer.render(scene, camera);',
                f'window.__{name}View = {{ scene, camera }}; renderer.render(scene, camera);')
            self.page.route(f'**/{module}*', functools.partial(
                lambda source, route: route.fulfill(body=source, content_type='text/javascript'), source))
        canvas = self.load()
        inset = self.page.locator('.hardware-robot')
        viewport = inset.locator('.hardware-robot-viewport')
        for model in ['r1pro', 'franka', 'r1pro']:
            self.page.locator(f'button[data-model="{model}"]').click()
            expect(inset).to_have_attribute('data-model', model)
            expect(inset).to_have_attribute('data-state', 'ready', timeout=30000)
            expect(self.page.locator('#hardware-canvas canvas')).to_have_count(1)
            initial = viewport.screenshot()
            for arm in (['Left', 'Right'] if model == 'r1pro' else ['']):
                if arm:
                    self.page.get_by_role('button', name=f'{arm} arm', exact=True).click()
                before = viewport.screenshot()
                self.page.get_by_label(f'{arm + " " if arm else ""}Joint 4', exact=True).evaluate(
                    '(n) => { n.value = Number(n.value) - 25; n.dispatchEvent(new Event("input")); }')
                self.assertNotEqual(before, viewport.screenshot())
            self.page.get_by_role('button', name='Reset pose', exact=True).click()
            self.assertEqual(initial, viewport.screenshot())
            canvas.focus()
            canvas.press('ArrowLeft')
            self.assertNotEqual(initial, viewport.screenshot())
            self.assertGreater(self.page.evaluate('''() => {
                const a = window.__deviceView.camera.quaternion;
                const b = window.__robotView.camera.quaternion;
                return Math.abs(a.dot(b));
            }'''), 0.999999)
            self.page.get_by_role('button', name='Fit view', exact=True).click()
            self.assertEqual(initial, viewport.screenshot())
        for width in [320, 390, 768, 1440]:
            self.page.set_viewport_size({'width': width, 'height': 900})
            for model in ['r1pro', 'franka']:
                self.page.locator(f'button[data-model="{model}"]').click()
                expect(inset).to_have_attribute('data-model', model)
                expect(inset).to_have_attribute('data-state', 'ready')
                stage = self.page.locator('.hardware-stage').bounding_box()
                tabs = self.page.locator('.hardware-models').bounding_box()
                box = inset.bounding_box()
                self.assertGreaterEqual(tabs['x'], stage['x'] + stage['width'] / 2)
                self.assertLess(tabs['y'] - stage['y'], 15)
                self.assertLess(abs(stage['x'] + stage['width'] - box['x'] - box['width']), 12)
                self.assertLess(abs(stage['y'] + stage['height'] - box['y'] - box['height']), 12)
                toolbar = self.page.locator('.hardware-camera-controls').bounding_box()
                self.assertGreaterEqual(toolbar['x'], stage['x'])
                self.assertGreaterEqual(toolbar['y'], stage['y'])
                self.assertLessEqual(toolbar['x'] + toolbar['width'], box['x'])
                self.assertLessEqual(toolbar['y'] + toolbar['height'], stage['y'] + stage['height'])
                self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))

    def test_robot_preview_failure_keeps_controls_usable_and_retries(self):
        self.page.route('**/models/r1pro.glb', lambda r: r.abort())
        self.load()
        inset = self.page.locator('.hardware-robot')
        expect(inset).to_have_attribute('data-state', 'error')
        expect(inset).to_be_hidden()
        self.page.get_by_label('Left Joint 4', exact=True).fill('-75')
        self.page.get_by_role('button', name='Franka leader', exact=True).click()
        expect(inset).to_have_attribute('data-model', 'franka')
        expect(inset).to_have_attribute('data-state', 'ready', timeout=30000)
        self.page.unroute('**/models/r1pro.glb')
        self.page.get_by_role('button', name='R1 Pro bimanual', exact=True).click()
        expect(inset).to_have_attribute('data-model', 'r1pro')
        expect(inset).to_have_attribute('data-state', 'ready', timeout=30000)

    def test_franka_axes_match_and_mount_stays_fixed(self):
        for module, name in [('hardware-scene.js', 'device'), ('hardware-robot.js', 'robot')]:
            source = (ROOT / 'static/js' / module).read_text().replace(
                'renderer.render(scene, camera);',
                f'window.__{name}View = {{ scene, camera }}; renderer.render(scene, camera);')
            self.page.route(f'**/{module}*', functools.partial(
                lambda source, route: route.fulfill(body=source, content_type='text/javascript'), source))
        self.load()
        self.page.get_by_role('button', name='Franka leader', exact=True).click()
        expect(self.page.locator('.hardware-robot')).to_have_attribute('data-model', 'franka')
        expect(self.page.locator('.hardware-robot')).to_have_attribute('data-state', 'ready', timeout=30000)
        check = '''async () => {
            const THREE = await import('/static/js/vendor/three/three.module.min.js');
            const cad = window.__deviceView.scene, robot = window.__robotView.scene;
            cad.updateMatrixWorld(true); robot.updateMatrixWorld(true);
            const axes = [];
            for (let i = 0; i < 7; i++) {
                const a = cad.getObjectByName(`joint_${i}`), b = robot.getObjectByName(`panda_joint${i + 1}`);
                const av = new THREE.Vector3(...a.userData.joint.axis).applyQuaternion(a.getWorldQuaternion(new THREE.Quaternion()));
                const bv = new THREE.Vector3(...b.userData.joint.axis).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()));
                axes.push(av.dot(bv) * (i === 5 ? 1 : -1));
            }
            return { axes, bracket: cad.getObjectByName('link_dc12_x430_dummy_assy_asm_2').matrixWorld.toArray(),
                handle: cad.getObjectByName('link_ljcv2_v1').matrixWorld.toArray() };
        }'''
        initial = self.page.evaluate(check)
        sliders = self.page.locator('#hardware-joint-controls input')
        for i in range(7):
            for endpoint in ['min', 'max']:
                sliders.nth(i).evaluate('(n, endpoint) => { n.value = n[endpoint]; n.dispatchEvent(new Event("input")); }', endpoint)
                state = self.page.evaluate(check)
                self.assertGreater(min(state['axes']), 0.999999)
                self.assertEqual(initial['bracket'], state['bracket'])
                if i == 0:
                    self.assertNotEqual(initial['handle'], state['handle'])
            self.page.get_by_role('button', name='Reset pose', exact=True).click()
        self.assertEqual(initial, self.page.evaluate(check))

    def test_delayed_robot_load_does_not_replace_selected_configuration(self):
        held = []
        self.page.route('**/models/r1pro.glb', lambda route: held.append(route))
        self.load()
        inset = self.page.locator('.hardware-robot')
        expect(inset).to_have_attribute('data-state', 'loading')
        self.page.get_by_role('button', name='Franka leader', exact=True).click()
        expect(inset).to_have_attribute('data-model', 'franka')
        expect(inset).to_have_attribute('data-state', 'ready', timeout=30000)
        self.assertEqual(len(held), 1)
        with self.page.expect_response('**/models/r1pro.glb'):
            held[0].continue_()
        expect(inset).to_have_attribute('data-model', 'franka')
        expect(inset.locator('.hardware-robot-heading')).to_have_text('Franka')
        self.page.get_by_role('button', name='R1 Pro bimanual', exact=True).click()
        expect(inset).to_have_attribute('data-model', 'r1pro')
        expect(inset).to_have_attribute('data-state', 'ready', timeout=30000)

    def test_model_failure_retry_and_failed_switch_preserves_current_model(self):
        self.page.route('**/joylo-r1pro.glb', lambda r: r.abort())
        self.page.goto(self.url + '#hardware')
        expect(self.page.locator('#hardware-viewer')).to_have_attribute('data-state', 'error', timeout=30000)
        expect(self.page.get_by_role('button', name='Try again', exact=True)).to_be_visible()
        self.page.unroute('**/joylo-r1pro.glb')
        self.page.get_by_role('button', name='Try again', exact=True).click()
        expect(self.page.locator('#hardware-viewer')).to_have_attribute('data-state', 'ready', timeout=30000)
        self.page.route('**/joylo-franka.glb', lambda r: r.abort())
        self.page.get_by_role('button', name='Franka leader', exact=True).click()
        expect(self.page.locator('.hardware-sidebar [role="status"]')).to_contain_text('Could not load')
        expect(self.page.locator('#hardware-viewer')).to_have_attribute('data-model', 'r1pro')
        expect(self.page.locator('button[data-model="r1pro"]')).to_have_attribute('aria-pressed', 'true')
        self.page.unroute('**/joylo-franka.glb')
        self.page.get_by_role('button', name='Franka leader', exact=True).click()
        expect(self.page.locator('#hardware-viewer')).to_have_attribute('data-model', 'franka', timeout=30000)

    def test_webgl_unavailable_and_no_javascript(self):
        self.page.add_init_script('HTMLCanvasElement.prototype.getContext = () => null;')
        self.page.goto(self.url + '#hardware')
        expect(self.page.locator('#hardware-viewer')).to_have_attribute('data-state', 'error', timeout=30000)
        expect(self.page.locator('img[src$="hardware.jpeg"]')).to_be_visible()
        overview = self.page.locator('.interactive-figure').nth(1)
        overview.locator('.hotspot-region').first.focus()
        self.page.keyboard.press('Enter')
        expect(self.page.locator('#viz-tip .viz-tip-title')).to_have_text('Actuated leader arms')
        context = self.browser.new_context(java_script_enabled=False)
        context.route('**/*', lambda r: r.continue_() if r.request.url.startswith(self.url) else r.abort())
        page = context.new_page()
        page.goto(self.url + '#hardware')
        expect(page.locator('img[src$="hardware.jpeg"]')).to_be_visible()
        expect(page.locator('.hardware-downloads a').first).to_be_visible()
        expect(page.locator('#hardware-load')).not_to_be_visible()
        context.close()


if __name__ == '__main__':
    unittest.main()
