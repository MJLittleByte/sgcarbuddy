import { BRAND, MARK_VIEWBOX, markSvg } from './mark';

/** The SG Car Buddy mark on its own (no tile). `cut` should match the background behind it. */
export function LogoMark({ size = 64, cut = BRAND.blue }: { size?: number; cut?: string }) {
  return <svg width={size} height={size} viewBox={MARK_VIEWBOX} role="img" aria-label="SG Car Buddy logo" dangerouslySetInnerHTML={{ __html: markSvg(cut) }} />;
}
