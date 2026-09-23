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
        self.page.get_by_role('link', name='Explore hardware').click()
        expect(self.page.locator('#hardware-viewer')).to_have_attribute('data-state', 'ready', timeout=30000)
        canvas = self.page.locator('#hardware-canvas canvas')
        self.assertFalse(any('joylo-franka.glb' in url for url in requested))
        for model in ['r1pro', 'franka']:
            self.page.locator(f'button[data-model="{model}"]').click()
            expect(self.page.locator('#hardware-viewer')).to_have_attribute('data-model', model, timeout=30000)
            inputs = self.page.locator('#hardware-joint-controls input')
            self.assertEqual(inputs.count(), 7)
            initial = inputs.evaluate_all('(nodes) => nodes.map(n => n.value)')
            before = canvas.screenshot()
            # Joint 4 moves the distal assembly; this must change actual rendered pixels.
            inputs.nth(3).evaluate('(n) => { n.value = (Number(n.min) + Number(n.max))/2; n.dispatchEvent(new Event("input")); }')
            self.assertNotEqual(before, canvas.screenshot())
            self.page.get_by_role('button', name='Reset pose', exact=True).click()
            self.assertEqual(initial, inputs.evaluate_all('(nodes) => nodes.map(n => n.value)'))
            # Every range is keyboard operable and bounded by the source limits.
            for index in range(7):
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
        expect(overview.locator('.info-title')).to_have_text('Actuated leader arms')
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
