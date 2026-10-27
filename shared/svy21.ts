/**
 * SVY21 (Singapore's projected grid, EPSG:3414) → WGS84 latitude/longitude.
 * Standard Transverse Mercator inverse with SLA's published SVY21 parameters. Pure; accurate to ~1 m.
 */
const a = 6378137;
const f = 1 / 298.257223563;
const oLat = 1.366666;
const oLon = 103.833333;
const oN = 38744.572;
const oE = 28001.642;
const k = 1;

const b = a * (1 - f);
const e2 = 2 * f - f * f;
const e4 = e2 * e2;
const e6 = e4 * e2;
const A0 = 1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256;
const A2 = (3 / 8) * (e2 + e4 / 4 + (15 * e6) / 128);
const A4 = (15 / 256) * (e4 + (3 * e6) / 4);
const A6 = (35 * e6) / 3072;
const rad = (d: number) => (d * Math.PI) / 180;

function meridian(latDeg: number): number {
  const r = rad(latDeg);
  return a * (A0 * r - A2 * Math.sin(2 * r) + A4 * Math.sin(4 * r) - A6 * Math.sin(6 * r));
}

/** northing (Y) and easting (X) in metres → { lat, lng } in degrees. */
export function svy21ToWgs84(northing: number, easting: number): { lat: number; lng: number } {
  const Np = northing - oN;
  const Mp = meridian(oLat) + Np / k;
  const n = (a - b) / (a + b);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n2 * n2;
  const G = a * (1 - n) * (1 - n2) * (1 + (9 * n2) / 4 + (225 * n4) / 64) * (Math.PI / 180);
  const s = (Mp * Math.PI) / (180 * G);
  const lp =
    s +
    ((3 * n) / 2 - (27 * n3) / 32) * Math.sin(2 * s) +
    ((21 * n2) / 16 - (55 * n4) / 32) * Math.sin(4 * s) +
    ((151 * n3) / 96) * Math.sin(6 * s) +
    ((1097 * n4) / 512) * Math.sin(8 * s);
  const sl = Math.sin(lp);
  const s2 = sl * sl;
  const rho = (a * (1 - e2)) / Math.pow(1 - e2 * s2, 1.5);
  const v = a / Math.sqrt(1 - e2 * s2);
  const p = v / rho;
  const p2 = p * p;
  const p3 = p2 * p;
  const p4 = p3 * p;
  const t = Math.tan(lp);
  const t2 = t * t;
  const t4 = t2 * t2;
  const t6 = t4 * t2;
  const Ep = easting - oE;
  const x = Ep / (k * v);
  const x2 = x * x;
  const x3 = x2 * x;
  const x5 = x3 * x2;
  const x7 = x5 * x2;
  const lf = t / (k * rho);
  const lat =
    lp -
    lf * ((Ep * x) / 2) +
    lf * ((Ep * x3) / 24) * (-4 * p2 + 9 * p * (1 - t2) + 12 * t2) -
    lf * ((Ep * x5) / 720) * (8 * p4 * (11 - 24 * t2) - 12 * p3 * (21 - 71 * t2) + 15 * p2 * (15 - 98 * t2 + 15 * t4) + 180 * p * (5 * t2 - 3 * t4) + 360 * t4) +
    lf * ((Ep * x7) / 40320) * (1385 - 3633 * t2 + 4095 * t4 + 1575 * t6);
  const sec = 1 / Math.cos(lp);
  const lon =
    rad(oLon) +
    x * sec -
    ((x3 * sec) / 6) * (p + 2 * t2) +
    ((x5 * sec) / 120) * (-4 * p3 * (1 - 6 * t2) + p2 * (9 - 68 * t2) + 72 * p * t2 + 24 * t4) -
    ((x7 * sec) / 5040) * (61 + 662 * t2 + 1320 * t4 + 720 * t6);
  return { lat: (lat * 180) / Math.PI, lng: (lon * 180) / Math.PI };
}
