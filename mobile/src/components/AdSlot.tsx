/**
 * Ads (plan §15). Banner: root tabs only, at the very bottom BELOW the tab bar behind a non-clickable
 * divider, fixed reserved height, collapses when empty. In-feed: exactly one card in the Roads camera feed,
 * after the 2nd camera, about the size of a camera image, clearly labelled.
 * Until AdMob is wired up these are mock slots shown in `npm run dev` only (VITE_AD_PLACEHOLDER=off hides
 * them); release builds show nothing unless VITE_AD_PLACEHOLDER=on.
 */
export const SHOW_AD_SLOT = import.meta.env.DEV ? import.meta.env.VITE_AD_PLACEHOLDER !== 'off' : import.meta.env.VITE_AD_PLACEHOLDER === 'on';

export function AdSlot() {
  if (!SHOW_AD_SLOT) return null;
  return (
    <aside className="ad-slot" aria-label="Advertisement">
      <span className="ad-sep" aria-hidden="true" />
      <div className="ad-mock">
        <span className="ad-badge">Ad</span>
        <span className="ad-tx">
          <b>Test ad · banner preview</b>
          <small>Real ads come from Google AdMob</small>
        </span>
      </div>
    </aside>
  );
}

export function InFeedAd() {
  if (!SHOW_AD_SLOT) return null;
  return (
    <aside className="cam ad-card" aria-label="Advertisement">
      <div className="img ad-img">
        <span className="ad-badge">Ad</span>
        <b>Test ad · in-feed preview</b>
        <small>About the size of a camera image. One per feed.</small>
      </div>
      <div className="cap">
        <span>
          <b>Sponsored</b>
          <small>Clearly labelled, never inside the camera viewer</small>
        </span>
      </div>
    </aside>
  );
}
