"""Browser regression checks, with a temporary local server and no external requests.

Run: python -m unittest discover -s tests -v
Set I3L_CHROME to an existing Chrome executable, or install Playwright Chromium.
"""
import csv
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


class InteractiveFiguresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(QuietHandler, directory=str(ROOT))
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/"
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(
            executable_path=os.environ.get("I3L_CHROME"), headless=True
        )

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.context = self.browser.new_context(viewport={"width": 1440, "height": 1000})
        self.context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(self.url) else route.abort())
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.goto(self.url, wait_until="networkidle")

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def test_every_figure_stays_inline_when_clicked(self):
        canvases = self.page.locator(".figure-canvas")
        self.assertEqual(canvases.count(), 7)
        expect(self.page.locator(".figure-image-button, .figure-toolbar")).to_have_count(0)
        for index in range(canvases.count()):
            canvas = canvases.nth(index)
            canvas.click(position={"x": 1, "y": 1})
            expect(canvas.locator("img")).to_be_visible()
            expect(self.page.get_by_role("dialog")).to_have_count(0)
            self.assertNotEqual(self.page.evaluate("getComputedStyle(document.body).overflow"), "hidden")

    def test_success_filters_values_and_download(self):
        chart = self.page.get_by_role("region", name="Explore autonomous success", exact=True)
        self.assertEqual(chart.locator(".chart-mark").count(), 24)
        chart.get_by_label("Tasks", exact=True).select_option("Real world (Franka)")
        self.assertEqual(chart.locator(".chart-mark").count(), 6)
        mark = chart.get_by_role("button", name="Real world (Franka) · Mug Hanging · 100 corrections (ours): 23/25 (92%)", exact=True)
        mark.focus()
        expect(chart.get_by_role("status")).to_contain_text("23/25 (92%)")
        chart.get_by_label("Base", exact=True).uncheck()
        self.assertEqual(chart.locator(".chart-mark").count(), 4)
        with self.page.expect_download() as pending:
            chart.get_by_role("button", name="Download CSV", exact=True).click()
        with open(pending.value.path(), newline="") as file:
            rows = list(csv.reader(file))
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[1], ["Real world (Franka)", "Mug Hanging", "24", "68", "92"])
        chart.get_by_label("100 demos", exact=True).uncheck()
        chart.get_by_label("100 corrections (ours)", exact=True).uncheck()
        expect(chart.locator(".chart-empty")).to_be_visible()
        chart.get_by_label("Base", exact=True).check()
        self.assertEqual(chart.locator(".chart-mark").count(), 2)

    def test_strategy_and_body_part_data(self):
        chart = self.page.get_by_role("region", name="Compare correction-learning strategies", exact=True)
        chart.get_by_label("Task", exact=True).select_option("Pick-and-Place Strawberries")
        mark = chart.get_by_role("button", name="Pick-and-Place Strawberries · Round 4 (100) · HG-DAgger: 92.8%", exact=True)
        mark.click()
        expect(chart.get_by_role("status")).to_contain_text("92.8%")
        self.assertEqual(chart.locator(".chart-mark").count(), 20)
        self.page.locator("summary").filter(has_text="Explore activation values").click()
        body = self.page.get_by_role("region", name="Body-part activation share", exact=True)
        self.assertEqual(body.locator(".chart-mark").count(), 16)
        torso = body.get_by_role("button", name="Make Microwave Popcorn · Torso: 0%", exact=True)
        torso.click()
        expect(body.get_by_role("status")).to_contain_text("Torso: 0%")
        self.assertEqual(torso.locator(".chart-fill").bounding_box()["width"], 0)

    def test_mobile_layout(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.assertLessEqual(self.page.evaluate("document.documentElement.scrollWidth"), 390)
        for canvas in self.page.locator(".figure-canvas").all():
            self.assertLessEqual(canvas.evaluate("e => e.scrollWidth"), 390)

    def test_component_hover_click_and_keyboard(self):
        wrappers = self.page.locator(".interactive-figure")
        for index in range(7):
            wrapper = wrappers.nth(index)
            components = wrapper.locator(".hotspot-region")
            self.assertGreater(components.count(), 0)
            component = components.first
            title = component.get_attribute("aria-label").split(". ", 1)[1]
            component.hover()
            expect(wrapper.locator(".info-title")).to_have_text(title)
            expect(component).to_have_attribute("aria-pressed", "true")
            self.assertGreater(len(wrapper.locator(".info-body").inner_text()), 60)
            last = components.last
            last.focus()
            last_title = last.get_attribute("aria-label").split(". ", 1)[1]
            expect(wrapper.locator(".info-title")).to_have_text(last_title)
            component.click()
            expect(wrapper.locator(".info-title")).to_have_text(title)

    def test_no_javascript_and_print_preserve_published_content(self):
        context = self.browser.new_context(java_script_enabled=False)
        context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(self.url) else route.abort())
        page = context.new_page()
        page.goto(self.url)
        self.assertEqual(page.locator("img").count(), 7)
        expect(page.locator("#success-results")).to_be_visible()
        expect(page.locator("#strategy-results")).to_be_visible()
        context.close()
        self.page.evaluate("dispatchEvent(new Event('beforeprint'))")
        self.page.emulate_media(media="print")
        expect(self.page.locator("#success-results")).to_be_visible()
        expect(self.page.locator("#strategy-results")).to_be_visible()
        expect(self.page.locator(".hotspot-layer").first).not_to_be_visible()
        self.page.emulate_media(media="screen")
        self.page.evaluate("dispatchEvent(new Event('afterprint'))")
        expect(self.page.locator("#success-results")).not_to_be_visible()


if __name__ == "__main__":
    unittest.main()
