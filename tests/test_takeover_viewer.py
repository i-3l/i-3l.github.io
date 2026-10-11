"""Exercise the episode-synchronized JoyLo+ inset with real local CAD and video."""
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import re
import threading
import unittest
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (BrokenPipeError, ConnectionResetError):
            pass


class TakeoverViewerTests(unittest.TestCase):
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
        self.context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(self.url) else route.abort())
        self.context.route('**/*.mp4', lambda route: route.abort())
        self.context.route('**/static/videos/takeovers/*.mp4', self.serve_video)
        self.page = self.context.new_page()
        self.errors = []
        self.requests = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.on('request', lambda request: self.requests.append(request.url))

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def serve_video(self, route):
        # Browser seeking uses HTTP Range; the standard-library server lacks it.
        data = (ROOT / urlparse(route.request.url).path.lstrip('/')).read_bytes()
        headers = {'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes'}
        byte_range = route.request.headers.get('range')
        if byte_range:
            match = re.fullmatch(r'bytes=(\d+)-(\d*)', byte_range)
            self.assertIsNotNone(match)
            start = int(match[1])
            end = min(int(match[2]) if match[2] else len(data) - 1, len(data) - 1)
            headers['Content-Range'] = f'bytes {start}-{end}/{len(data)}'
            route.fulfill(status=206, headers=headers, body=data[start:end + 1])
        else:
            route.fulfill(status=200, headers=headers, body=data)

    def load(self):
        self.page.goto(self.url + '?analytics=off#takeovers-title')
        expect(self.page.locator('.takeover-robot')).to_have_attribute('data-state', 'ready', timeout=30000)
        self.page.wait_for_function('document.querySelector(".takeover-video").readyState >= 2')
        if not self.page.locator('.takeover-video').evaluate('(video) => video.paused'):
            self.page.locator('.takeover-play').click()
        return self.page.locator('.takeover-leader')

    def seek(self, frame):
        self.page.locator('.takeover-video').evaluate('''(video, frame) => new Promise(resolve => {
            video.addEventListener('seeked', resolve, { once: true });
            video.currentTime = (frame + 0.1) / 30;
        })''', frame)
        expect(self.page.locator('.takeover-leader')).to_have_attribute('data-frame', str(frame))

    def test_pose_seeking_takeover_boundaries_and_playback(self):
        leader = self.load()
        expect(leader).to_have_attribute('data-state', 'ready', timeout=30000)
        # The inset shares the robot's canvas rather than starting another renderer.
        expect(self.page.locator('.takeover-robot canvas')).to_have_count(1)
        self.seek(100)
        before = leader.locator('.takeover-leader-viewport').screenshot()
        self.seek(400)
        self.assertNotEqual(before, leader.locator('.takeover-leader-viewport').screenshot())
        self.seek(859)
        expect(leader.locator('.takeover-leader-status')).to_have_text('Policy')
        policy_border = leader.evaluate('(node) => getComputedStyle(node).borderColor')
        self.seek(860)
        expect(leader.locator('.takeover-leader-status')).to_have_text('Takeover')
        expect(leader).to_have_attribute('aria-label', re.compile('human takeover'))
        self.assertNotEqual(policy_border, leader.evaluate('(node) => getComputedStyle(node).borderColor'))
        expect(self.page.locator('.takeover-badge-text')).to_have_text('Human takeover')
        self.seek(957)
        expect(leader.locator('.takeover-leader-status')).to_have_text('Policy')
        self.seek(857)
        self.page.locator('.takeover-play').click()
        self.page.wait_for_function('Number(document.querySelector(".takeover-leader").dataset.frame) >= 868')
        expect(leader.locator('.takeover-leader-status')).to_have_text('Takeover')
        self.page.locator('.takeover-play').click()
        paused_frame = leader.get_attribute('data-frame')
        self.page.wait_for_timeout(150)
        self.assertEqual(paused_frame, leader.get_attribute('data-frame'))

    def test_latest_episode_wins_and_inset_stays_inside_resized_panel(self):
        leader = self.load()
        expect(leader).to_have_attribute('data-state', 'ready', timeout=30000)
        # A delayed earlier response must not replace the newly selected episode.
        self.page.evaluate('''() => {
            const original = window.fetch;
            window.fetch = async (...args) => {
                const response = await original(...args);
                if (String(args[0]).includes('bread.joints.bin')) await new Promise(resolve => setTimeout(resolve, 800));
                return response;
            };
        }''')
        self.page.get_by_role('tab', name='Breakfast Bowls', exact=True).click()
        self.page.get_by_role('tab', name='Radio', exact=True).click()
        expect(leader).to_have_attribute('data-task', 'radio')
        self.page.wait_for_timeout(1000)
        expect(leader).to_have_attribute('data-task', 'radio')
        self.page.wait_for_function('document.querySelector(".takeover-video").readyState >= 2')
        self.seek(400)
        expect(leader.locator('.takeover-leader-status')).to_have_text('Takeover')
        for width in (720, 1440):
            self.page.set_viewport_size({'width': width, 'height': 1000})
            self.page.wait_for_timeout(100)
            panel_box = self.page.locator('.takeover-robot').bounding_box()
            inset_box = leader.bounding_box()
            self.assertGreater(inset_box['x'], panel_box['x'])
            self.assertGreater(inset_box['y'], panel_box['y'])
            self.assertLess(inset_box['x'] + inset_box['width'], panel_box['x'] + panel_box['width'])
            self.assertLess(inset_box['y'] + inset_box['height'], panel_box['y'] + panel_box['height'])
            self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))

    def test_leader_failure_keeps_video_and_robot_usable(self):
        self.context.route('**/joylo-r1pro.glb', lambda route: route.abort())
        leader = self.load()
        expect(leader).to_have_attribute('data-state', 'error', timeout=30000)
        expect(leader).to_be_hidden()
        expect(self.page.locator('.takeover-robot')).to_be_visible()
        self.seek(900)
        expect(self.page.locator('.takeover-badge-text')).to_have_text('Human takeover')

    def test_models_stay_lazy_and_hidden_on_small_screens(self):
        self.page.set_viewport_size({'width': 1440, 'height': 650})
        self.page.goto(self.url + '?analytics=off', wait_until='networkidle')
        self.assertFalse(any('takeover-robot.js' in url or 'takeover-joylo.js' in url for url in self.requests))
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.page.reload(wait_until='networkidle')
        self.page.locator('#takeovers-title').scroll_into_view_if_needed()
        self.page.wait_for_timeout(250)
        expect(self.page.locator('.takeover-robot')).to_be_hidden()
        self.assertFalse(any('takeover-joylo.js' in url for url in self.requests))
        self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
