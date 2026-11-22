// The page lock (milestone 35): the page around the game cannot zoom,
// scroll or drift, and puts itself back if the browser zooms or shifts it
// anyway (iOS Safari ignores user-scalable=no).
//
// - index.html gives html, body, #game and everything in them
//   touch-action: none (no pinch, no double-tap zoom, no pan wherever a
//   finger lands, side bars included), no text selection, callout or tap
//   highlight, and fixes html and body so the document has nothing to scroll.
// - installPageLock() prevents Safari's gesture events and any multi-touch
//   touchmove at the document (non-passive), dblclick, and a one-finger
//   touchmove that starts off the canvas (the side bars). It never prevents
//   touchstart or touchend, so taps, drags and Phaser's own window
//   listeners are untouched.
// - Self-recovery: on visualViewport resize and scroll, window scroll and
//   resize, pageshow and a return to the page, a debounced check reads the
//   visual viewport. A scroll or offset puts the page back at the origin;
//   a scale other than 1 re-applies the viewport meta tag (see rescale()),
//   a first attempt only. Whatever the browser does, #game is then placed
//   on the visible rectangle (fitBox, boxFitFor), so the game fills and is
//   centred in what the player sees, zoomed or not, and goes back to the
//   normal CSS at scale 1 with no offset. Then the canvas refits (layoutSwitch.ts refit(), which reuses the layout
//   switch: no switch unless the shape changed, and GameScene.relayout()
//   coalesces restarts).

/** What the visual viewport and the window report. */
export interface ViewportSample {
  scale: number;
  offsetLeft: number;
  offsetTop: number;
  scrollX: number;
  scrollY: number;
}

/** What the recovery does: scroll back to the origin, and/or snap the zoom back to 1. */
export interface Recovery {
  scroll: boolean;
  rescale: boolean;
}

/** Scales within this of 1 count as 1 (rounding in the browser). */
export const SCALE_TOLERANCE = 0.01;
/** Offsets and scrolls under this many CSS px count as 0. */
export const OFFSET_TOLERANCE = 0.5;
/** Quiet time after the last viewport event before the check runs (ms). */
export const RECOVERY_DEBOUNCE_MS = 150;
/** The meta tag is re-applied at most once in this long (ms), so a browser that refuses cannot make it loop. */
export const RESCALE_COOLDOWN_MS = 1000;

/** The recovery for a sample, or null when the page is where it belongs. */
export function recoveryFor(v: ViewportSample): Recovery | null {
  const rescale = Math.abs(v.scale - 1) > SCALE_TOLERANCE;
  const off = (n: number) => Math.abs(n) >= OFFSET_TOLERANCE;
  const scroll = off(v.offsetLeft) || off(v.offsetTop) || off(v.scrollX) || off(v.scrollY);
  return rescale || scroll ? { scroll, rescale } : null;
}

/** The viewport meta content (index.html) and an equivalent spelling used to make the browser re-read it. */
export const VIEWPORT_CONTENT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
const VIEWPORT_CONTENT_ALT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

/** Counts for the test hook (__tarpit.pageLock()). */
export interface PageLockState {
  checks: number;
  recoveries: number;
  rescales: number;
  refits: number;
}

const counts: PageLockState = { checks: 0, recoveries: 0, rescales: 0, refits: 0 };

export function pageLockState(): PageLockState {
  return { ...counts };
}

/** The current sample (the visual viewport read at call time, so a test may stub it). */
function sample(): ViewportSample {
  const vv = window.visualViewport;
  return {
    scale: vv?.scale ?? 1,
    offsetLeft: vv?.offsetLeft ?? 0,
    offsetTop: vv?.offsetTop ?? 0,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

/**
 * Snap the zoom back to 1. iOS Safari re-reads the viewport meta tag when
 * its content changes and clamps the current zoom into the new
 * [minimum-scale, maximum-scale] range; with maximum-scale=1 that is scale
 * 1. Changing the content to an equivalent spelling forces the re-read
 * without changing the layout; the next rescale switches back.
 */
function rescale(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  meta.content = meta.content === VIEWPORT_CONTENT ? VIEWPORT_CONTENT_ALT : VIEWPORT_CONTENT;
}

function scrollHome(): void {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.documentElement.scrollLeft = 0;
  document.body.scrollTop = 0;
  document.body.scrollLeft = 0;
}

/** How #game is placed: index.html's insets, or a box from the visual viewport (layout-viewport CSS px). */
export type BoxFit =
  | { kind: 'css' }
  | { kind: 'visible'; left: number; top: number; width: number; height: number; scale: number };

/**
 * Where #game goes for a visual viewport (follow-up). Zoomed (scale not 1)
 * or offset: the visible rectangle itself (offsetLeft, offsetTop, width,
 * height), so the canvas fits and centres in what the player sees even if
 * the browser keeps the zoom. At scale 1 with no offset but a size other
 * than the layout viewport's (a Safari toolbar mid-change): the visible
 * size at the origin. Otherwise index.html's CSS.
 */
export function boxFitFor(vv: { scale: number; offsetLeft: number; offsetTop: number; width: number; height: number } | null, layout: { width: number; height: number }): BoxFit {
  if (!vv) return { kind: 'css' };
  const zoomed = Math.abs(vv.scale - 1) > SCALE_TOLERANCE;
  const offset = Math.abs(vv.offsetLeft) >= OFFSET_TOLERANCE || Math.abs(vv.offsetTop) >= OFFSET_TOLERANCE;
  const resized = Math.abs(vv.width - layout.width) > 1 || Math.abs(vv.height - layout.height) > 1;
  if (!zoomed && !offset && !resized) return { kind: 'css' };
  return { kind: 'visible', left: vv.offsetLeft, top: vv.offsetTop, width: vv.width, height: vv.height, scale: vv.scale };
}

/**
 * Place #game per boxFitFor. The safe-area insets are screen px at the
 * screen's edges, which are the visible rectangle's edges, so in layout px
 * they count 1 / scale.
 */
/** Returns true when the box moved (the canvas must then refit at once, so taps map to its new bounds). */
function fitBox(): boolean {
  const box = document.getElementById('game');
  if (!box) return false;
  const root = document.documentElement;
  const vv = window.visualViewport ?? null;
  const fit = boxFitFor(vv, { width: root.clientWidth, height: root.clientHeight });
  const key = fit.kind === 'css' ? '' : `${fit.left},${fit.top},${fit.width},${fit.height},${fit.scale}`;
  if ((box.dataset.fit ?? '') === key) return false;
  box.dataset.fit = key;
  if (fit.kind === 'css') {
    box.style.left = box.style.top = box.style.width = box.style.height = box.style.right = box.style.bottom = '';
    return true;
  }
  const inset = (side: string) => `env(safe-area-inset-${side}, 0px) / ${fit.scale}`;
  box.style.left = `calc(${fit.left}px + ${inset('left')})`;
  box.style.top = `calc(${fit.top}px + ${inset('top')})`;
  box.style.width = `calc(${fit.width}px - ${inset('left')} - ${inset('right')})`;
  box.style.height = `calc(${fit.height}px - ${inset('top')} - ${inset('bottom')})`;
  box.style.right = 'auto';
  box.style.bottom = 'auto';
  return true;
}

/** The usable area for choosing a layout: the visual viewport at scale 1, else the layout viewport (never a zoomed-in view). */
export function viewportSize(): { width: number; height: number } {
  const vv = window.visualViewport;
  if (vv && Math.abs(vv.scale - 1) <= SCALE_TOLERANCE) return { width: vv.width, height: vv.height };
  const root = document.documentElement;
  return { width: root.clientWidth || window.innerWidth, height: root.clientHeight || window.innerHeight };
}

/** Install the listeners; `refit` re-centres the canvas (and switches layout if the shape changed). */
export function installPageLock(refit: () => void): void {
  const stop = (e: Event) => {
    if (e.cancelable) e.preventDefault();
  };
  const opts: AddEventListenerOptions = { passive: false };
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, stop, opts);
  document.addEventListener('dblclick', stop, opts);
  document.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      // Two fingers anywhere, or one that started off the canvas (a side bar): nothing to pan or zoom.
      if (e.touches.length > 1 || !(e.target instanceof HTMLCanvasElement)) stop(e);
    },
    opts,
  );

  let timer: number | undefined;
  let lastRescale = -Infinity;
  const check = () => {
    timer = undefined;
    counts.checks += 1;
    const r = recoveryFor(sample());
    if (r !== null) {
      counts.recoveries += 1;
      scrollHome();
      const now = performance.now();
      if (r.rescale && now - lastRescale >= RESCALE_COOLDOWN_MS) {
        lastRescale = now;
        counts.rescales += 1;
        rescale();
      }
    }
    fitBox();
    counts.refits += 1;
    refit();
  };
  const schedule = () => {
    // The box follows the visible rectangle at once, and the canvas refits with it, so taps map
    // to its real bounds; the recovery check still runs after the quiet time.
    if (fitBox()) refit();
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(check, RECOVERY_DEBOUNCE_MS);
  };
  const vv = window.visualViewport;
  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  window.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule();
  });
  fitBox();
}
