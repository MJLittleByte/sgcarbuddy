import type { IconName } from '../components/Icon';

export type Tab = 'parking' | 'ev' | 'roads' | 'weather';

export const TABS: ReadonlyArray<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'parking', label: 'Parking', icon: 'park' },
  { id: 'ev', label: 'EV', icon: 'bolt' },
  { id: 'roads', label: 'Roads', icon: 'cctv' },
  { id: 'weather', label: 'Weather', icon: 'rain' },
];
