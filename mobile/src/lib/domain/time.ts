/**
 * Singapore time helpers. Everything here works in SGT (UTC+8, no daylight saving) regardless of the
 * phone's own time zone, because parking rules follow Singapore clock time.
 */

/** Singapore public holidays (MOM, via data.gov.sg "Singapore Public Holidays" collection 691, checked 27 Oct 2026). */
export const PUBLIC_HOLIDAYS: Readonly<Record<string, string>> = {
  '2026-01-01': "New Year's Day",
  '2026-02-17': 'Chinese New Year',
  '2026-02-18': 'Chinese New Year',
  '2026-03-21': 'Hari Raya Puasa',
  '2026-04-03': 'Good Friday',
  '2026-05-01': 'Labour Day',
  '2026-05-27': 'Hari Raya Haji',
  '2026-05-31': 'Vesak Day',
  '2026-06-01': 'Vesak Day (Observed)',
  '2026-08-09': 'National Day',
  '2026-08-10': 'National Day (Observed)',
  '2026-11-08': 'Deepavali',
  '2026-11-09': 'Deepavali (Observed)',
  '2026-12-25': 'Christmas Day',
  '2027-01-01': "New Year's Day",
  '2027-02-06': 'Chinese New Year',
  '2027-02-07': 'Chinese New Year',
  '2027-02-08': 'Chinese New Year (Observed)',
  '2027-03-10': 'Hari Raya Puasa',
  '2027-03-26': 'Good Friday',
  '2027-05-01': 'Labour Day',
  '2027-05-17': 'Hari Raya Haji',
  '2027-05-20': 'Vesak Day',
  '2027-08-09': 'National Day',
  '2027-10-28': 'Deepavali',
  '2027-12-25': 'Christmas Day',
};

const SGT_MS = 8 * 3600_000;

export interface SgParts {
  /** "2026-10-27" */
  date: string;
  /** 0 = Sunday … 6 = Saturday */
  dow: number;
  /** Minutes since midnight, Singapore time. */
  minute: number;
  holiday: boolean;
  /** Sunday or public holiday. */
  sunPH: boolean;
}

export function sgParts(t: Date | number, holidays: Readonly<Record<string, string>> = PUBLIC_HOLIDAYS): SgParts {
  const d = new Date((typeof t === 'number' ? t : t.getTime()) + SGT_MS);
  const date = d.toISOString().slice(0, 10);
  const dow = d.getUTCDay();
  const holiday = date in holidays;
  return { date, dow, minute: d.getUTCHours() * 60 + d.getUTCMinutes(), holiday, sunPH: dow === 0 || holiday };
}

/** Date of the 7am-to-7am "parking day" a moment belongs to (HDB caps run 7:00am to 7:00am). */
export function parkingDay(t: number): string {
  return new Date(t + SGT_MS - 7 * 3600_000).toISOString().slice(0, 10);
}

/** "6:00 pm" in Singapore time. */
export function sgClock(t: Date | number): string {
  return new Date(typeof t === 'number' ? t : t.getTime())
    .toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** HHMM ("0730") → minutes since midnight. */
export const hhmm = (s: string): number => Number(s.slice(0, 2)) * 60 + Number(s.slice(2, 4));
