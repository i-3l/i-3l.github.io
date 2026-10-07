"""Browser regression checks, with a temporary local server and no external requests.

Run: python -m unittest discover -s tests -v
Set I3L_CHROME to an existing Chrome executable, or install Playwright Chromium.
"""
import csv
import functools
import os
import re
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

    def tip(self):
        return self.page.locator("#viz-tip")

    def test_every_figure_stays_inline_when_clicked(self):
        canvases = self.page.locator(".figure-canvas")
        self.assertEqual(canvases.count(), 7)
        expect(self.page.locator(".figure-canvas.has-chart")).to_have_count(3)
        expect(self.page.locator(".figure-info")).to_have_count(0)
        for index in range(canvases.count()):
            canvas = canvases.nth(index)
            canvas.click(position={"x": 1, "y": 1})
            if "has-chart" in canvas.get_attribute("class"):
                expect(canvas.locator(".viz")).to_be_visible()
                expect(canvas.locator("img")).to_be_hidden()
            else:
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
        expect(self.tip()).to_be_visible()
        expect(self.tip()).to_contain_text("23/25 (92%)")
        expect(chart.locator(".chart-readout")).to_have_count(0)
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

    def test_strategy_chart_tooltip(self):
        chart = self.page.get_by_role("region", name="Compare correction-learning strategies", exact=True)
        chart.get_by_label("Task", exact=True).select_option("Pick-and-Place Strawberries")
        self.assertEqual(chart.locator(".chart-mark").count(), 20)
        mark = chart.get_by_role("button", name="Pick-and-Place Strawberries · Round 4 (100) · HG-DAgger: 92.8%", exact=True)
        mark.hover()
        expect(self.tip()).to_contain_text("HG-DAgger: 92.8%")
        expect(mark).to_have_class(re.compile("is-selected"))

    def test_trend_chart_highlights_task_across_panels(self):
        chart = self.page.get_by_role("group", name="Intervention burden across correction rounds", exact=True)
        self.assertEqual(chart.locator(".viz-panel").count(), 4)
        # 8 tasks x (4 rounds x 3 panels + 5 categories in panel d)
        self.assertEqual(chart.locator(".viz-dot").count(), 8 * 17)
        dot = chart.locator(".viz-dot[data-key='task-1']").first
        dot.hover(force=True)
        expect(self.tip()).to_contain_text("Prepare Make-Ahead Breakfast Bowls · R1")
        expect(self.tip()).to_contain_text("2.32 takeovers / episode")
        expect(chart.locator(".viz-task-line.is-focus")).to_have_count(4)
        expect(chart.locator(".viz-dot[data-key='task-0']").first).to_have_class(re.compile("is-dim"))
        self.page.mouse.move(0, 0)
        expect(chart.locator(".is-focus")).to_have_count(0)
        expect(self.tip()).to_be_hidden()
        chart.get_by_role("img", name=re.compile("^Task mean · R4: 0.49 takeovers")).focus()
        expect(self.tip()).to_contain_text("(−63% vs R1)")
        chart.get_by_role("img", name=re.compile("^Task mean · Final")).focus()
        expect(self.tip()).to_contain_text("93.9% autonomous success")

    def test_legend_pins_highlight(self):
        chart = self.page.get_by_role("group", name="Operator study on Franka mug hanging", exact=True)
        legend = chart.get_by_role("button", name="Highlight Operator 2", exact=True)
        legend.click()
        expect(legend).to_have_attribute("aria-pressed", "true")
        self.page.mouse.move(0, 0)
        expect(chart.locator(".viz-line.is-focus")).to_have_count(2)
        chart.get_by_role("img", name=re.compile("^Operator 1 · R1")).first.focus()
        expect(self.tip()).to_contain_text("16.1% of timesteps")
        chart.get_by_role("img", name=re.compile("^Operator 1 · R1")).first.blur()
        expect(chart.locator(".viz-line.is-focus")).to_have_count(2)
        legend.click()
        expect(chart.locator(".is-focus")).to_have_count(0)

    def test_body_part_chart(self):
        chart = self.page.get_by_role("group", name="Share of body-part activations (%)", exact=True)
        # Popcorn has no torso activations, so its zero-width segment is omitted.
        self.assertEqual(chart.locator(".viz-segment").count(), 15)
        segment = chart.get_by_role("button", name="Turning on Radio · Left arm: 47.0%", exact=True)
        segment.hover()
        expect(self.tip()).to_contain_text("47.0% of body-part activations")
        expect(chart.locator(".viz-segment.is-focus")).to_have_count(4)
        expect(chart.get_by_role("button", name="Turning on Radio · Base: 35.6%", exact=True)).to_have_class(re.compile("is-dim"))

    def test_mobile_layout(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.assertLessEqual(self.page.evaluate("document.documentElement.scrollWidth"), 390)
        for canvas in self.page.locator(".figure-canvas").all():
            self.assertLessEqual(canvas.evaluate("e => e.scrollWidth"), 390)

    def test_image_hotspots_outline_with_tooltip(self):
        canvases = self.page.locator(".figure-canvas:not(.has-chart):not([data-task-scope])")
        self.assertEqual(canvases.count(), 2)
        for index in range(canvases.count()):
            canvas = canvases.nth(index)
            components = canvas.locator(".hotspot-region")
            self.assertGreater(components.count(), 0)
            component = components.first
            title = component.get_attribute("aria-label")
            component.hover()
            expect(self.tip()).to_be_visible()
            expect(self.tip().locator(".viz-tip-title")).to_have_text(title)
            expect(component).to_have_class(re.compile("is-active"))
            last = components.last
            last.focus()
            expect(self.tip().locator(".viz-tip-title")).to_have_text(last.get_attribute("aria-label"))
            expect(component).not_to_have_class(re.compile("is-active"))
            self.page.mouse.click(5, 5)
            last.blur()
            expect(self.tip()).to_be_hidden()

    def test_task_figures_outline_without_tooltip(self):
        canvases = self.page.locator(".figure-canvas[data-task-scope]")
        self.assertEqual(canvases.count(), 2)
        for index in range(canvases.count()):
            region = canvases.nth(index).locator(".task-region").first
            region.hover()
            expect(region).to_have_class(re.compile("is-active"))
            expect(self.tip()).to_be_hidden()
            self.assertIsNone(region.get_attribute("title"))

    def test_selected_task_is_highlighted_across_page(self):
        name = "Prepare Make-Ahead Breakfast Bowls"
        tasks_figure = self.page.locator(".figure-canvas[data-task-scope]").first
        tasks_figure.get_by_role("button", name=name, exact=True).click()
        follow = self.page.locator(".task-follow")
        expect(follow).to_be_visible()
        expect(follow).to_contain_text(name)
        selected = self.page.locator(f'.is-task-selected[data-task="{name}"]')
        # Both task figures, rollout tile, success explorer row, published table row, body-part row.
        expect(selected).to_have_count(6)
        self.assertEqual(self.page.locator(".is-task-selected").count(), 6)
        trends = self.page.get_by_role("group", name="Intervention burden across correction rounds", exact=True)
        expect(trends.locator(".viz-task-line.is-focus")).to_have_count(4)
        expect(trends.get_by_role("button", name=re.compile(f"^Highlight {name}"))).to_have_attribute("aria-pressed", "true")
        body = self.page.get_by_role("group", name="Share of body-part activations (%)", exact=True)
        expect(body).to_have_class(re.compile("has-task-match"))
        # Selecting a simulation task switches the strategy explorer to it.
        trends.get_by_role("button", name=re.compile("^Highlight Pick-and-Place Strawberries")).click()
        expect(follow).to_contain_text("Pick-and-Place Strawberries")
        strategy = self.page.get_by_role("region", name="Compare correction-learning strategies", exact=True)
        expect(strategy.get_by_label("Task", exact=True)).to_have_value("Pick-and-Place Strawberries")
        expect(body).not_to_have_class(re.compile("has-task-match"))
        follow.get_by_role("button", name="Clear", exact=True).click()
        expect(follow).to_be_hidden()
        expect(self.page.locator(".is-task-selected")).to_have_count(0)
        expect(trends.locator(".viz-task-line.is-focus")).to_have_count(0)
        tasks_figure.get_by_role("button", name="Mug Hanging", exact=True).click()
        self.page.keyboard.press("Escape")
        expect(follow).to_be_hidden()

    def test_rollout_rate_appears_on_hover(self):
        frame = self.page.locator(".rollout-frame").first
        rate = frame.locator(".rollout-rate")
        expect(rate).to_have_text("96% success · 24/25")
        self.assertEqual(rate.evaluate("e => getComputedStyle(e).opacity"), "0")
        frame.hover()
        expect(rate).to_have_css("opacity", "1")

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
        expect(self.page.locator(".viz").first).not_to_be_visible()
        expect(self.page.locator("img.chart-fallback").first).to_be_visible()
        self.page.emulate_media(media="screen")
        self.page.evaluate("dispatchEvent(new Event('afterprint'))")
        expect(self.page.locator("#success-results")).not_to_be_visible()


if __name__ == "__main__":
    unittest.main()
