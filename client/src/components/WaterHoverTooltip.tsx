/**
 * WaterHoverTooltip.tsx
 * Shows water depth, volume, and risk level when hovering over flood zones on the map.
 * Uses precise bounding-box region lookup so the tooltip always matches the cursor position.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { classifyByDepth, formatDepth, formatVolume, WATER_COLORS } from '@shared/waterStandard';

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
}

interface WaterHoverTooltipProps {
  leafletMap: any;
  precipMultiplier: number;
  lang: 'ar' | 'en';
  enabled: boolean;
}

// ── Precise Abu Dhabi region bounding boxes ────────────────────────────────────
// Each entry: [minLat, maxLat, minLng, maxLng, nameEn, nameAr, baseDepthCm, areaKm2, risk]
type RegionBox = [number, number, number, number, string, string, number, number, string];

const REGION_BOXES: RegionBox[] = [
  // Abu Dhabi Island
  [24.440, 24.510, 54.310, 54.430, 'Abu Dhabi Island', 'جزيرة أبوظبي',          45, 67.0, 'moderate'],
  [24.455, 24.500, 54.330, 54.400, 'Al Khalidiyah',    'الخالدية',              55, 3.2,  'moderate'],
  [24.460, 24.490, 54.355, 54.395, 'Al Muroor',        'المرور',                60, 2.8,  'moderate'],
  [24.445, 24.470, 54.345, 54.375, 'Al Bateen',        'البطين',                40, 2.1,  'minor'],
  [24.475, 24.500, 54.370, 54.410, 'Al Mushrif',       'المشرف',                50, 3.5,  'moderate'],
  [24.465, 24.490, 54.385, 54.420, 'Al Nahyan',        'النهيان',               55, 2.9,  'moderate'],
  [24.480, 54.500, 54.395, 54.430, 'Tourist Club Area','منطقة النادي السياحي',  48, 2.4,  'moderate'],
  [24.450, 24.475, 54.360, 54.395, 'Downtown Abu Dhabi','وسط المدينة',           62, 4.1,  'moderate'],

  // Mainland Abu Dhabi
  [24.370, 24.410, 54.450, 54.530, 'Mussafah',         'مصفح',                  85, 28.0, 'severe'],
  [24.350, 24.380, 54.440, 54.490, 'Mussafah Industrial','مصفح الصناعية',        90, 22.0, 'severe'],
  [24.390, 24.430, 54.480, 54.540, 'Mussafah Residential','مصفح السكني',         70, 15.0, 'severe'],

  // KIZAD
  [24.270, 24.330, 54.400, 54.470, 'KIZAD',            'كيزاد',                 95, 55.0, 'severe'],
  [24.275, 24.315, 54.405, 54.455, 'KIZAD Industrial', 'كيزاد الصناعية',        100,40.0, 'severe'],

  // Khalifa City
  [24.395, 24.445, 54.560, 54.640, 'Khalifa City A',   'خليفة سيتي A',          75, 18.0, 'severe'],
  [24.425, 24.450, 54.600, 54.650, 'Khalifa City B',   'خليفة سيتي B',          65, 12.0, 'moderate'],
  [24.430, 24.455, 54.620, 54.670, 'Khalifa City C',   'خليفة سيتي C',          60, 10.0, 'moderate'],

  // Zayed City / MBZ City
  [24.330, 24.380, 54.590, 54.670, 'Zayed City',       'مدينة زايد',            80, 32.0, 'severe'],
  [24.360, 24.395, 54.630, 54.690, 'MBZ City',         'مدينة محمد بن زايد',    72, 25.0, 'severe'],

  // Al Shamkha
  [24.300, 24.355, 54.500, 54.570, 'Al Shamkha',       'الشامخة',               78, 30.0, 'severe'],

  // Baniyas
  [24.295, 24.345, 54.610, 54.680, 'Baniyas',          'بني ياس',               70, 22.0, 'severe'],

  // Al Rahba
  [24.480, 24.530, 54.550, 54.620, 'Al Rahba',         'الرحبة',                65, 18.0, 'moderate'],

  // Al Wathba
  [24.235, 24.300, 54.570, 54.650, 'Al Wathba',        'الوثبة',                88, 45.0, 'severe'],

  // Al Falah
  [24.200, 24.250, 54.550, 54.620, 'Al Falah',         'الفلاح',                72, 28.0, 'severe'],

  // ICAD
  [24.340, 24.390, 54.540, 54.600, 'ICAD',             'إيكاد',                 82, 35.0, 'severe'],

  // Al Maqta
  [24.480, 24.510, 54.420, 54.470, 'Al Maqta',         'المقطع',                53, 1.6,  'moderate'],

  // Yas Island
  [24.460, 24.500, 54.590, 54.640, 'Yas Island',       'جزيرة ياس',             35, 25.0, 'minor'],

  // Saadiyat Island
  [24.520, 24.560, 54.420, 54.470, 'Saadiyat Island',  'جزيرة السعديات',        28, 18.0, 'minor'],

  // Al Reem Island
  [24.490, 24.530, 54.395, 54.435, 'Al Reem Island',   'جزيرة الريم',           32, 8.0,  'minor'],

  // Ruwais
  [24.090, 24.130, 52.700, 52.760, 'Ruwais',           'الرويس',                68, 15.0, 'moderate'],

  // Al Ain
  [24.180, 24.260, 55.700, 55.800, 'Al Ain',           'العين',                 55, 120.0,'moderate'],
  [24.195, 24.235, 55.720, 55.770, 'Al Ain City',      'مدينة العين',           60, 45.0, 'moderate'],

  // Madinat Zayed (Western Region)
  [23.670, 23.730, 53.670, 53.740, 'Madinat Zayed',    'مدينة زايد الغربية',   65, 12.0, 'moderate'],

  // Liwa
  [23.090, 23.160, 53.580, 53.660, 'Liwa',             'ليوا',                  50, 8.0,  'moderate'],

  // Al Dhafra
  [23.500, 24.000, 52.500, 53.500, 'Al Dhafra',        'الظفرة',                45, 200.0,'minor'],

  // Ghayathi
  [23.820, 23.860, 52.780, 52.830, 'Ghayathi',         'غياثي',                 110,8.0,  'extreme'],
  [23.810, 23.850, 52.790, 52.820, 'Ghayathi Center',  'مركز غياثي',            120,4.0,  'extreme'],
];

// ── Find region by bounding box (most precise) ────────────────────────────────
function findRegionByBBox(lat: number, lng: number): RegionBox | null {
  // Find all matching boxes (cursor inside box), then pick the smallest (most specific)
  let best: RegionBox | null = null;
  let bestArea = Infinity;

  for (const box of REGION_BOXES) {
    const [minLat, maxLat, minLng, maxLng] = box;
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      const area = (maxLat - minLat) * (maxLng - minLng);
      if (area < bestArea) {
        bestArea = area;
        best = box;
      }
    }
  }
  return best;
}

// ── Fallback: nearest centroid within 5 km ────────────────────────────────────
function findNearestCentroid(lat: number, lng: number): RegionBox | null {
  let best: RegionBox | null = null;
  let minDist = 5000; // max 5 km

  for (const box of REGION_BOXES) {
    const [minLat, maxLat, minLng, maxLng] = box;
    const cLat = (minLat + maxLat) / 2;
    const cLng = (minLng + maxLng) / 2;
    // Quick Euclidean approximation (sufficient for 5 km range)
    const dLat = (lat - cLat) * 111000;
    const dLng = (lng - cLng) * 111000 * Math.cos(lat * Math.PI / 180);
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist < minDist) {
      minDist = dist;
      best = box;
    }
  }
  return best;
}

function buildTooltipData(box: RegionBox, multiplier: number, x: number, y: number): TooltipData {
  const [, , , , nameEn, nameAr, baseDepth, areaKm2, risk] = box;
  const scaledDepth = Math.round(baseDepth * Math.min(multiplier, 3.0));
  const volumeM3 = Math.round(areaKm2 * 1_000_000 * (scaledDepth / 100) * 0.35); // 35% runoff

  const riskColors: Record<string, string> = {
    safe: '#10B981', minor: '#84CC16', moderate: '#F59E0B',
    severe: '#EF4444', extreme: '#7C3AED',
  };

  return {
    x, y,
    regionName: nameEn,
    regionNameAr: nameAr,
    avgDepthCm: scaledDepth,
    volumeM3,
    riskLevel: risk,
    riskColor: riskColors[risk] ?? '#F59E0B',
    areaKm2,
  };
}

export default function WaterHoverTooltip({ leafletMap, precipMultiplier, lang, enabled }: WaterHoverTooltipProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const throttleRef = useRef<number>(0);

  const handleMouseMove = useCallback((e: any) => {
    if (!enabled) { setTooltip(null); return; }
    const now = Date.now();
    if (now - throttleRef.current < 80) return;
    throttleRef.current = now;

    const { lat, lng } = e.latlng;
    const { x, y } = e.containerPoint;

    // 1. Try exact bounding box match (most accurate)
    let box = findRegionByBBox(lat, lng);
    // 2. Fallback to nearest centroid within 5 km
    if (!box) box = findNearestCentroid(lat, lng);

    if (box) {
      setTooltip(buildTooltipData(box, precipMultiplier, x, y));
    } else {
      setTooltip(null);
    }
  }, [enabled, precipMultiplier]);

  const handleMouseOut = useCallback(() => setTooltip(null), []);

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

  const OFFSET = 16;
  const TW = 240, TH = 165;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = tooltip.x + OFFSET;
  let top  = tooltip.y + OFFSET;
  if (left + TW > vw - 20) left = tooltip.x - TW - OFFSET;
  if (top  + TH > vh - 20) top  = tooltip.y - TH - OFFSET;

  const isAr = lang === 'ar';

  const riskLabels: Record<string, { ar: string; en: string }> = {
    safe:     { ar: 'آمن',    en: 'Safe'     },
    minor:    { ar: 'طفيف',   en: 'Minor'    },
    moderate: { ar: 'متوسط',  en: 'Moderate' },
    severe:   { ar: 'شديد',   en: 'Severe'   },
    extreme:  { ar: 'حرج',    en: 'Extreme'  },
  };
  const riskLabel = riskLabels[tooltip.riskLevel]?.[lang] ?? tooltip.riskLevel;

  return (
    <div style={{ position: 'fixed', left, top, zIndex: 9999, pointerEvents: 'none', width: TW }}>
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

        <div style={{ height: 1, background: `${waterColor.stroke}44`, marginBottom: 7 }} />

        {/* Depth */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>{isAr ? 'متوسط العمق' : 'Avg Depth'}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: waterColor.fill || '#93C5FD' }}>{depthLabel}</span>
        </div>

        {/* Volume */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>{isAr ? 'كمية المياه' : 'Water Volume'}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#60A5FA' }}>{volLabel}</span>
        </div>

        {/* Area */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>{isAr ? 'المساحة المتأثرة' : 'Affected Area'}</span>
          <span style={{ fontSize: 11, color: '#CBD5E1' }}>
            {tooltip.areaKm2 < 1
              ? `${(tooltip.areaKm2 * 100).toFixed(0)} ${isAr ? 'هكتار' : 'ha'}`
              : `${tooltip.areaKm2.toFixed(1)} ${isAr ? 'كم²' : 'km²'}`}
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
          <span style={{ fontSize: 10, fontWeight: 600, color: tooltip.riskColor }}>{riskLabel}</span>
        </div>
      </div>
    </div>
  );
}
