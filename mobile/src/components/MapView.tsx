import maplibregl, { type GeoJSONSource, type ImageSource, type Map as MlMap, type Marker, type StyleSpecification, type FilterSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Tab } from '../app/tabs';
import type { LatLng } from '../lib/domain/geo';
import { drawPin, PIN_RATIO } from './pins';
import { Icon } from './Icon';

/** OpenFreeMap: free vector tiles, no key. Day = Liberty (concept A), Night = Fiord navy (concept C). */
const STYLE_URL = { light: 'https://tiles.openfreemap.org/styles/liberty', dark: 'https://tiles.openfreemap.org/styles/fiord' };
const DOT = {
  light: { plenty: '#0d9a55', limited: '#d97c00', few: '#dc3439', full: '#dc3439', none: '#8a94a6', stroke: '#ffffff' },
  dark: { plenty: '#2ff59a', limited: '#ffc94a', few: '#ff5c7a', full: '#ff5c7a', none: '#6b7491', stroke: '#0b1222' },
};
const BLANK: StyleSpecification = { version: 8, sources: {}, layers: [] };
const SG_BOUNDS: [[number, number], [number, number]] = [
  [103.45, 1.1],
  [104.2, 1.6],
];
/** Weather: the NEA 70 km radar covers parts of Johor and the Riau islands, so allow panning and zooming out over it. */
const RADAR_BOUNDS: [[number, number], [number, number]] = [
  [102.9, 0.55],
  [105.0, 2.15],
];
const START = { center: [103.8198, 1.3521] as [number, number], zoom: 11 };
/** Survives a remount (Day ↔ Night swaps the map style by remounting). */
let lastView: { center: [number, number]; zoom: number } | null = null;

export type Fc = import('geojson').FeatureCollection;
const EMPTY: Fc = { type: 'FeatureCollection', features: [] };

export type MapSelect = { kind: 'carpark' | 'charger'; id: string } | null;

export interface MapViewHandle {
  flyTo: (p: LatLng, zoom?: number) => void;
  fit: (points: LatLng[], maxZoom?: number, pad?: number) => void;
  center: () => LatLng | null;
}

export interface MapViewProps {
  theme: 'light' | 'dark';
  tab: Tab;
  carparks: Fc;
  chargers: Fc;
  floods: Fc;
  radar: { url: string; bbox: [number, number, number, number] } | null;
  selected: MapSelect;
  here: LatLng | null;
  place: { label: string; at: LatLng } | null;
  parked: LatLng | null;
  padding: { top: number; bottom: number };
  onSelect: (s: MapSelect) => void;
  onUserMoved: (center: LatLng) => void;
  onLongPress: (p: LatLng) => void;
  /** Called once the style (and our layers) are ready: after first load and after a Day/Night remount. */
  onReady?: () => void;
}

/** Hide OSM's own parking / fuel / bus icons (ours are official and live) and the 3D buildings. */
function tidy(style: StyleSpecification): StyleSpecification {
  const hide: FilterSpecification = ['!', ['in', ['get', 'class'], ['literal', ['parking', 'bus', 'fuel', 'car']]]];
  return {
    ...style,
    layers: style.layers
      .filter((l) => l.type !== 'fill-extrusion')
      .map((l) => {
        // Concept A/C maps are clean: landmark icons only when zoomed right in, never OSM parking/fuel/bus icons.
        if ('source-layer' in l && l['source-layer'] === 'poi' && 'filter' in l && l.filter) return { ...l, minzoom: Math.max(l.minzoom ?? 0, 16.6), filter: ['all', l.filter, hide] } as typeof l;
        if (l.id === 'building') return { ...l, maxzoom: 24 } as typeof l;
        return l;
      }),
  };
}

const pinLayer = (id: string, source: string, kind: string, minzoom: number, selected: boolean, visible: boolean): maplibregl.LayerSpecification => ({
  id,
  type: 'symbol',
  source,
  minzoom,
  filter: selected ? ['==', ['get', 'id'], '__none__'] : ['!=', ['get', 'id'], '__none__'],
  layout: {
    visibility: visible ? 'visible' : 'none',
    'icon-image': ['concat', `pin|${kind}|`, ['get', 'level'], '|', ['get', 'label'], selected ? '|1' : '|0'],
    'icon-anchor': 'bottom',
    // Tip just above the coloured dot drawn underneath (dots stay visible where pins collide).
    'icon-offset': [0, -3],
    'icon-allow-overlap': selected,
    'icon-ignore-placement': selected,
    'icon-padding': 0,
    'symbol-sort-key': ['get', 'rank'],
    'symbol-z-order': 'source',
  },
});

const dotLayer = (id: string, source: string, theme: 'light' | 'dark', minzoom: number, visible: boolean): maplibregl.LayerSpecification => ({
  id,
  type: 'circle',
  source,
  minzoom,
  layout: { visibility: visible ? 'visible' : 'none' },
  paint: {
    'circle-color': ['match', ['get', 'level'], 'plenty', DOT[theme].plenty, 'limited', DOT[theme].limited, 'few', DOT[theme].few, 'full', DOT[theme].full, DOT[theme].none],
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.2, 14, 3.6, 17, 4.6],
    'circle-stroke-color': DOT[theme].stroke,
    'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 14, 1.5],
  },
});

const LAYERS_BY_TAB: Record<Tab, string[]> = {
  parking: ['cp-dot', 'cp-pin', 'cp-sel'],
  ev: ['ev-dot', 'ev-pin', 'ev-sel'],
  // Roads is a full-screen page (no map).
  roads: [],
  weather: ['radar', 'flood-fill', 'flood-line'],
};
const ALL_LAYERS = [...new Set(Object.values(LAYERS_BY_TAB).flat())];

function withLayers(base: StyleSpecification, theme: 'light' | 'dark', tab: Tab): StyleSpecification {
  const on = (id: string) => LAYERS_BY_TAB[tab].includes(id);
  const flood = theme === 'dark' ? '#6fc3ff' : '#2563eb';
  return {
    ...base,
    sources: {
      ...base.sources,
      cp: { type: 'geojson', data: EMPTY },
      ev: { type: 'geojson', data: EMPTY },
      flood: { type: 'geojson', data: EMPTY },
    },
    layers: [
      ...base.layers,
      { id: 'flood-fill', type: 'fill', source: 'flood', layout: { visibility: on('flood-fill') ? 'visible' : 'none' }, paint: { 'fill-color': flood, 'fill-opacity': 0.16 } },
      { id: 'flood-line', type: 'line', source: 'flood', layout: { visibility: on('flood-line') ? 'visible' : 'none' }, paint: { 'line-color': flood, 'line-width': 1.5, 'line-dasharray': [2, 2] } },
      dotLayer('cp-dot', 'cp', theme, 10, on('cp-dot')),
      dotLayer('ev-dot', 'ev', theme, 10, on('ev-dot')),
      pinLayer('cp-pin', 'cp', 'cp', 13.2, false, on('cp-pin')),
      pinLayer('ev-pin', 'ev', 'ev', 12.5, false, on('ev-pin')),
      pinLayer('cp-sel', 'cp', 'cp', 0, true, on('cp-sel')),
      pinLayer('ev-sel', 'ev', 'ev', 0, true, on('ev-sel')),
    ],
  };
}

function markerEl(cls: string, label: string, html = ''): HTMLElement {
  const el = document.createElement('div');
  el.className = cls;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  el.innerHTML = html;
  return el;
}

const SELECT_LAYERS: Array<[string, NonNullable<MapSelect>['kind']]> = [
  ['cp-sel', 'carpark'],
  ['cp-pin', 'carpark'],
  ['cp-dot', 'carpark'],
  ['ev-sel', 'charger'],
  ['ev-pin', 'charger'],
  ['ev-dot', 'charger'],
];

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(props, ref) {
  const { theme, tab, carparks, chargers, floods, radar, selected, here, place, parked, padding } = props;
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  // Bumped each time OUR style (with the carpark/EV/camera layers) is ready, so data and layer state are re-applied.
  const [styleTick, setStyleTick] = useState(0);
  const loaded = styleTick > 0;
  const [unsupported, setUnsupported] = useState(false);
  const [offline, setOffline] = useState(false);
  const cb = useRef(props);
  cb.current = props;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const markers = useRef<{ here?: Marker; place?: Marker; parked?: Marker }>({});

  // The top bar and bottom sheet cover parts of the map: fit/fly into the visible gap between them.
  // (Explicit per-call insets instead of map padding, so a sheet snap never cancels a camera animation.)
  const padRef = useRef(padding);
  padRef.current = padding;
  const insets = (extra: number) => {
    const h = mapRef.current?.getContainer().clientHeight ?? 800;
    const top = padRef.current.top + extra;
    const bottom = Math.min(padRef.current.bottom + extra, Math.max(extra, h - top - 140));
    return { top, bottom, left: extra, right: extra };
  };

  useImperativeHandle(ref, () => ({
    flyTo: (p, zoom) => {
      const map = mapRef.current;
      if (!map) return;
      const i = insets(0);
      map.flyTo({ center: [p.lng, p.lat], zoom: zoom ?? Math.max(map.getZoom(), 15.4), offset: [0, (i.top - i.bottom) / 2], duration: 650, essential: true });
    },
    fit: (points, maxZoom = 15.8, pad = 36) => {
      const map = mapRef.current;
      if (!map || !points.length) return;
      const lngs = points.map((p) => p.lng);
      const lats = points.map((p) => p.lat);
      const bounds: [[number, number], [number, number]] = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ];
      if (map.cameraForBounds(bounds, { padding: insets(pad), maxZoom })) map.fitBounds(bounds, { padding: insets(pad), maxZoom, duration: 650 });
      else map.flyTo({ center: [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2], zoom: 14, duration: 650 });
    },
    center: () => {
      const map = mapRef.current;
      if (!map) return null;
      // Centre of the visible gap, not of the whole canvas.
      const i = insets(0);
      const c = map.unproject([map.getContainer().clientWidth / 2, (i.top + map.getContainer().clientHeight - i.bottom) / 2]);
      return { lat: c.lat, lng: c.lng };
    },
  }));

  // Create the map once per theme (the parent remounts this component with key={theme}).
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: box,
        style: BLANK,
        center: lastView?.center ?? START.center,
        zoom: lastView?.zoom ?? START.zoom,
        minZoom: 10,
        maxZoom: 19,
        maxBounds: SG_BOUNDS,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 0,
      });
    } catch {
      setUnsupported(true);
      return;
    }
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __map: MlMap }).__map = map;
    let tiles = false;
    map.setStyle(STYLE_URL[theme], { transformStyle: (_prev, next) => withLayers(tidy(next), theme, tabRef.current) });
    map.on('styleimagemissing', (e) => {
      if (map.hasImage(e.id)) return;
      const img = e.id.startsWith('pin|') ? drawPin(e.id, theme === 'dark') : null;
      map.addImage(e.id, img ?? { width: 1, height: 1, data: new Uint8Array(4) }, { pixelRatio: img ? PIN_RATIO : 1 });
    });
    // 'style.load' also fires for the initial blank style: only count the real one (it has our sources).
    map.on('style.load', () => {
      if (!map.getSource('cp')) return;
      setStyleTick((n) => n + 1);
      cb.current.onReady?.();
    });
    map.on('data', (e) => {
      if (e.dataType === 'source' && 'tile' in e && e.tile) {
        tiles = true;
        setOffline(false);
      }
    });
    map.on('error', () => !tiles && setOffline(true));
    map.on('moveend', () => {
      const c = map.getCenter();
      lastView = { center: [c.lng, c.lat], zoom: map.getZoom() };
    });

    let byUser = false;
    const userStart = (e: { originalEvent?: Event }) => {
      if (e.originalEvent) byUser = true;
    };
    map.on('dragstart', userStart);
    map.on('zoomstart', userStart);
    map.on('moveend', () => {
      if (!byUser) return;
      byUser = false;
      const h = map.getContainer().clientHeight;
      const c = map.unproject([map.getContainer().clientWidth / 2, (padRef.current.top + h - Math.min(padRef.current.bottom, h - padRef.current.top - 140)) / 2]);
      cb.current.onUserMoved({ lat: c.lat, lng: c.lng });
    });

    map.on('click', (e) => {
      const layers = SELECT_LAYERS.filter(([id]) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
      const hits = layers.length ? map.queryRenderedFeatures(e.point, { layers: layers.map(([id]) => id) }) : [];
      const hit = hits[0];
      if (hit) {
        const kind = SELECT_LAYERS.find(([id]) => id === hit.layer.id)?.[1];
        const id = hit.properties?.id;
        if (kind && id != null) return cb.current.onSelect({ kind, id: String(id) });
      }
      cb.current.onSelect(null);
    });
    for (const [id] of SELECT_LAYERS) {
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
    }
    map.on('contextmenu', (e) => cb.current.onLongPress({ lat: e.lngLat.lat, lng: e.lngLat.lng }));

    // OSM attribution: shown in full, then collapsed to (i) after 5 s or the first touch.
    const collapse = () => box.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    const t = window.setTimeout(collapse, 5000);
    map.once('dragstart', collapse);

    return () => {
      window.clearTimeout(t);
      markers.current = {};
      map.remove();
      mapRef.current = null;
      setStyleTick(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data.
  useEffect(() => void (loaded && (mapRef.current?.getSource('cp') as GeoJSONSource | undefined)?.setData(carparks)), [styleTick, carparks]);
  useEffect(() => void (loaded && (mapRef.current?.getSource('ev') as GeoJSONSource | undefined)?.setData(chargers)), [styleTick, chargers]);
  useEffect(() => void (loaded && (mapRef.current?.getSource('flood') as GeoJSONSource | undefined)?.setData(floods)), [styleTick, floods]);

  // Tab → which layers are visible.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    for (const id of [...ALL_LAYERS]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', LAYERS_BY_TAB[tab].includes(id) ? 'visible' : 'none');
  }, [tab, styleTick]);

  // Tab → how far the map may move. Weather opens up to the whole radar area; the other tabs stay on Singapore.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tab === 'weather') {
      map.setMaxBounds(RADAR_BOUNDS);
      map.setMinZoom(8);
    } else {
      map.setMinZoom(10);
      map.setMaxBounds(SG_BOUNDS);
    }
  }, [tab, styleTick]);

  // Selection.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const pairs: Array<[string, string, NonNullable<MapSelect>['kind']]> = [
      ['cp-pin', 'cp-sel', 'carpark'],
      ['ev-pin', 'ev-sel', 'charger'],
    ];
    for (const [base, sel, kind] of pairs) {
      const id = selected?.kind === kind ? selected.id : '__none__';
      map.setFilter(base, ['!=', ['get', 'id'], id]);
      map.setFilter(sel, ['==', ['get', 'id'], id]);
    }
  }, [selected?.kind, selected?.id, styleTick]);

  // Rain radar overlay.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource('radar') as ImageSource | undefined;
    if (!radar) {
      if (map.getLayer('radar')) map.setLayoutProperty('radar', 'visibility', 'none');
      return;
    }
    const [w, s, e, n] = radar.bbox;
    const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
      [w, n],
      [e, n],
      [e, s],
      [w, s],
    ];
    if (src) src.updateImage({ url: radar.url, coordinates });
    else {
      map.addSource('radar', { type: 'image', url: radar.url, coordinates });
      map.addLayer(
        { id: 'radar', type: 'raster', source: 'radar', paint: { 'raster-opacity': theme === 'dark' ? 0.75 : 0.62, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } },
        'flood-fill',
      );
    }
    map.setLayoutProperty('radar', 'visibility', tab === 'weather' ? 'visible' : 'none');
  }, [radar?.url, styleTick, tab]);

  // Markers: you, the chosen place, your parked car.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const m = markers.current;
    if (here) {
      m.here ??= new maplibregl.Marker({ element: markerEl('mk-here', 'You are here') });
      m.here.setLngLat([here.lng, here.lat]).addTo(map);
    } else m.here?.remove();
  }, [here?.lat, here?.lng, styleTick]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const m = markers.current;
    m.place?.remove();
    m.place = undefined;
    if (place) m.place = new maplibregl.Marker({ element: markerEl('mk-place', place.label, '<i></i>'), anchor: 'bottom' }).setLngLat([place.at.lng, place.at.lat]).addTo(map);
  }, [place?.at.lat, place?.at.lng, place?.label, styleTick]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const m = markers.current;
    m.parked?.remove();
    m.parked = undefined;
    if (parked) m.parked = new maplibregl.Marker({ element: markerEl('mk-parked', 'Your parked car', '<b>P</b>'), anchor: 'bottom' }).setLngLat([parked.lng, parked.lat]).addTo(map);
  }, [parked?.lat, parked?.lng, styleTick]);

  return (
    <div className="map-wrap">
      <div ref={boxRef} className="map-gl" role="region" aria-label="Map. Everything on the map is also listed in the panel below." />
      {unsupported && (
        <div className="map-msg">
          <Icon name="map" /> This phone can't show the map. The lists still work.
        </div>
      )}
      {!unsupported && offline && (
        <div className="map-msg">
          <Icon name="map" /> The map needs internet. The lists still work.
        </div>
      )}
    </div>
  );
});
