// Takeover timeline: one Round 1 collection episode per task, with a timeline built from the
// dataset's int_state labels (policy vs. human takeover) and annotated subtasks. The playhead,
// live status badge, and a 3D robot posed from the recorded joint state follow the video; click or
// drag the timeline to seek. The 3D view (takeover-robot.js and the model) loads only when the
// section is near the viewport and the screen is wide enough to show it.
(function () {
  'use strict';
  const root = document.getElementById('takeovers');
  const tasks = window.I3L_TAKEOVERS;
  if (!root || !Array.isArray(tasks) || !tasks.length) return;

  const $ = sel => root.querySelector(sel);
  const video = $('.takeover-video');
  const tabs = $('.takeover-tabs');
  const badge = $('.takeover-badge');
  const playButton = $('.takeover-play');
  const robotHost = $('.takeover-robot');
  const speedButtons = [...root.querySelectorAll('button[data-speed]')];
  const clock = $('.takeover-clock');
  const timeline = $('.takeover-timeline');
  const subtaskRow = $('.takeover-row-subtasks');
  const controlRow = $('.takeover-row-control');
  const playhead = $('.takeover-playhead');

  let task = tasks[0];
  let speed = 2;
  let lastFrame = -1;
  let userPaused = false;
  let visible = false;
  let robot = null;

  const pct = frame => `${(100 * frame / task.frames).toFixed(3)}%`;
  const fmt = seconds => {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const percent = x => `${(100 * x).toFixed(1)}%`;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const currentFrame = () => Math.min(task.frames - 1, Math.floor(video.currentTime * task.fps + 1e-3));
  const inTakeover = frame => task.takeovers.findIndex(([a, b]) => frame >= a && frame < b);

  // Tabs ------------------------------------------------------------------------------------
  tasks.forEach((t, i) => {
    const tab = el('button', 'takeover-tab', t.short);
    tab.title = t.title;
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.dataset.index = String(i);
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', event => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = (i + step + tasks.length) % tasks.length;
      select(next);
      tabs.children[next].focus();
    });
    tabs.appendChild(tab);
  });

  function select(index) {
    task = tasks[index];
    [...tabs.children].forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    lastFrame = -1;
    video.poster = task.poster;
    video.src = task.video;
    video.playbackRate = speed;
    buildTimeline();
    update();
    if (robot) robot.setTask(task).then(() => { if (robot) robot.update(Math.max(0, currentFrame()), inTakeover(currentFrame()) >= 0); });
    if (visible && !userPaused) video.play().catch(() => {});
  }

  // Timeline --------------------------------------------------------------------------------
  function buildTimeline() {
    subtaskRow.replaceChildren();
    controlRow.replaceChildren();
    task.subtasks.forEach((s, i) => {
      const seg = el('div', 'takeover-subtask');
      seg.style.left = pct(s.start);
      seg.style.width = pct(s.end - s.start);
      seg.dataset.index = String(i);
      seg.title = `${i + 1}. ${s.label} (${fmt(s.start / task.fps)}–${fmt(s.end / task.fps)})`;
      seg.appendChild(el('span', null, s.label));
      subtaskRow.appendChild(seg);
    });
    task.takeovers.forEach(([a, b], i) => {
      const seg = el('div', 'takeover-block');
      seg.style.left = pct(a);
      seg.style.width = pct(b - a);
      seg.title = `Takeover ${i + 1}: ${fmt(a / task.fps)}–${fmt(b / task.fps)} (${((b - a) / task.fps).toFixed(1)} s)`;
      controlRow.appendChild(seg);
    });
    fitLabels();
  }

  // Labels may wrap to two lines; hide those that still do not fit their segment; the current subtask is always named below.
  function fitLabels() {
    for (const seg of subtaskRow.children) {
      const label = seg.firstChild;
      seg.classList.remove('is-cramped');
      if (label.scrollWidth > seg.clientWidth || label.scrollHeight > seg.clientHeight) seg.classList.add('is-cramped');
    }
  }

  // Playback state --------------------------------------------------------------------------
  function update() {
    const frame = Math.max(0, currentFrame());
    if (frame !== lastFrame) {
      lastFrame = frame;
      playhead.style.left = pct(frame + 0.5);
      const takeover = inTakeover(frame) >= 0;
      badge.classList.toggle('is-takeover', takeover);
      badge.querySelector('.takeover-badge-text').textContent = takeover ? 'Human takeover' : 'Policy';
      const s = task.subtasks.findIndex(x => frame >= x.start && frame < x.end);
      [...subtaskRow.children].forEach((seg, i) => seg.classList.toggle('is-current', i === s));
      if (robot) robot.update(frame, takeover);
      timeline.setAttribute('aria-valuenow', String(Math.round(video.currentTime)));
      timeline.setAttribute('aria-valuetext',
        `${fmt(video.currentTime)}, ${takeover ? 'human takeover' : 'policy'}${s >= 0 ? `, ${task.subtasks[s].label}` : ''}`);
    }
    clock.textContent = `${fmt(video.currentTime)} / ${fmt(task.frames / task.fps)}`;
    timeline.setAttribute('aria-valuemax', String(Math.round(task.frames / task.fps)));
  }

  function tick() {
    update();
    if (!video.paused) schedule();
  }
  function schedule() {
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(tick);
    else requestAnimationFrame(tick);
  }

  video.addEventListener('play', () => { playButton.setAttribute('aria-pressed', 'true'); playButton.setAttribute('aria-label', 'Pause'); schedule(); });
  video.addEventListener('pause', () => { playButton.setAttribute('aria-pressed', 'false'); playButton.setAttribute('aria-label', 'Play'); update(); });
  video.addEventListener('seeked', update);
  video.addEventListener('loadedmetadata', update);
  video.addEventListener('ratechange', () => { if (video.playbackRate !== speed) video.playbackRate = speed; });

  playButton.addEventListener('click', () => {
    if (video.paused) { userPaused = false; video.play().catch(() => {}); }
    else { userPaused = true; video.pause(); }
  });
  video.addEventListener('click', () => playButton.click());

  for (const b of speedButtons) {
    b.addEventListener('click', () => {
      speed = parseFloat(b.dataset.speed);
      video.playbackRate = speed;
      speedButtons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    });
  }

  // Seeking ---------------------------------------------------------------------------------
  function seekTo(clientX) {
    const rect = timeline.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    video.currentTime = Math.min(x * task.frames, task.frames - 1) / task.fps;
    update();
  }
  timeline.addEventListener('pointerdown', event => {
    timeline.setPointerCapture(event.pointerId);
    seekTo(event.clientX);
    const move = e => seekTo(e.clientX);
    const up = () => {
      timeline.removeEventListener('pointermove', move);
      timeline.removeEventListener('pointerup', up);
      timeline.removeEventListener('pointercancel', up);
    };
    timeline.addEventListener('pointermove', move);
    timeline.addEventListener('pointerup', up);
    timeline.addEventListener('pointercancel', up);
  });
  timeline.addEventListener('keydown', event => {
    const step = { ArrowRight: 1, ArrowLeft: -1, PageUp: 5, PageDown: -5 }[event.key];
    if (event.key === 'Home') video.currentTime = 0;
    else if (event.key === 'End') video.currentTime = (task.frames - 1) / task.fps;
    else if (step) video.currentTime = Math.min(Math.max(0, video.currentTime + step), (task.frames - 1) / task.fps);
    else return;
    event.preventDefault();
    update();
  });

  // Autoplay only while on screen -----------------------------------------------------------
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      for (const entry of entries) {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.35;
        if (visible && !userPaused) video.play().catch(() => {});
        else if (!visible && !video.paused) video.pause();
        if (robot) robot.setVisible(entry.isIntersecting);
      }
    }, { threshold: [0, 0.35, 0.6] }).observe(video);
  }

  // 3D robot view: fetched once the section is near, and only where the panel is shown ---------
  const styles = getComputedStyle(root);
  async function startRobot() {
    if (robotHost.dataset.state !== 'idle') return;
    robotHost.dataset.state = 'loading';
    try {
      const { createRobotView } = await import('./takeover-robot.js?v=2');
      const view = await createRobotView(robotHost, {
        modelUrl: './static/models/r1pro.glb',
        policyColor: styles.getPropertyValue('--policy').trim() || '#5b7db1',
        takeoverColor: styles.getPropertyValue('--takeover').trim() || '#C45B28',
      });
      await view.setTask(task);
      robot = view;
      robotHost.dataset.state = 'ready';
      const frame = Math.max(0, currentFrame());
      robot.update(frame, inTakeover(frame) >= 0);
    } catch (error) {
      robotHost.dataset.state = 'error';
      root.classList.add('no-robot');
      console.warn('Takeover robot view unavailable:', error);
    }
  }
  if (robotHost && 'IntersectionObserver' in window && window.matchMedia('(min-width: 601px)').matches) {
    const near = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { near.disconnect(); startRobot(); }
    }, { rootMargin: '250px' });
    near.observe(root);
  } else if (robotHost) {
    root.classList.add('no-robot');
  }
  window.addEventListener('resize', fitLabels);

  select(0);
})();
