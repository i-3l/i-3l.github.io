/* Defer the renderer and model downloads until the hardware section is near. */
(() => {
  const root = document.getElementById('hardware-viewer');
  if (!root) return;
  const button = document.getElementById('hardware-load');
  const status = document.getElementById('hardware-status');
  let started = false;
  button.hidden = false;
  async function start() {
    if (started) return;
    started = true;
    root.dataset.state = 'loading';
    status.textContent = 'Loading the interactive device…';
    button.hidden = true;
    try {
      const { createHardwareViewer } = await import('./hardware-scene.js');
      await createHardwareViewer(root);
    } catch (error) {
      root.dataset.state = 'error';
      status.textContent = 'The 3D viewer could not start. Use the hardware overview below or download a model to explore it.';
      button.hidden = false;
      button.textContent = 'Try again';
      started = false;
      console.warn('Hardware viewer unavailable:', error);
    }
  }
  button.addEventListener('click', start);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        start();
      }
    }, { rootMargin: '250px' });
    observer.observe(root);
  }
})();
