/**
 * historicalDataService.ts — Historical Rainfall & Flood Data Service
 * Fetches real ERA5 reanalysis data from Open-Meteo Archive API
 * Coverage: 2015-01-01 → today (up to 5 days ago, ERA5 lag)
 * Regions: Abu Dhabi, Al Ain, Al Dhafra (3 representative coords)
 * No API key required — Open-Meteo is free & open
 */

// ── Representative coordinates for each city ────────────────────────────────
const CITY_COORDS = {
  abudhabi: { lat: 24.4539, lon: 54.3773, nameAr: 'أبوظبي', nameEn: 'Abu Dhabi' },
  alain:    { lat: 24.2075, lon: 55.7447, nameAr: 'العين',   nameEn: 'Al Ain'    },
  aldhafra: { lat: 23.6000, lon: 53.0000, nameAr: 'الظفرة',  nameEn: 'Al Dhafra' },
};

export type CityKey = keyof typeof CITY_COORDS;

export interface YearlyStats {
  year: number;
  totalPrecip: number;       // mm — annual total
  maxDailyPrecip: number;    // mm — single-day peak
  rainyDays: number;         // days with precip > 0.5 mm
  floodEvents: number;       // days with precip > 20 mm
  extremeEvents: number;     // days with precip > 50 mm
  monthlyTotals: number[];   // 12 values (Jan–Dec) mm
  peakMonth: number;         // 1–12
  peakDate: string;          // YYYY-MM-DD
}

export interface CityHistoricalData {
  city: CityKey;
  nameAr: string;
  nameEn: string;
  years: YearlyStats[];
  fetchedAt: string;
}

export interface HistoricalComparisonData {
  cities: CityHistoricalData[];
  availableYears: number[];
  fetchedAt: string;
  source: string;
}

// ── In-memory cache (TTL: 6 hours — ERA5 data rarely changes) ────────────────
let _cache: HistoricalComparisonData | null = null;
let _cacheTime = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h

// ── Helpers ──────────────────────────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, '0'); }
function dateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ERA5 has ~5-day lag; cap end date accordingly */
function getEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 5);
  return dateStr(d);
}

const START_DATE = '2015-01-01';

/** Fetch daily precipitation for one city from Open-Meteo Archive API */
async function fetchCityRaw(city: CityKey): Promise<{ dates: string[]; precip: number[] }> {
  const { lat, lon } = CITY_COORDS[city];
  const end = getEndDate();
  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat}&longitude=${lon}` +
    `&start_date=${START_DATE}&end_date=${end}` +
    `&daily=precipitation_sum` +
    `&timezone=Asia%2FDubai`;

  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Open-Meteo Archive HTTP ${res.status} for ${city}`);
  const json = await res.json() as {
    daily: { time: string[]; precipitation_sum: (number | null)[] }
  };
  return {
    dates:  json.daily.time,
    precip: json.daily.precipitation_sum.map(v => v ?? 0),
  };
}

/** Aggregate daily data into per-year stats */
function aggregateYears(dates: string[], precip: number[]): YearlyStats[] {
  const byYear: Record<number, { precip: number[]; dates: string[] }> = {};
  for (let i = 0; i < dates.length; i++) {
    const y = parseInt(dates[i].slice(0, 4), 10);
    if (!byYear[y]) byYear[y] = { precip: [], dates: [] };
    byYear[y].precip.push(precip[i]);
    byYear[y].dates.push(dates[i]);
  }

  return Object.entries(byYear)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([yearStr, { precip: yp, dates: yd }]) => {
      const year = Number(yearStr);
      const totalPrecip = parseFloat(yp.reduce((s, v) => s + v, 0).toFixed(1));
      const maxDailyPrecip = parseFloat(Math.max(...yp).toFixed(1));
      const rainyDays = yp.filter(v => v > 0.5).length;
      const floodEvents = yp.filter(v => v > 20).length;
      const extremeEvents = yp.filter(v => v > 50).length;

      // Monthly totals
      const monthlyTotals = Array(12).fill(0) as number[];
      for (let i = 0; i < yd.length; i++) {
        const m = parseInt(yd[i].slice(5, 7), 10) - 1;
        monthlyTotals[m] = parseFloat((monthlyTotals[m] + yp[i]).toFixed(1));
      }

      const peakMonth = monthlyTotals.indexOf(Math.max(...monthlyTotals)) + 1;
      const peakIdx = yp.indexOf(maxDailyPrecip);
      const peakDate = yd[peakIdx] ?? `${year}-01-01`;

      return { year, totalPrecip, maxDailyPrecip, rainyDays, floodEvents, extremeEvents, monthlyTotals, peakMonth, peakDate };
    });
}

/** Fetch all 3 cities in parallel and build comparison dataset */
export async function fetchHistoricalData(): Promise<HistoricalComparisonData> {
  // Return cache if fresh
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;

  const cityKeys = Object.keys(CITY_COORDS) as CityKey[];
  const results = await Promise.all(
    cityKeys.map(async (city) => {
      const { dates, precip } = await fetchCityRaw(city);
      const years = aggregateYears(dates, precip);
      return {
        city,
        nameAr: CITY_COORDS[city].nameAr,
        nameEn: CITY_COORDS[city].nameEn,
        years,
        fetchedAt: new Date().toISOString(),
      } as CityHistoricalData;
    })
  );

  // Collect all years that appear in ALL cities
  const yearSets = results.map(r => new Set(r.years.map(y => y.year)));
  const allYears = [...yearSets[0]].filter(y => yearSets.every(s => s.has(y))).sort();

  _cache = {
    cities: results,
    availableYears: allYears,
    fetchedAt: new Date().toISOString(),
    source: 'Open-Meteo Archive API — ERA5 Reanalysis (ECMWF)',
  };
  _cacheTime = Date.now();
  return _cache;
}

export function invalidateHistoricalCache() {
  _cache = null;
  _cacheTime = 0;
}
