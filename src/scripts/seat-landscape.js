import { elements } from './dom.js';
import { state, setSeatLandscape } from './state.js';

function nativeOrientation() {
  return globalThis.Capacitor?.Plugins?.SeatOrientation;
}

export function initSeatLandscape({ seatCanvas, showToast }) {
  const button = elements.seatLandscapeButton;
  let resizeFrame;
  let transitioning = false;

  function isLandscapeViewport() {
    return window.innerWidth >= window.innerHeight;
  }

  function waitForLandscape(timeout = 1600) {
    if (isLandscapeViewport()) return Promise.resolve(true);
    return new Promise((resolve) => {
      let timer;
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener('resize', check);
        window.removeEventListener('orientationchange', check);
        resolve(result);
      };
      const check = () => {
        if (isLandscapeViewport()) finish(true);
      };
      window.addEventListener('resize', check);
      window.addEventListener('orientationchange', check);
      timer = setTimeout(() => finish(isLandscapeViewport()), timeout);
    });
  }

  function resetAfterLayout() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = requestAnimationFrame(() => seatCanvas.reset());
    });
  }

  function render() {
    elements.app.classList.toggle('seat-landscape', state.seatLandscape);
    button.disabled = transitioning || state.seatEditing;
    button.setAttribute('aria-pressed', String(state.seatLandscape));
    const label = state.seatLandscape ? '退出旋转屏幕' : '旋转屏幕';
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  async function requestLandscape() {
    const native = nativeOrientation();
    if (native?.setLandscape) {
      await native.setLandscape();
      return;
    }
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    if (isLandscapeViewport()) return;
    const lock = globalThis.screen?.orientation?.lock;
    if (typeof lock !== 'function') throw new Error('Orientation lock unavailable');
    await lock.call(globalThis.screen.orientation, 'landscape');
  }

  async function requestPortrait({ exitFullscreen = true } = {}) {
    const native = nativeOrientation();
    if (native?.setPortrait) await native.setPortrait();
    else globalThis.screen?.orientation?.unlock?.();
    if (exitFullscreen && document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  }

  async function enter() {
    if (state.seatLandscape || state.seatEditing || transitioning) return false;
    transitioning = true;
    render();
    try {
      await requestLandscape();
      if (!(await waitForLandscape())) throw new Error('Landscape not confirmed');
    } catch {
      try {
        await requestPortrait();
      } catch {
        // Best-effort cleanup after a rejected system orientation request.
      }
      transitioning = false;
      render();
      showToast('系统未能切换横屏');
      return false;
    }
    setSeatLandscape(true);
    transitioning = false;
    render();
    resetAfterLayout();
    showToast('已进入座位横屏模式');
    return true;
  }

  async function exit(options = {}) {
    if (!state.seatLandscape || transitioning) return false;
    transitioning = true;
    render();
    try {
      await requestPortrait(options);
    } catch {
      // Leaving the dedicated layout must remain possible even if system restoration fails.
    }
    setSeatLandscape(false);
    transitioning = false;
    render();
    resetAfterLayout();
    button.focus({ preventScroll: true });
    return true;
  }

  function toggle() {
    if (state.seatLandscape) exit();
    else enter();
  }

  function onFullscreenChange() {
    if (state.seatLandscape && !transitioning && !document.fullscreenElement && !nativeOrientation()) {
      exit({ exitFullscreen: false });
    }
  }

  function onViewportChange() {
    if (state.seatLandscape) resetAfterLayout();
  }

  button.addEventListener('click', toggle);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);
  render();

  return {
    enter,
    exit,
    isActive: () => state.seatLandscape,
    destroy() {
      cancelAnimationFrame(resizeFrame);
      button.removeEventListener('click', toggle);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
    }
  };
}
