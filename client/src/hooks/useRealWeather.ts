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
    refetchInterval: 5 * 60 * 1000,        // auto-refresh every 5 minutes (aligned with server refresh cycle)
    refetchIntervalInBackground: true,     // keep refreshing even when tab is in background
    staleTime: 0,                          // always consider stale so refetchInterval fires reliably
    gcTime: 10 * 60 * 1000,               // keep in cache for 10 minutes
    refetchOnWindowFocus: true,            // refresh when user returns to tab
    refetchOnReconnect: true,              // refresh when network reconnects
    retry: 2,
  });

  const refresh = () => {
    utils.weather.getLiveData.invalidate();
  };

  const rawData = query.data?.success ? query.data.data : null;

  // Adapt server response to ExtendedSystemWeatherData shape
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
 * Compute summary stats from real weather data
 * Includes both classic flood metrics and new water accumulation metrics
 */
export function computeWeatherSummary(data: ExtendedSystemWeatherData | null) {
  if (!data) return null;

  const { regions } = data;
  const criticalCount = regions.filter(r => r.alertLevel === 'critical').length;
  const warningCount = regions.filter(r => r.alertLevel === 'warning').length;
  const watchCount = regions.filter(r => r.alertLevel === 'watch').length;

  // Use max CURRENT precipitation (last 15-min reading) for immediate flood monitoring
  // Falls back to max 24h if no current rain, but shows it as historical context
  const maxCurrentPrecip = Math.max(...regions.map(r => r.currentPrecipitation));
  const maxTotalPrecip = Math.max(...regions.map(r => r.totalLast24h));
  // Show current rain if active, otherwise show 24h total as context
  const totalPrecip = maxCurrentPrecip > 0 ? maxCurrentPrecip : maxTotalPrecip;
  const maxRisk = Math.max(...regions.map(r => r.floodRisk));
  const avgTemp = regions.reduce((sum, r) => sum + r.currentTemperature, 0) / regions.length;

  const highestRiskRegion = regions.reduce((max, r) => r.floodRisk > max.floodRisk ? r : max, regions[0]);

  // ── Water Accumulation Summary ──────────────────────────────────────────
  const accSummary = data.accumulationSummary ?? DEFAULT_ACCUMULATION_SUMMARY;

  // Regions with any water (minor or above)
  const regionsWithWater = regions.filter(r =>
    (r as any).waterAccumulation?.level !== 'none' &&
    (r as any).waterAccumulation?.level !== undefined
  );

  // Highest accumulation score region
  const highestAccumulationRegion = regions.reduce((max, r) => {
    const score = (r as any).waterAccumulation?.score ?? 0;
    const maxScore = (max as any).waterAccumulation?.score ?? 0;
    return score > maxScore ? r : max;
  }, regions[0]);

  // Total estimated flooded area
  const totalFloodedAreaKm2 = regions.reduce((sum, r) => {
    return sum + ((r as any).waterAccumulation?.estimatedAreaKm2 ?? 0);
  }, 0);

  // Active wadis
  const activeWadis = regions.filter(r =>
    ((r as any).waterAccumulation?.wadiDischarge ?? 0) > 0.5
  ).length;

  const refRegion = regions.find(r => r.id === 'abudhabi-city') || regions[0];

  // Dubai timezone = UTC+4 — use direct UTC arithmetic for cross-browser reliability
  const _now = new Date();
  const _dubaiNow = new Date(_now.getTime() + 4 * 60 * 60 * 1000);
  const _dubaiYear = _dubaiNow.getUTCFullYear().toString();
  const _dubaiMonth = String(_dubaiNow.getUTCMonth() + 1).padStart(2, '0');
  const _dubaiDay = String(_dubaiNow.getUTCDate()).padStart(2, '0');
  const _dubaiHour = String(_dubaiNow.getUTCHours()).padStart(2, '0');
  const _nowStr = `${_dubaiYear}-${_dubaiMonth}-${_dubaiDay}T${_dubaiHour}:00`;
  const _currentIdx = refRegion.hourlyTimes.findIndex((t: string) => t === _nowStr);
  const _ci = _currentIdx >= 0 ? _currentIdx : 24;
  const _startIdx = Math.max(0, _ci - 12);
  const _endIdx = Math.min(refRegion.hourlyTimes.length, _startIdx + 48);
  const chartData = refRegion.hourlyTimes.slice(_startIdx, _endIdx).map((time, i) => ({
    time: time.split('T')[1] || time,
    actual: refRegion.hourlyPrecipitation[_startIdx + i] || 0,
    probability: refRegion.hourlyProbability[_startIdx + i] || 0,
    isNow: (_startIdx + i) === _ci,
  }));

  return {
    criticalCount,
    warningCount,
    watchCount,
    totalPrecip: Math.round(totalPrecip * 10) / 10,
    maxTotalPrecip: Math.round(maxTotalPrecip * 10) / 10,  // 24h context
    isRainActive: maxCurrentPrecip > 0,  // true if any region has active rain now
    maxRisk,
    avgTemp: Math.round(avgTemp * 10) / 10,
    highestRiskRegion,
    chartData,
    activeAlerts: criticalCount + warningCount + watchCount,
    // Water accumulation metrics
    accumulationSummary: accSummary,
    regionsWithWater,
    highestAccumulationRegion,
    totalFloodedAreaKm2: Math.round(totalFloodedAreaKm2 * 10) / 10,
    activeWadis,
  };
}
