/* First-party, cookie-free measurement. No form contents or persistent IDs. */
(() => {
  'use strict';
  const script = document.currentScript;
  const endpoint = script?.dataset.endpoint;
  if (!endpoint || location.hostname !== 'i-3l.github.io' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl || new URLSearchParams(location.search).get('analytics') === 'off') return;
  if (!crypto.randomUUID) return;
  const uuid = () => crypto.randomUUID();
  const params = new URLSearchParams(location.search);
  const page = { id: uuid(), path: location.pathname, source: params.get('utm_source') || '', medium: params.get('utm_medium') || '', campaign: params.get('utm_campaign') || '', referrer: '' };
  try { page.referrer = new URL(document.referrer).origin; } catch { /* No referrer. */ }
  let queue = [], sending = false, sentPage = false;
  const text = value => String(value || '').replace(/[\x00-\x1f\x7f<>]/g, '').trim().slice(0, 100);
  const hardware = () => document.getElementById('hardware-viewer');
  const model = () => hardware()?.dataset.model || '';
  const arm = () => document.querySelector('[data-arm][aria-pressed="true"]')?.dataset.arm || (model() === 'franka' ? 'single' : '');
  const sectionOf = el => {
    const section = el?.closest('section, .rows');
    return text(section?.dataset.analyticsSection || section?.id || section?.querySelector('h2,h1')?.textContent || 'Overview');
  };
  const chartOf = el => text(el?.closest('.results-explorer')?.getAttribute('aria-label'));
  function track(name, details = {}) {
    if (queue.length >= 300) return;
    queue.push({ id: uuid(), name, target: text(details.target), section: text(details.section || ''), model: details.model || '', arm: details.arm || '', value: Number.isFinite(details.value) ? details.value : 0 });
    if (queue.length >= 20) flush();
  }
  async function flush() {
    if (sending || sentPage && !queue.length) return;
    sending = true;
    const batch = queue.slice(0, 20);
    try {
      const result = await fetch(endpoint, { method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ page, events: batch }) });
      if (result.ok) { queue.splice(0, batch.length); sentPage = true; }
    } catch { /* Measurement failure must never interrupt the website. */ }
    finally { sending = false; }
  }
  window.I3LAnalytics = Object.freeze({ track });
  flush();
  setInterval(flush, 10000);
  addEventListener('online', flush);
  function finalFlush() {
    if (!sentPage || queue.length) {
      const body = new Blob([JSON.stringify({ page, events: queue.slice(0, 20) })], { type: 'text/plain' });
      navigator.sendBeacon?.(endpoint, body);
    }
  }

  document.addEventListener('click', event => {
    if (!event.isTrusted) return;
    const el = event.target.closest('a,button,summary');
    if (!el) return;
    const section = sectionOf(el);
    const h = { section, model: model(), arm: arm() };
    if (el.matches('[data-model]')) track('hardware_model', { ...h, model: el.dataset.model, arm: '', target: el.dataset.model });
    else if (el.matches('[data-arm]')) track('hardware_arm', { ...h, arm: el.dataset.arm, target: el.dataset.arm });
    else if (el.matches('[data-view]')) track('hardware_camera', { ...h, target: el.dataset.view });
    else if (el.id === 'hardware-reset') track('hardware_reset', h);
    else if (el.id === 'hardware-load') track('hardware_load', { ...h, target: 'manual' });
    else if (el.matches('.hotspot-region')) track('figure_select', { section, target: `${el.closest('.interactive-figure')?.querySelector('img')?.getAttribute('src')?.split('/').pop()}: ${el.getAttribute('aria-label')}` });
    else if (el.matches('.chart-mark')) track('chart_inspect', { section, target: `${chartOf(el)}: ${el.getAttribute('aria-label')}` });
    else if (el.matches('.figure-control') && el.textContent.trim() === 'Download CSV') track('csv_download', { section, target: chartOf(el) });
    else if (el.tagName === 'SUMMARY') track('details_toggle', { section, target: `${el.parentElement.open ? 'close' : 'open'}: ${text(el.textContent)}` });
    else if (el.tagName === 'A') {
      let url;
      try { url = new URL(el.href); } catch { return; }
      if (!['http:', 'https:'].includes(url.protocol)) return;
      const target = url.pathname.endsWith('/paper.pdf') ? 'paper' : el.hasAttribute('download') ? `download: ${url.pathname.split('/').pop()}` : url.origin === location.origin ? url.hash || url.pathname : url.hostname;
      track('link_click', { section, target });
      flush();
    }
  });
  document.addEventListener('change', event => {
    if (!event.isTrusted) return;
    const el = event.target;
    if (el.matches('.figure-select')) track('chart_filter', { section: sectionOf(el), target: `${chartOf(el)}: ${el.value || 'All tasks'}` });
    if (el.matches('.chart-legend input')) track('chart_series', { section: sectionOf(el), target: `${el.checked ? 'show' : 'hide'}: ${el.closest('label').textContent.trim()}` });
  });

  // Sliders emit one action when a change is committed, including custom keyboard steps.
  const changedJoints = new Set();
  const jointStart = new WeakMap();
  const jointSelector = '#hardware-joint-controls input[type="range"]';
  const isJoint = el => el instanceof Element && el.matches(jointSelector);
  function commitJoint(el) {
    if (!isJoint(el)) return;
    if (changedJoints.has(el) || jointStart.has(el) && jointStart.get(el) !== el.value) {
      track('hardware_joint', { target: el.id, section: 'hardware', model: model(), arm: arm() });
      changedJoints.delete(el);
    }
    jointStart.delete(el);
  }
  for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, e => {
    if (e.isTrusted && isJoint(e.target) && !jointStart.has(e.target)) jointStart.set(e.target, e.target.value);
  }, true);
  document.addEventListener('input', e => { if (e.isTrusted && isJoint(e.target)) changedJoints.add(e.target); });
  for (const type of ['change', 'keyup', 'focusout']) document.addEventListener(type, e => { if (e.isTrusted) commitJoint(e.target); });

  let drag, wheelTimer, keyTimer;
  document.addEventListener('pointerdown', e => {
    if (e.isTrusted && e.target.matches('#hardware-viewer canvas')) drag = { x: e.clientX, y: e.clientY, button: e.button };
  }, true);
  document.addEventListener('pointerup', e => {
    if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) track('hardware_camera', { section: 'hardware', model: model(), target: drag.button === 2 ? 'pan' : 'orbit' });
    drag = null;
  }, true);
  document.addEventListener('pointercancel', () => { drag = null; }, true);
  document.addEventListener('wheel', e => {
    if (!e.isTrusted || !e.target.matches('#hardware-viewer canvas')) return;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => track('hardware_camera', { section: 'hardware', model: model(), target: 'wheel_zoom' }), 400);
  }, { passive: true, capture: true });
  document.addEventListener('keydown', e => {
    if (!e.isTrusted || !e.target.matches('#hardware-viewer canvas') || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0', 'Home'].includes(e.key)) return;
    clearTimeout(keyTimer);
    keyTimer = setTimeout(() => track('hardware_camera', { section: 'hardware', model: model(), target: 'keyboard' }), 400);
  });

  const sections = [...document.querySelectorAll('body > section, body > .rows')];
  sections.forEach((el, i) => { el.dataset.analyticsSection = text(el.id || el.querySelector('h2,h1')?.textContent || (i === 0 ? 'Overview' : `Section ${i + 1}`)); });
  const visibleSections = new Map(), reached = new Set(), depths = new Set();
  let activeSection = 'Overview', lastTick = performance.now(), lastInput = performance.now();
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const name = entry.target.dataset.analyticsSection;
        visibleSections.set(name, entry.isIntersecting ? entry.intersectionRect.height : 0);
        if (entry.isIntersecting && entry.intersectionRect.height >= Math.min(150, entry.boundingClientRect.height / 2) && !reached.has(name)) {
          reached.add(name); track('section_view', { section: name, target: name });
        }
      }
      activeSection = [...visibleSections].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Overview';
    }, { threshold: [0, .1, .25, .5, .75, 1] });
    sections.forEach(el => observer.observe(el));
  }
  function accrue() {
    const now = performance.now(), seconds = Math.min(30, (now - lastTick) / 1000);
    if (!document.hidden && now - lastInput < 60000 && seconds >= 1) track('active_time', { section: activeSection, value: Math.round(seconds) });
    lastTick = now;
  }
  for (const type of ['pointerdown', 'pointermove', 'keydown', 'scroll']) document.addEventListener(type, () => { lastInput = performance.now(); }, { passive: true });
  setInterval(accrue, 15000);
  document.addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (max <= 0) return;
    const percent = 100 * scrollY / max;
    for (const depth of [25, 50, 75, 90]) if (percent >= depth && !depths.has(depth)) { depths.add(depth); track('scroll_depth', { target: String(depth), value: depth }); }
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    // A hidden tab starts a fresh timing interval when shown again.
    if (document.hidden) { lastTick = performance.now(); finalFlush(); }
    else { lastTick = lastInput = performance.now(); flush(); }
  });
  addEventListener('pagehide', () => { accrue(); finalFlush(); });
  addEventListener('pageshow', e => {
    if (e.persisted) { page.id = uuid(); sentPage = false; queue = []; reached.clear(); depths.clear(); lastTick = lastInput = performance.now(); flush(); }
  });
})();
