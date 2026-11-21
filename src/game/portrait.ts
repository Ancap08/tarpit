// The "turn your device" card (milestone 14): a DOM overlay from index.html
// (#rotate-card), shown while the window is taller than it is wide. It is
// not drawn on the canvas, so it covers the whole screen whatever the scale.
// GameScene runs no ticks while it shows. Narrow, tall desktop windows count
// as portrait too.

let visible = false;

/** True while the window is in portrait and the card is up. */
export function portraitCardVisible(): boolean {
  return visible;
}

function sync(card: HTMLElement): void {
  visible = window.innerHeight > window.innerWidth;
  card.hidden = !visible;
}

/** Show or hide #rotate-card now and on every resize or orientation change. */
export function installPortraitCard(): void {
  const card = document.getElementById('rotate-card');
  if (!card) return;
  const update = () => sync(card);
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  window.matchMedia('(orientation: portrait)').addEventListener('change', update);
  update();
}
