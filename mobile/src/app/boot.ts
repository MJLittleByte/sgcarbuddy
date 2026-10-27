/**
 * The loading screen (#boot) is plain HTML in index.html, so it shows the moment the WebView opens,
 * before any JavaScript runs. Once the app has loaded its saved data we fade it out — after a short
 * minimum, so the name and tagline can actually be read instead of flashing past.
 */
const MIN_VISIBLE_MS = 1100;

export function hideBoot(): void {
  const el = document.getElementById('boot');
  if (!el || el.dataset.leaving) return;
  el.dataset.leaving = '1';
  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
  window.setTimeout(() => {
    el.classList.add('boot-out');
    window.setTimeout(() => el.remove(), 400);
  }, wait);
}
