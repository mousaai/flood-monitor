/**
 * useRealWeather.ts — React hook for real-time weather data
 * Uses tRPC server-side procedure to fetch data from Open-Meteo API.
 * Server-side ensures consistent timezone handling across all browsers.
 *
 * Data sources:
 *   - Open-Meteo ERA5 (precipitation, temperature, wind)
 *   - GloFAS Flood API (wadi discharge, 5 km resolution)
 *   - DEM Topographic Analysis (susceptibility, soil type, elevation)
 */

import { trpc } from '@/lib/trpc';
import type { SystemWeatherData, RegionWeather } from '@/services/weatherApi';

// Re-export types for consumers
export type { SystemWeatherData, RegionWeather };

// Water accumulation level type
export type WaterAccumulationLevel = 'none' | 'minor' | 'moderate' | 'severe' | 'extreme';

// Accumulation summary shape (mirrors server AccumulationSummary)
export interface AccumulationSummary {
  totalRegionsWithWater: number;
  extremeCount: number;
  severeCount: number;
  moderateCount: number;
  minorCount: number;
  maxScore: number;
  maxScoreRegionId: string;
  totalEstimatedAreaKm2: number;
  activeWadis: number;
}

// Extended SystemWeatherData with accumulation summary
export interface ExtendedSystemWeatherData extends SystemWeatherData {
  accumulationSummary: AccumulationSummary;
}

interface UseRealWeatherReturn {
  data: ExtendedSystemWeatherData | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
  isLive: boolean;
}

const DEFAULT_ACCUMULATION_SUMMARY: AccumulationSummary = {
  totalRegionsWithWater: 0,
  extremeCount: 0,
  severeCount: 0,
  moderateCount: 0,
  minorCount: 0,
  maxScore: 0,
  maxScoreRegionId: '',
  totalEstimatedAreaKm2: 0,
  activeWadis: 0,
};

export function useRealWeather(): UseRealWeatherReturn {
  const utils = trpc.useUtils();

  const query = trpc.weather.getLiveData.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,        // auto-refresh every 5 minutes
    refetchIntervalInBackground: true,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
  });

  const refresh = () => {
    utils.weather.getLiveData.invalidate();
  };

  const rawData = query.data?.success ? query.data.data : null;

  const data: ExtendedSystemWeatherData | null = rawData ? {
    regions: rawData.regions as SystemWeatherData['regions'],
    fetchedAt: rawData.fetchedAt,
    source: rawData.source,
    accumulationSummary: (rawData as any).accumulationSummary ?? DEFAULT_ACCUMULATION_SUMMARY,
  } : null;

  return {
    data,
    loading: query.isLoading,
    error: query.error?.message ?? (query.data?.success === false ? (query.data as { error?: string }).error ?? 'Failed to fetch data' : null),
    lastUpdated: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
    refresh,
    isLive: !!data && query.isSuccess,
  };
}

/**
 * computeWeatherSummary — derives KPI metrics from live weather data
 *
 * Alert counting methodology (UAE NCM / ADCD standard):
 *   - "Active Alert" = region with CURRENT precipitation > 0 mm/h OR floodRisk >= 30
 *     AND the alert is driven by CURRENT conditions (not historical 24h accumulation only)
 *   - Historical 24h data is shown as context, NOT as active alert trigger
 *
 * This prevents the common issue of 80+ "active" alerts when a storm has passed
 * but 24h accumulation is still high.
 */
export function computeWeatherSummary(data: ExtendedSystemWeatherData | null) {
  if (!data) return null;

  const { regions } = data;

  // ── Precipitation signals ──────────────────────────────────────────────────
  const maxCurrentPrecip = Math.max(...regions.map(r => r.currentPrecipitation));
  const maxTotalPrecip   = Math.max(...regions.map(r => r.totalLast24h));
  const isRainActive     = maxCurrentPrecip > 0;

  // Primary display: current rain rate if active, else 24h historical total
  const totalPrecip = isRainActive ? maxCurrentPrecip : maxTotalPrecip;

  // ── Flood risk ─────────────────────────────────────────────────────────────
  const maxRisk = Math.max(...regions.map(r => r.floodRisk));
  const avgTemp = regions.reduce((sum, r) => sum + r.currentTemperature, 0) / regions.length;
  const highestRiskRegion = regions.reduce(
    (max, r) => r.floodRisk > max.floodRisk ? r : max,
    regions[0]
  );

  // ── Alert counting — current conditions only ──────────────────────────────
  // A region is "actively alerting" only if:
  //   (a) it has current precipitation > 0 mm/h, OR
  //   (b) its floodRisk is driven by active rain (currentPrecip > 0 OR maxNext48h > 5 mm)
  // This prevents stale 24h-accumulation from inflating the alert count after a storm passes.
  const activeRegions = regions.filter(r =>
    r.currentPrecipitation > 0 ||
    (r.floodRisk >= 30 && (r.currentPrecipitation > 0 || r.maxNext48h > 5))
  );

  const criticalCount = activeRegions.filter(r => r.alertLevel === 'critical').length;
  const warningCount  = activeRegions.filter(r => r.alertLevel === 'warning').length;
  const watchCount    = activeRegions.filter(r => r.alertLevel === 'watch').length;

  // ── Water Accumulation Summary ─────────────────────────────────────────────
  const accSummary = data.accumulationSummary ?? DEFAULT_ACCUMULATION_SUMMARY;

  const regionsWithWater = regions.filter(r =>
    (r as any).waterAccumulation?.level !== 'none' &&
    (r as any).waterAccumulation?.level !== undefined
  );

  const highestAccumulationRegion = regions.reduce((max, r) => {
    const score    = (r as any).waterAccumulation?.score ?? 0;
    const maxScore = (max as any).waterAccumulation?.score ?? 0;
    return score > maxScore ? r : max;
  }, regions[0]);

  const totalFloodedAreaKm2 = regions.reduce(
    (sum, r) => sum + ((r as any).waterAccumulation?.estimatedAreaKm2 ?? 0),
    0
  );

  const activeWadis = regions.filter(r =>
    ((r as any).waterAccumulation?.wadiDischarge ?? 0) > 0.5
  ).length;

  // ── Chart data (12h back + 36h forward for reference region) ──────────────
  const refRegion = regions.find(r => r.id === 'abudhabi-city') || regions[0];
  const _now      = new Date();
  const _dubaiNow = new Date(_now.getTime() + 4 * 60 * 60 * 1000);
  const _nowStr   = [
    _dubaiNow.getUTCFullYear(),
    String(_dubaiNow.getUTCMonth() + 1).padStart(2, '0'),
    String(_dubaiNow.getUTCDate()).padStart(2, '0'),
  ].join('-') + 'T' + String(_dubaiNow.getUTCHours()).padStart(2, '0') + ':00';

  const _currentIdx = refRegion.hourlyTimes.findIndex((t: string) => t === _nowStr);
  const _ci         = _currentIdx >= 0 ? _currentIdx : 24;
  const _startIdx   = Math.max(0, _ci - 12);
  const _endIdx     = Math.min(refRegion.hourlyTimes.length, _startIdx + 48);

  const chartData = refRegion.hourlyTimes.slice(_startIdx, _endIdx).map((time, i) => ({
    time:        time.split('T')[1] || time,
    actual:      refRegion.hourlyPrecipitation[_startIdx + i] || 0,
    probability: refRegion.hourlyProbability[_startIdx + i] || 0,
    isNow:       (_startIdx + i) === _ci,
  }));

  return {
    // Alert counts — CURRENT conditions only
    criticalCount,
    warningCount,
    watchCount,
    activeAlerts: criticalCount + warningCount + watchCount,

    // Precipitation
    totalPrecip:    Math.round(totalPrecip * 10) / 10,
    maxTotalPrecip: Math.round(maxTotalPrecip * 10) / 10,   // 24h historical context
    isRainActive,

    // Risk & temperature
    maxRisk,
    avgTemp:            Math.round(avgTemp * 10) / 10,
    highestRiskRegion,

    // Chart
    chartData,

    // Water accumulation
    accumulationSummary:       accSummary,
    regionsWithWater,
    highestAccumulationRegion,
    totalFloodedAreaKm2:       Math.round(totalFloodedAreaKm2 * 10) / 10,
    activeWadis,
  };
}
