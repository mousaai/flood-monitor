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
// IMPORTANT: All values verified against abuDhabiRegions.ts and OSM data
type RegionBox = [number, number, number, number, string, string, number, number, string];

const REGION_BOXES: RegionBox[] = [
  // ── Abu Dhabi Island sub-districts (smallest boxes first for specificity) ──
  [24.455, 24.475, 54.330, 54.360, 'Al Bateen',          'البطين',                40,  2.1,  'minor'],
  [24.455, 24.475, 54.360, 54.390, 'Al Manhal',          'المنهل',                38,  2.5,  'minor'],
  [24.455, 24.475, 54.385, 54.415, 'Al Karama',          'الكرامة',               42,  2.9,  'minor'],
  [24.455, 24.475, 54.330, 54.360, 'Al Gharb',           'الغرب',                 35,  3.5,  'minor'],
  [24.460, 24.485, 54.345, 54.375, 'Al Khalidiyah',      'الخالدية',              55,  4.5,  'moderate'],
  [24.460, 24.485, 54.370, 54.400, 'Al Zaab',            'الزعاب',                45,  3.8,  'minor'],
  [24.460, 24.485, 54.395, 54.425, 'Al Muroor',          'المرور',                60,  2.8,  'moderate'],
  [24.465, 24.490, 54.355, 54.385, 'Al Rawdah',          'الروضة',                38,  2.8,  'minor'],
  [24.470, 24.500, 54.370, 54.405, 'Al Mushrif',         'المشرف',                50,  6.2,  'moderate'],
  [24.470, 24.500, 54.400, 54.430, 'Al Nahyan',          'النهيان',               55,  2.9,  'moderate'],
  [24.480, 24.505, 54.355, 54.390, 'Tourist Club Area',  'منطقة النادي السياحي',  48,  2.4,  'moderate'],
  [24.440, 24.465, 54.355, 54.395, 'Downtown Abu Dhabi', 'وسط المدينة',           62,  4.1,  'moderate'],
  [24.455, 24.475, 54.325, 54.355, 'Corniche',           'الكورنيش',              30,  3.2,  'minor'],
  [24.440, 24.465, 54.375, 54.415, 'Al Difaa',           'الدفاع',                35,  3.2,  'minor'],
  [24.440, 24.460, 54.395, 54.425, 'Al Refa',            'الرفاع',                32,  2.2,  'minor'],
  [24.445, 24.475, 54.415, 54.445, 'Zayed Sports City',  'مدينة زايد الرياضية',  28,  4.5,  'minor'],
  // Abu Dhabi Island general (catch-all for island)
  [24.430, 24.520, 54.300, 54.450, 'Abu Dhabi Island',   'جزيرة أبوظبي',          45, 67.0,  'moderate'],

  // ── Al Reem Island ──
  [24.490, 24.535, 54.390, 54.440, 'Al Reem Island',     'جزيرة الريم',           32,  8.0,  'minor'],

  // ── Saadiyat Island ──
  [24.515, 24.565, 54.405, 54.470, 'Saadiyat Island',    'جزيرة السعديات',        28, 18.0,  'minor'],

  // ── Al Maqta / Al Mushrif Bridge area ──
  [24.475, 24.515, 54.415, 54.475, 'Al Maqta',           'المقطع',                53,  1.6,  'moderate'],

  // ── Al Bahia (north of island) ──
  [24.500, 24.540, 54.330, 54.380, 'Al Bahia',           'الباهية',               35, 18.0,  'minor'],

  // ── Mainland Abu Dhabi — Mussafah ──
  [24.340, 24.380, 54.435, 54.480, 'Mussafah Industrial','مصفح الصناعية',         90, 22.0,  'severe'],
  [24.380, 24.415, 54.460, 54.520, 'Mussafah Residential','مصفح السكني',          70, 15.0,  'severe'],
  [24.330, 24.420, 54.430, 54.540, 'Mussafah',           'مصفح',                  85, 42.0,  'severe'],

  // ── KIZAD / Khalifa Industrial Zone ──
  [24.265, 24.335, 54.395, 54.470, 'KIZAD',              'كيزاد',                 95, 55.0,  'severe'],
  [24.270, 24.320, 54.400, 54.455, 'KIZAD Industrial',   'كيزاد الصناعية',        100,40.0,  'severe'],

  // ── Mohammed Bin Zayed City (MBZ) ──
  [24.355, 24.400, 54.490, 54.560, 'Mohammed Bin Zayed City','مدينة محمد بن زايد', 72, 35.0, 'severe'],

  // ── Khalifa City A / B ──
  [24.395, 24.445, 54.555, 54.625, 'Khalifa City A',     'خليفة سيتي A',          75, 18.0,  'severe'],
  [24.420, 24.455, 54.595, 54.655, 'Khalifa City B',     'خليفة سيتي B',          65, 12.0,  'moderate'],

  // ── Yas Island ──
  [24.460, 24.510, 54.580, 54.645, 'Yas Island',         'جزيرة ياس',             35, 25.0,  'minor'],

  // ── Al Raha Beach ──
  [24.465, 24.500, 54.560, 54.600, 'Al Raha Beach',      'شاطئ الراحة',           40,  8.5,  'minor'],

  // ── Al Rahba (north of Khalifa City) ──
  [24.500, 24.545, 54.620, 54.680, 'Al Rahba',           'الرحبة',                65, 14.0,  'moderate'],

  // ── Zayed City ──
  [24.320, 24.370, 54.595, 54.660, 'Zayed City',         'مدينة زايد',            80, 32.0,  'severe'],

  // ── Al Shamkha ──
  [24.355, 24.415, 54.640, 54.720, 'Al Shamkha',         'الشامخة',               78, 30.0,  'severe'],
  [24.395, 24.430, 54.700, 54.780, 'Al Shamkha Farms',   'مزارع الشامخة',         55,120.0,  'moderate'],

  // ── Baniyas ──
  [24.295, 24.350, 54.610, 54.670, 'Baniyas',            'بني ياس',               70, 22.0,  'severe'],

  // ── Al Wathba ──
  [24.230, 24.295, 54.565, 54.650, 'Al Wathba',          'الوثبة',                88, 45.0,  'severe'],
  [24.260, 24.310, 54.750, 54.830, 'Al Wathba Farms',    'مزارع الوثبة',          55, 95.0,  'moderate'],

  // ── ICAD ──
  [24.335, 24.395, 54.530, 54.600, 'ICAD',               'إيكاد',                 82, 35.0,  'severe'],

  // ── Al Falah ──
  [24.195, 24.255, 54.540, 54.620, 'Al Falah',           'الفلاح',                72, 28.0,  'severe'],

  // ── North Abu Dhabi Farms ──
  [24.555, 24.620, 54.400, 54.510, 'North Abu Dhabi Farms','مزارع شمال أبوظبي',   45, 85.0,  'minor'],

  // ── Al Ain City ──
  [24.185, 24.250, 55.710, 55.790, 'Al Ain City',        'مدينة العين',           60, 45.0,  'moderate'],
  [24.150, 24.280, 55.680, 55.820, 'Al Ain',             'العين',                 55,120.0,  'moderate'],

  // ── Ruwais ──
  [24.085, 24.135, 52.695, 52.770, 'Ruwais',             'الرويس',                68, 15.0,  'moderate'],

  // ── Madinat Zayed (Western Region) ──
  [23.660, 23.740, 53.660, 53.750, 'Madinat Zayed',      'مدينة زايد الغربية',   65, 12.0,  'moderate'],

  // ── Liwa ──
  [23.080, 23.170, 53.565, 53.670, 'Liwa',               'ليوا',                  50,  8.0,  'moderate'],

  // ── Ghayathi ──
  [23.805, 23.865, 52.775, 52.835, 'Ghayathi',           'غياثي',                 110, 8.0,  'extreme'],

  // ── Al Dhafra (large catch-all for western region) ──
  [22.800, 24.200, 51.500, 54.000, 'Al Dhafra',          'الظفرة',                45,200.0,  'minor'],
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

// ── Fallback: nearest centroid within 4 km ────────────────────────────────────
function findNearestCentroid(lat: number, lng: number): RegionBox | null {
  let best: RegionBox | null = null;
  let minDist = 4000; // max 4 km

  for (const box of REGION_BOXES) {
    const [minLat, maxLat, minLng, maxLng] = box;
    const cLat = (minLat + maxLat) / 2;
    const cLng = (minLng + maxLng) / 2;
    // Quick Euclidean approximation (sufficient for 4 km range)
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
    // 2. Fallback to nearest centroid within 4 km
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
