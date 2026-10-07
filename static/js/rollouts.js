// Autonomous rollout gallery: a shared speed selector swaps every clip to a
// pre-rendered version at 1×, 2×, 4×, or 8× (<clip>_<speed>x.mp4),
// keeping each clip's relative progress. Clips play muted while on screen.
(function () {
  'use strict';
  const gallery = document.getElementById('rollouts');
  if (!gallery) return;
  const DIR = './static/videos/rollouts/';
  const videos = [...gallery.querySelectorAll('video[data-clip]')];
  const buttons = [...gallery.querySelectorAll('button[data-speed]')];
  const visible = new Set();
  let speed = parseFloat(buttons.find(b => b.getAttribute('aria-pressed') === 'true')?.dataset.speed) || 4;

  function setSpeed(next) {
    if (next === speed) return;
    speed = next;
    for (const video of videos) {
      const progress = video.duration ? video.currentTime / video.duration : 0;
      const wasPlaying = !video.paused && !video.ended;
      video.src = `${DIR}${video.dataset.clip}_${speed}x.mp4`;
      if (progress > 0) {
        video.addEventListener('loadedmetadata', () => { video.currentTime = progress * video.duration; }, { once: true });
      }
      if (wasPlaying || (visible.has(video) && !video.dataset.userPaused)) video.play().catch(() => {});
    }
    render();
  }

  function render() {
    for (const b of buttons) b.setAttribute('aria-pressed', String(parseFloat(b.dataset.speed) === speed));
    for (const video of videos) {
      const badge = video.closest('.rollout-tile')?.querySelector('.rollout-badge');
      if (badge) badge.textContent = `${speed}×`;
    }
  }

  for (const b of buttons) b.addEventListener('click', () => setSpeed(parseFloat(b.dataset.speed)));

  // Show native controls only on real pointer movement, a tap, or keyboard focus, not when
  // a clip scrolls under a stationary cursor or starts autoplaying. The markup keeps
  // `controls` so the page still works without this script.
  for (const video of videos) {
    const show = () => { video.controls = true; };
    const hide = () => {
      if (document.fullscreenElement === video || document.activeElement === video) return;
      video.controls = false;
    };
    video.controls = false;
    video.addEventListener('pointermove', e => { if (e.movementX || e.movementY || e.pointerType !== 'mouse') show(); });
    video.addEventListener('pointerdown', show);
    video.addEventListener('mouseleave', hide);
    video.addEventListener('focus', show);
    video.addEventListener('blur', () => { video.controls = false; });
    document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement !== video && !video.matches(':hover')) hide(); });
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const video = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          visible.add(video);
          if (!video.dataset.userPaused) video.play().catch(() => {});
        } else {
          visible.delete(video);
          if (!video.paused) { video.dataset.autoPaused = '1'; video.pause(); }
        }
      }
    }, { threshold: [0, 0.35, 0.6] });
    for (const video of videos) {
      observer.observe(video);
      // Remember pauses made with the native controls so scrolling back does not restart them.
      video.addEventListener('pause', () => {
        if (video.dataset.autoPaused) delete video.dataset.autoPaused;
        else if (!video.ended) video.dataset.userPaused = '1';
      });
      video.addEventListener('play', () => { delete video.dataset.userPaused; });
    }
  } else {
    for (const video of videos) video.setAttribute('autoplay', '');
  }

  render();
})();
