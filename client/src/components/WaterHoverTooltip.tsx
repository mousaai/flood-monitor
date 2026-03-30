/**
 * WaterHoverTooltip.tsx
 * Shows water depth, volume, and risk level when hovering over flood zones on the map
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { FLOOD_ZONES } from '@/services/floodMapData';
import { HISTORICAL_REGIONS } from '@/data/historicalWater';
import { classifyByDepth, formatDepth, formatVolume, WATER_COLORS, WATER_LABELS } from '@shared/waterStandard';

interface TooltipData {
  x: number;
  y: number;
  regionName: string;
  regionNameAr: string;
  avgDepthCm: number;
  volumeM3: number;
  riskLevel: string;
  riskColor: string;
  areaKm2: number;
  precipMm: number;
  zoneType: string;
}

interface WaterHoverTooltipProps {
  leafletMap: any;              // Leaflet map instance
  precipMultiplier: number;     // current depth multiplier
  lang: 'ar' | 'en';
  enabled: boolean;             // only show when water layer is active
}

// Haversine distance in meters
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Find nearest flood zone or historical region to a lat/lng point
function findNearestRegion(lat: number, lng: number, multiplier: number): TooltipData | null {
  // First check FLOOD_ZONES (precise zones with radius)
  for (const zone of FLOOD_ZONES) {
    const dist = haversine(lat, lng, zone.lat, zone.lng);
    if (dist <= zone.radius * 1.5) {
      const scaledDepth = zone.waterDepth * multiplier;
      const areaM2 = zone.area;
      const volumeM3 = areaM2 * (scaledDepth / 100) * zone.intensity;
      const level = classifyByDepth(scaledDepth);
      const riskColors: Record<string, string> = {
        low: '#10B981', medium: '#F59E0B', high: '#EF4444', critical: '#7C3AED'
      };
      return {
        x: 0, y: 0,
        regionName: zone.nameEn,
        regionNameAr: zone.nameAr,
        avgDepthCm: Math.round(scaledDepth),
        volumeM3: Math.round(volumeM3),
        riskLevel: zone.riskLevel,
        riskColor: riskColors[zone.riskLevel] ?? '#F59E0B',
        areaKm2: areaM2 / 1_000_000,
        precipMm: Math.round(multiplier * 115),
        zoneType: 'flood_zone',
      };
    }
  }

  // Then check HISTORICAL_REGIONS (90 regions)
  let nearest: typeof HISTORICAL_REGIONS[0] | null = null;
  let minDist = Infinity;
  for (const region of HISTORICAL_REGIONS) {
    const dist = haversine(lat, lng, region.lat, region.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = region;
    }
  }

  if (!nearest || minDist > 8000) return null;

  // Get latest event depth scaled by multiplier
  const latestEvent = nearest.events[nearest.events.length - 1];
  const baseDepth = latestEvent ? latestEvent.waterDepthCm : 5;
  const scaledDepth = baseDepth * Math.min(multiplier, 3.0);

  // Estimate area from density (denser = smaller effective flood area)
  const estimatedAreaKm2 = (1 - nearest.density * 0.5) * 2.5;
  const volumeM3 = estimatedAreaKm2 * 1_000_000 * (scaledDepth / 100);

  const level = classifyByDepth(scaledDepth);
  const riskMap: Record<string, string> = {
    safe: '#10B981', minor: '#84CC16', moderate: '#F59E0B',
    severe: '#EF4444', extreme: '#7C3AED'
  };
  const levelStr = latestEvent?.level ?? 'safe';

  return {
    x: 0, y: 0,
    regionName: nearest.name,
    regionNameAr: nearest.nameAr,
    avgDepthCm: Math.round(scaledDepth),
    volumeM3: Math.round(volumeM3),
    riskLevel: levelStr,
    riskColor: riskMap[levelStr] ?? '#F59E0B',
    areaKm2: estimatedAreaKm2,
    precipMm: Math.round(multiplier * 115),
    zoneType: nearest.type,
  };
}

export default function WaterHoverTooltip({ leafletMap, precipMultiplier, lang, enabled }: WaterHoverTooltipProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const throttleRef = useRef<number>(0);

  const handleMouseMove = useCallback((e: any) => {
    if (!enabled) { setTooltip(null); return; }
    const now = Date.now();
    if (now - throttleRef.current < 80) return; // throttle 80ms
    throttleRef.current = now;

    const { lat, lng } = e.latlng;
    const containerPoint = e.containerPoint;

    const data = findNearestRegion(lat, lng, precipMultiplier);
    if (data) {
      setTooltip({ ...data, x: containerPoint.x, y: containerPoint.y });
    } else {
      setTooltip(null);
    }
  }, [enabled, precipMultiplier]);

  const handleMouseOut = useCallback(() => {
    setTooltip(null);
  }, []);

  useEffect(() => {
    if (!leafletMap) return;
    leafletMap.on('mousemove', handleMouseMove);
    leafletMap.on('mouseout', handleMouseOut);
    return () => {
      leafletMap.off('mousemove', handleMouseMove);
      leafletMap.off('mouseout', handleMouseOut);
    };
  }, [leafletMap, handleMouseMove, handleMouseOut]);

  if (!tooltip || !enabled) return null;

  const level = classifyByDepth(tooltip.avgDepthCm);
  const waterColor = WATER_COLORS[level] as any;
  const depthLabel = formatDepth(tooltip.avgDepthCm, lang);
  const volLabel = formatVolume(tooltip.volumeM3, lang);

  // Position tooltip: keep inside viewport
  const OFFSET = 16;
  const TW = 240, TH = 160;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = tooltip.x + OFFSET;
  let top = tooltip.y + OFFSET;
  if (left + TW > vw - 20) left = tooltip.x - TW - OFFSET;
  if (top + TH > vh - 20) top = tooltip.y - TH - OFFSET;

  const isAr = lang === 'ar';

  const riskLabels: Record<string, { ar: string; en: string }> = {
    safe:     { ar: 'آمن',     en: 'Safe'     },
    minor:    { ar: 'طفيف',    en: 'Minor'    },
    moderate: { ar: 'متوسط',   en: 'Moderate' },
    severe:   { ar: 'شديد',    en: 'Severe'   },
    extreme:  { ar: 'حرج',     en: 'Extreme'  },
    low:      { ar: 'منخفض',   en: 'Low'      },
    medium:   { ar: 'متوسط',   en: 'Medium'   },
    high:     { ar: 'مرتفع',   en: 'High'     },
    critical: { ar: 'حرج',     en: 'Critical' },
  };
  const riskLabel = riskLabels[tooltip.riskLevel]?.[lang] ?? tooltip.riskLevel;

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 9999,
        pointerEvents: 'none',
        width: TW,
      }}
    >
      <div style={{
        background: 'rgba(10, 15, 30, 0.94)',
        border: `1px solid ${waterColor.stroke}`,
        borderRadius: 10,
        padding: '10px 13px',
        backdropFilter: 'blur(12px)',
        boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px ${waterColor.stroke}22`,
        direction: isAr ? 'rtl' : 'ltr',
        fontFamily: 'system-ui, sans-serif',
      }}>
        {/* Region name */}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#E2E8F0', marginBottom: 6, lineHeight: 1.3 }}>
          {isAr ? tooltip.regionNameAr : tooltip.regionName}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: `${waterColor.stroke}44`, marginBottom: 7 }} />

        {/* Depth row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>
            {isAr ? 'متوسط العمق' : 'Avg Depth'}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: waterColor.fill || '#93C5FD' }}>
            {depthLabel}
          </span>
        </div>

        {/* Volume row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>
            {isAr ? 'كمية المياه' : 'Water Volume'}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#60A5FA' }}>
            {volLabel}
          </span>
        </div>

        {/* Area row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>
            {isAr ? 'المساحة المتأثرة' : 'Affected Area'}
          </span>
          <span style={{ fontSize: 11, color: '#CBD5E1' }}>
            {tooltip.areaKm2 < 1
              ? `${(tooltip.areaKm2 * 100).toFixed(0)} ${isAr ? 'هكتار' : 'ha'}`
              : `${tooltip.areaKm2.toFixed(2)} ${isAr ? 'كم²' : 'km²'}`}
          </span>
        </div>

        {/* Risk badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: `${tooltip.riskColor}22`,
          border: `1px solid ${tooltip.riskColor}55`,
          borderRadius: 6, padding: '3px 8px',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: tooltip.riskColor }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: tooltip.riskColor }}>
            {riskLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
