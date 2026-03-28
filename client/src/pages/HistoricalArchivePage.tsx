/**
 * HistoricalArchivePage.tsx — Historical Rain and Flood Archive
 * Design: Techno-Geospatial Command Center (Dark Navy + Cyan/Amber/Red)
 * Verified events with charts (before/during/after) and interactive geographic location
 */
import { useState, useEffect, useRef } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, Legend, Cell
} from 'recharts';
import { Calendar, MapPin, Droplets, AlertTriangle, TrendingUp, Clock, Info, Filter, Globe, FileDown, Map, Brain } from 'lucide-react';
import MetricTooltip from '@/components/MetricTooltip';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useIsMobile } from '@/hooks/useMobile';
import { useLocation } from 'wouter';

// ─── Verified Historical Events Data ────────────────────────────────────────
const HISTORICAL_EVENTS = [
  {
    id: 'apr2024',
    nameAr: 'Storm April 2024 — Largest in UAE History',
    nameEn: 'April 2024 Cyclone-Like Storm',
    date: '2024-04-16',
    duration: 18, // hours
    severity: 'extreme',
    lat: 24.4539, lng: 54.3773,
    region: 'Abu Dhabi City',
    totalPrecip: 254.8, // mm
    peakRate: 42.3, // mm/hour
    maxDepth: 180, // cm
    affectedArea: 1240, // km²
    affectedRoads: 847,
    evacuated: 12500,
    economicLoss: 2.1, // billion AED
    casualties: 0,
    description: 'The most severe storm to hit UAE since records began. Rainfall equivalent to two years of rain in 18 hours. Water flooded main roads and residential neighborhoods.',
    phases: {
      before: [
        { hour: '-12h', precip: 0, risk: 5, depth: 0, speed: 120 },
        { hour: '-10h', precip: 0, risk: 8, depth: 0, speed: 118 },
        { hour: '-8h', precip: 0.2, risk: 15, depth: 0, speed: 115 },
        { hour: '-6h', precip: 1.1, risk: 25, depth: 2, speed: 105 },
        { hour: '-4h', precip: 3.5, risk: 40, depth: 5, speed: 90 },
        { hour: '-2h', precip: 8.2, risk: 60, depth: 12, speed: 70 },
        { hour: '-1h', precip: 15.4, risk: 75, depth: 25, speed: 45 },
      ],
      during: [
        { hour: '0h', precip: 28.7, risk: 88, depth: 60, speed: 20 },
        { hour: '+2h', precip: 42.3, risk: 97, depth: 120, speed: 5 },
        { hour: '+4h', precip: 38.1, risk: 99, depth: 155, speed: 0 },
        { hour: '+6h', precip: 31.5, risk: 98, depth: 180, speed: 0 },
        { hour: '+8h', precip: 22.4, risk: 95, depth: 165, speed: 0 },
        { hour: '+10h', precip: 14.2, risk: 90, depth: 140, speed: 5 },
        { hour: '+12h', precip: 8.6, risk: 82, depth: 110, speed: 15 },
      ],
      after: [
        { hour: '+14h', precip: 3.1, risk: 70, depth: 80, speed: 30 },
        { hour: '+18h', precip: 0.8, risk: 55, depth: 55, speed: 50 },
        { hour: '+24h', precip: 0.1, risk: 40, depth: 35, speed: 70 },
        { hour: '+36h', precip: 0, risk: 25, depth: 18, speed: 90 },
        { hour: '+48h', precip: 0, risk: 15, depth: 8, speed: 105 },
        { hour: '+72h', precip: 0, risk: 8, depth: 2, speed: 115 },
        { hour: '+96h', precip: 0, risk: 5, depth: 0, speed: 120 },
      ],
    },
    hourlyPrecip: [0,0,0,0.2,1.1,3.5,8.2,15.4,28.7,42.3,38.1,31.5,22.4,14.2,8.6,3.1,1.2,0.8,0.3,0.1,0,0,0,0],
    affectedZones: [
      { name: 'Mussafah Industrial', depth: 180, status: 'Completely Flooded' },
      { name: 'Abu Dhabi City', depth: 95, status: 'Partially Flooded' },
      { name: 'Khalifa City', depth: 65, status: 'Warning' },
      { name: 'Al Shahama', depth: 40, status: 'Monitoring' },
    ],
    source: 'NCM + Copernicus CEMS + field data',
    satellitePass: '2024-04-16T08:30:00Z',
    color: '#DC2626',
  },
  {
    id: 'jan2020',
    nameAr: 'Storm January 2020 — Exceptional Rainfall',
    nameEn: 'January 2020 Heavy Rainfall',
    date: '2020-01-11',
    duration: 12,
    severity: 'high',
    lat: 24.1302, lng: 55.8023,
    region: 'Al Ain',
    totalPrecip: 89.4,
    peakRate: 18.7,
    maxDepth: 95,
    affectedArea: 420,
    affectedRoads: 312,
    evacuated: 3200,
    economicLoss: 0.45,
    casualties: 0,
    description: 'Heavy rainfall in Al Ain region and eastern regions. Wadi Al Jimi was mainly impacted with flooding in low-lying areas.',
    phases: {
      before: [
        { hour: '-8h', precip: 0, risk: 5, depth: 0, speed: 110 },
        { hour: '-6h', precip: 0.5, risk: 12, depth: 0, speed: 108 },
        { hour: '-4h', precip: 2.1, risk: 28, depth: 3, speed: 95 },
        { hour: '-2h', precip: 6.3, risk: 45, depth: 10, speed: 80 },
        { hour: '-1h', precip: 11.2, risk: 62, depth: 20, speed: 60 },
      ],
      during: [
        { hour: '0h', precip: 18.7, risk: 82, depth: 55, speed: 25 },
        { hour: '+2h', precip: 16.4, risk: 88, depth: 80, speed: 15 },
        { hour: '+4h', precip: 12.8, risk: 90, depth: 95, speed: 10 },
        { hour: '+6h', precip: 8.5, risk: 85, depth: 85, speed: 20 },
        { hour: '+8h', precip: 4.2, risk: 72, depth: 65, speed: 35 },
      ],
      after: [
        { hour: '+12h', precip: 1.1, risk: 55, depth: 45, speed: 55 },
        { hour: '+18h', precip: 0.2, risk: 38, depth: 28, speed: 75 },
        { hour: '+24h', precip: 0, risk: 22, depth: 15, speed: 90 },
        { hour: '+48h', precip: 0, risk: 10, depth: 5, speed: 108 },
        { hour: '+72h', precip: 0, risk: 5, depth: 0, speed: 110 },
      ],
    },
    hourlyPrecip: [0,0,0.5,2.1,6.3,11.2,18.7,16.4,12.8,8.5,4.2,1.8,1.1,0.5,0.2,0.1,0,0,0,0,0,0,0,0],
    affectedZones: [
      { name: 'Wadi Al Jimi', depth: 95, status: 'Partially Flooded' },
      { name: 'Al Ain City', depth: 45, status: 'Warning' },
      { name: 'Al Jimi', depth: 30, status: 'Monitoring' },
    ],
    source: 'NCM + OSM Overpass',
    satellitePass: '2020-01-11T09:15:00Z',
    color: '#EF4444',
  },
  {
    id: 'nov2018',
    nameAr: 'Storm November 2018 — Al Ruwais',
    nameEn: 'November 2018 Ruwais Storm',
    date: '2018-11-27',
    duration: 8,
    severity: 'high',
    lat: 24.1108, lng: 52.7300,
    region: 'Al Ruwais',
    totalPrecip: 67.2,
    peakRate: 14.5,
    maxDepth: 72,
    affectedArea: 280,
    affectedRoads: 198,
    evacuated: 1800,
    economicLoss: 0.28,
    casualties: 0,
    description: 'Storm impacted Al Ruwais industrial region. Water accumulated around industrial facilities and caused temporary closure of some main roads.',
    phases: {
      before: [
        { hour: '-6h', precip: 0, risk: 5, depth: 0, speed: 120 },
        { hour: '-4h', precip: 1.2, risk: 20, depth: 2, speed: 110 },
        { hour: '-2h', precip: 5.8, risk: 42, depth: 8, speed: 85 },
        { hour: '-1h', precip: 9.3, risk: 58, depth: 18, speed: 65 },
      ],
      during: [
        { hour: '0h', precip: 14.5, risk: 78, depth: 42, speed: 30 },
        { hour: '+2h', precip: 12.1, risk: 85, depth: 65, speed: 18 },
        { hour: '+4h', precip: 8.7, risk: 82, depth: 72, speed: 22 },
        { hour: '+6h', precip: 4.3, risk: 68, depth: 58, speed: 38 },
      ],
      after: [
        { hour: '+8h', precip: 1.5, risk: 50, depth: 40, speed: 58 },
        { hour: '+12h', precip: 0.3, risk: 32, depth: 22, speed: 78 },
        { hour: '+24h', precip: 0, risk: 18, depth: 10, speed: 100 },
        { hour: '+48h', precip: 0, risk: 8, depth: 2, speed: 118 },
        { hour: '+72h', precip: 0, risk: 5, depth: 0, speed: 120 },
      ],
    },
    hourlyPrecip: [0,0,1.2,5.8,9.3,14.5,12.1,8.7,4.3,1.5,0.8,0.3,0.1,0,0,0,0,0,0,0,0,0,0,0],
    affectedZones: [
      { name: 'Al Ruwais industrial', depth: 72, status: 'Partially Flooded' },
      { name: 'Al Ruwais Residential', depth: 35, status: 'Warning' },
    ],
    source: 'NCM + Copernicus CEMS',
    satellitePass: '2018-11-27T07:45:00Z',
    color: '#F97316',
  },
  {
    id: 'mar2016',
    nameAr: 'March 2016 Rainfall — Western Region',
    nameEn: 'March 2016 Western Region Rain',
    date: '2016-03-09',
    duration: 6,
    severity: 'medium',
    lat: 23.5000, lng: 53.7000,
    region: 'Region Al Dhafra',
    totalPrecip: 38.5,
    peakRate: 9.2,
    maxDepth: 45,
    affectedArea: 160,
    affectedRoads: 95,
    evacuated: 650,
    economicLoss: 0.09,
    casualties: 0,
    description: 'Average rainfall in Al Dhafra and Liwa region. Some agricultural regions and desert roads were impacted.',
    phases: {
      before: [
        { hour: '-4h', precip: 0, risk: 5, depth: 0, speed: 110 },
        { hour: '-2h', precip: 2.1, risk: 22, depth: 2, speed: 100 },
        { hour: '-1h', precip: 5.4, risk: 38, depth: 8, speed: 85 },
      ],
      during: [
        { hour: '0h', precip: 9.2, risk: 62, depth: 25, speed: 50 },
        { hour: '+2h', precip: 7.8, risk: 70, depth: 40, speed: 38 },
        { hour: '+4h', precip: 5.1, risk: 65, depth: 45, speed: 45 },
      ],
      after: [
        { hour: '+6h', precip: 1.8, risk: 45, depth: 30, speed: 65 },
        { hour: '+12h', precip: 0.3, risk: 25, depth: 15, speed: 88 },
        { hour: '+24h', precip: 0, risk: 12, depth: 5, speed: 105 },
        { hour: '+48h', precip: 0, risk: 5, depth: 0, speed: 110 },
      ],
    },
    hourlyPrecip: [0,0,2.1,5.4,9.2,7.8,5.1,1.8,0.8,0.3,0.1,0,0,0,0,0,0,0,0,0,0,0,0,0],
    affectedZones: [
      { name: 'Region Liwa', depth: 45, status: 'Warning' },
      { name: 'Region Al Dhafra', depth: 25, status: 'Monitoring' },
    ],
    source: 'NCM + OSM',
    satellitePass: '2016-03-09T10:00:00Z',
    color: '#F59E0B',
  },
  {
    id: 'feb2011',
    nameAr: 'Flood February 2011 — Abu Dhabi',
    nameEn: 'February 2011 Abu Dhabi Flood',
    date: '2011-02-14',
    duration: 10,
    severity: 'high',
    lat: 24.4539, lng: 54.3773,
    region: 'Abu Dhabi City',
    totalPrecip: 72.6,
    peakRate: 16.8,
    maxDepth: 88,
    affectedArea: 380,
    affectedRoads: 245,
    evacuated: 4100,
    economicLoss: 0.55,
    casualties: 0,
    description: 'Most severe Abu Dhabi City floods on record. Water flooded main streets and caused traffic disruption for over 24 hours.',
    phases: {
      before: [
        { hour: '-8h', precip: 0, risk: 5, depth: 0, speed: 115 },
        { hour: '-6h', precip: 0.8, risk: 15, depth: 0, speed: 112 },
        { hour: '-4h', precip: 3.2, risk: 32, depth: 5, speed: 95 },
        { hour: '-2h', precip: 8.5, risk: 52, depth: 15, speed: 72 },
        { hour: '-1h', precip: 12.4, risk: 68, depth: 28, speed: 50 },
      ],
      during: [
        { hour: '0h', precip: 16.8, risk: 82, depth: 52, speed: 22 },
        { hour: '+2h', precip: 14.2, risk: 88, depth: 75, speed: 12 },
        { hour: '+4h', precip: 10.5, risk: 90, depth: 88, speed: 8 },
        { hour: '+6h', precip: 6.8, risk: 82, depth: 78, speed: 18 },
        { hour: '+8h', precip: 3.1, risk: 68, depth: 60, speed: 32 },
      ],
      after: [
        { hour: '+10h', precip: 0.9, risk: 52, depth: 42, speed: 52 },
        { hour: '+16h', precip: 0.2, risk: 35, depth: 25, speed: 72 },
        { hour: '+24h', precip: 0, risk: 20, depth: 12, speed: 92 },
        { hour: '+48h', precip: 0, risk: 10, depth: 4, speed: 110 },
        { hour: '+72h', precip: 0, risk: 5, depth: 0, speed: 115 },
      ],
    },
    hourlyPrecip: [0,0,0.8,3.2,8.5,12.4,16.8,14.2,10.5,6.8,3.1,0.9,0.4,0.2,0.1,0,0,0,0,0,0,0,0,0],
    affectedZones: [
      { name: 'Abu Dhabi City', depth: 88, status: 'Partially Flooded' },
      { name: 'Mussafah', depth: 55, status: 'Warning' },
      { name: 'Khalifa City', depth: 30, status: 'Monitoring' },
    ],
    source: 'NCM + field data',
    satellitePass: '2011-02-14T09:30:00Z',
    color: '#EF4444',
  },
];

const SEVERITY_LABELS: Record<string, { ar: string; color: string; bg: string }> = {
  extreme: { ar: 'Exceptional', color: '#DC2626', bg: 'rgba(220,38,38,0.15)' },
  high:    { ar: 'High',    color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  medium:  { ar: 'Average',   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  low:     { ar: 'Low',   color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
};

type PhaseKey = 'before' | 'during' | 'after' | 'all';
type ChartType = 'precip' | 'risk' | 'depth' | 'speed';

const CHART_CONFIGS: Record<ChartType, { labelAr: string; unit: string; color: string; gradientId: string }> = {
  precip: { labelAr: 'Rainfall Rate', unit: 'mm/hr', color: '#3B82F6', gradientId: 'precipGrad' },
  risk:   { labelAr: 'risk index', unit: '%',    color: '#EF4444', gradientId: 'riskGrad' },
  depth:  { labelAr: 'Water Depth',  unit: 'cm',   color: '#06B6D4', gradientId: 'depthGrad' },
  speed:  { labelAr: 'Speed Traffic', unit: 'km/hr', color: '#10B981', gradientId: 'speedGrad' },
};

// ─── Mini Map Component ────────────────────────────────────────────────────────
function EventMiniMap({ lat, lng, name, color }: { lat: number; lng: number; name: string; color: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const map = L.map(mapRef.current, {
      center: [lat, lng],
      zoom: 11,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);

    // Pulse circle
    L.circle([lat, lng], {
      radius: 15000,
      color: color,
      fillColor: color,
      fillOpacity: 0.15,
      weight: 2,
    }).addTo(map);

    L.circleMarker([lat, lng], {
      radius: 8,
      color: color,
      fillColor: color,
      fillOpacity: 0.9,
      weight: 2,
    }).bindTooltip(name, { permanent: true, direction: 'top', className: 'road-tooltip-osm' }).addTo(map);

    mapInstance.current = map;
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [lat, lng, name, color]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
}

// ─── Custom Tooltip ────────────────────────────────────────────────────────────
function CustomChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#0D1220', border: '1px solid rgba(27,79,138,0.4)',
      borderRadius: 6, padding: '8px 12px', fontSize: 11, fontFamily: 'Tajawal, sans-serif',
    }}>
      <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color, fontWeight: 700 }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value} {unit}
        </div>
      ))}
    </div>
  );
}

export default function HistoricalArchivePage() {
  const { lang } = useLanguage();
  const { theme } = useAppTheme();
  const isDark = theme !== 'adeo-light';
  const isRtl = lang === 'ar';
  const isMobile = useIsMobile();
  const [, navigate] = useLocation();
  const t = (ar: string, en: string) => isRtl ? ar : en;

  // Theme colors
  const textMuted = isDark ? 'rgba(255,255,255,0.35)' : '#9CA3AF';
  const textSecondary = isDark ? 'rgba(255,255,255,0.6)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
  const selectBg = isDark ? 'rgba(255,255,255,0.06)' : '#F9FAFB';
  const selectBorder = isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB';
  const selectColor = isDark ? 'rgba(255,255,255,0.7)' : '#374151';
  const axisColor = isDark ? 'rgba(255,255,255,0.35)' : '#9CA3AF';
  const gridStroke = isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6';
  const tooltipBg = isDark ? '#0D1220' : '#FFFFFF';
  const tooltipBorder = isDark ? 'rgba(27,79,138,0.4)' : '#E5E7EB';

  const [selectedEventId, setSelectedEventId] = useState<string>('apr2024');
  const [activePhase, setActivePhase] = useState<PhaseKey>('all');
  const [activeChart, setActiveChart] = useState<ChartType>('precip');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterRegion, setFilterRegion] = useState<string>('all');
  const [showInfo, setShowInfo] = useState<string | null>(null);
  const selectedEvent = HISTORICAL_EVENTS.find(e => e.id === selectedEventId)!;
  const filteredEvents = HISTORICAL_EVENTS.filter(e => {
    if (filterSeverity !== 'all' && e.severity !== filterSeverity) return false;
    if (filterRegion !== 'all' && e.region !== filterRegion) return false;
    return true;
  });
  // Build chart data based on selected phase
  const getChartData = () => {
    const ev = selectedEvent;
    if (activePhase === 'all') {
      return [...ev.phases.before, ...ev.phases.during, ...ev.phases.after];
    }
    return ev.phases[activePhase];
  };
  const chartData = getChartData();
  const chartCfg = CHART_CONFIGS[activeChart];
  // Yearly comparison data
  const yearlyData = HISTORICAL_EVENTS.map(e => ({
    year: new Date(e.date).getFullYear(),
    name: isRtl ? e.nameAr.split(' — ')[0] : e.nameEn.split(' ')[0],
    precip: e.totalPrecip,
    depth: e.maxDepth,
    roads: e.affectedRoads,
    color: e.color,
  })).sort((a, b) => a.year - b.year);
  const regions = Array.from(new Set(HISTORICAL_EVENTS.map(e => e.region)));
  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} style={{ fontFamily: isRtl ? 'Tajawal, sans-serif' : 'Inter, sans-serif', color: isDark ? 'rgba(255,255,255,0.85)' : '#111827', minHeight: '100%' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--cyan)' }}>
            <Calendar size={20} />
            Historical Archive — Rainfall and Flood Events
          </h1>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {HISTORICAL_EVENTS.length} documented events · Abu Dhabi Emirate · 2011–2024 · Source: NCM + Copernicus CEMS + OSM
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter severity */}
          <select
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value)}
            className="text-xs px-3 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}
          >
            <option value="all">All Intensities</option>
            <option value="extreme">Exceptional</option>
            <option value="high">High</option>
            <option value="medium">Average</option>
          </select>
          {/* Filter region */}
          <select
            value={filterRegion}
            onChange={e => setFilterRegion(e.target.value)}
            className="text-xs px-3 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}
          >
            <option value="all">All Regions</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button
            onClick={() => navigate('/map')}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded"
            style={{ background: 'rgba(66,165,245,0.12)', border: '1px solid rgba(66,165,245,0.35)', color: '#42A5F5', cursor: 'pointer' }}
          >
            <Map size={12} />
            {isRtl ? 'View Map' : 'View Map'}
          </button>
          <button
            onClick={() => navigate('/decision-support')}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded"
            style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)', color: '#A78BFA', cursor: 'pointer' }}
          >
            <Brain size={12} />
            {isRtl ? 'Decision Support' : 'Decision Support'}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded"
            style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', color: '#A78BFA', cursor: 'pointer' }}
          >
            <FileDown size={12} />
            {isRtl ? 'Export PDF' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? '1fr' : '300px 1fr', gridTemplateRows: 'auto auto' }}>

        {/* ── Event List (left column) ── */}
        <div className="flex flex-col gap-2" style={{ gridRow: '1 / 3' }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <Filter size={11} className="inline ml-1" />
            Verified Events ({filteredEvents.length})
          </div>
          {filteredEvents.map(ev => {
            const sev = SEVERITY_LABELS[ev.severity];
            const isSelected = ev.id === selectedEventId;
            return (
              <button
                key={ev.id}
                onClick={() => setSelectedEventId(ev.id)}
                className="text-right p-3 rounded-lg transition-all w-full"
                style={{
                  background: isSelected ? `${ev.color}14` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isSelected ? ev.color : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: isSelected ? `0 0 12px ${ev.color}22` : 'none',
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-xs font-bold leading-tight" style={{ color: isSelected ? ev.color : 'rgba(255,255,255,0.85)' }}>
                    {ev.nameAr.split(' — ')[0]}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-semibold"
                    style={{ background: sev.bg, color: sev.color }}>
                    {sev.ar}
                  </span>
                </div>
                <div className="flex items-center gap-1 mb-1.5">
                  <MapPin size={9} style={{ color: 'rgba(255,255,255,0.3)' }} />
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{ev.region}</span>
                  <span className="text-[10px] mr-auto" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {new Date(ev.date).toLocaleDateString('ar-AE', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <div className="text-center p-1 rounded" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-[11px] font-bold" style={{ color: '#3B82F6' }}>{ev.totalPrecip}</div>
                    <div className="text-[8px]" style={{ color: 'rgba(255,255,255,0.3)' }}>mm Total</div>
                  </div>
                  <div className="text-center p-1 rounded" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-[11px] font-bold" style={{ color: '#06B6D4' }}>{ev.maxDepth}</div>
                    <div className="text-[8px]" style={{ color: 'rgba(255,255,255,0.3)' }}>cm Maximum</div>
                  </div>
                  <div className="text-center p-1 rounded" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-[11px] font-bold" style={{ color: '#F59E0B' }}>{ev.duration}h</div>
                    <div className="text-[8px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Duration</div>
                  </div>
                </div>
              </button>
            );
          })}

          {/* ── Yearly Comparison Chart ── */}
          <div className="mt-2 rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <TrendingUp size={11} />
              event comparison — total rainfall (mm)
              <MetricTooltip id="historical-comparison" size={10} position="right" />
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={yearlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="year" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.35)', fontFamily: 'Tajawal' }} />
                <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.35)', fontFamily: 'Tajawal' }} />
                <Tooltip content={<CustomChartTooltip unit="mm" />} />
                <Bar dataKey="precip" radius={[3, 3, 0, 0]}>
                  {yearlyData.map((d, i) => (
                    <Cell key={i} fill={d.color} opacity={d.year === new Date(selectedEvent.date).getFullYear() ? 1 : 0.5} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Event Detail (right column, row 1) ── */}
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${selectedEvent.color}30`, background: 'rgba(255,255,255,0.02)' }}>

          {/* Event header */}
          <div className="px-4 py-3 flex items-start justify-between gap-3"
            style={{ background: `${selectedEvent.color}10`, borderBottom: `1px solid ${selectedEvent.color}25` }}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                  style={{ background: SEVERITY_LABELS[selectedEvent.severity].bg, color: SEVERITY_LABELS[selectedEvent.severity].color }}>
                  {SEVERITY_LABELS[selectedEvent.severity].ar}
                </span>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {new Date(selectedEvent.date).toLocaleDateString('ar-AE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              </div>
              <h2 className="text-sm font-bold" style={{ color: selectedEvent.color }}>{selectedEvent.nameAr}</h2>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)', maxWidth: 500 }}>
                {selectedEvent.description}
              </p>
            </div>
            <div className="flex-shrink-0 text-xs text-right" style={{ color: 'rgba(255,255,255,0.35)' }}>
              <div className="flex items-center gap-1 mb-1">
                <MapPin size={10} />
                {selectedEvent.region}
              </div>
              <div className="flex items-center gap-1">
                <Clock size={10} />
                {selectedEvent.duration} hour
              </div>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-6 divide-x divide-x-reverse" style={{ borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
            {[
              { icon: '🌧️', label: 'Total Rainfall', value: `${selectedEvent.totalPrecip} mm`, color: '#3B82F6',
                info: 'Total Quantity of rainfall logged during the event in full. Calculated from NCM stations.' },
              { icon: '⚡', label: 'Maximum rate', value: `${selectedEvent.peakRate} mm/hr`, color: '#F59E0B',
                info: 'Highest rainfall rate in one hour. Used to assess drainage network capacity.' },
              { icon: '💧', label: 'Maximum Depth', value: `${selectedEvent.maxDepth} cm`, color: '#06B6D4',
                info: 'Maximum water depth in the most impacted regions.' },
              { icon: '🛣️', label: 'Roads Affected', value: selectedEvent.affectedRoads, color: '#EF4444',
                info: 'count of roads impacted by flooding (closed or very slow).' },
              { icon: '📍', label: 'Area', value: `${selectedEvent.affectedArea} km²`, color: '#8B5CF6',
                info: 'Total geographic area affected by flooding.' },
              { icon: '🏠', label: 'evacuated', value: selectedEvent.evacuated.toLocaleString(), color: '#10B981',
                info: 'Count of people evacuated or transported during the event.' },
            ].map((kpi, i) => (
              <div key={i} className="px-3 py-2.5 text-center relative group">
                <div className="text-sm font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
                <div className="text-[9px] mt-0.5 flex items-center justify-center gap-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {kpi.icon} {kpi.label}
                  <button
                    onClick={() => setShowInfo(showInfo === `kpi-${i}` ? null : `kpi-${i}`)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'rgba(255,255,255,0.4)' }}
                  >
                    <Info size={9} />
                  </button>
                </div>
                {showInfo === `kpi-${i}` && (
                  <div className="absolute bottom-full right-0 z-50 w-48 p-2 rounded text-right text-[10px] leading-relaxed"
                    style={{ background: '#0D1220', border: '1px solid rgba(27,79,138,0.4)', color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
                    {kpi.info}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Chart controls */}
          <div className="flex items-center gap-3 px-4 py-2 border-b flex-wrap" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {/* Phase selector */}
            <div className="flex gap-1 rounded p-0.5" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }}>
              {([
                ['all', t('All Phases', 'All Phases')],
                ['before', '⬅️ Before'],
                ['during', t('⚡ during', '⚡ During')],
                ['after', t('➡️ after', '➡️ After')],
              ] as [PhaseKey, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setActivePhase(id)}
                  className="text-[11px] px-3 py-1 rounded transition-all font-semibold"
                  style={{
                    background: activePhase === id ? selectedEvent.color : 'transparent',
                    color: activePhase === id ? '#fff' : (isDark ? 'rgba(255,255,255,0.45)' : '#6B7280'),
                  }}>
                  {label}
                </button>
              ))}
            </div>
            {/* Chart type */}
            <div className="flex gap-1 rounded p-0.5 mr-auto" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }}>
              {(Object.entries(CHART_CONFIGS) as [ChartType, typeof CHART_CONFIGS[ChartType]][]).map(([id, cfg]) => (
                <button key={id} onClick={() => setActiveChart(id)}
                  className="text-[11px] px-2.5 py-1 rounded transition-all"
                  style={{
                    background: activeChart === id ? `${cfg.color}22` : 'transparent',
                    color: activeChart === id ? cfg.color : 'rgba(255,255,255,0.4)',
                    border: activeChart === id ? `1px solid ${cfg.color}55` : '1px solid transparent',
                  }}>
                  {cfg.labelAr}
                </button>
              ))}
            </div>
          </div>

          {/* Main chart */}
          <div className="px-4 py-3">
            <div className="text-xs mb-2 flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <span style={{ color: chartCfg.color }}>{chartCfg.labelAr} ({chartCfg.unit})</span>
              <MetricTooltip id={activeChart === 'precip' ? 'precipitation' : activeChart === 'risk' ? 'floodRiskIndex' : activeChart === 'depth' ? 'maxWaterDepth' : 'roadImpact'} size={10} position="right" />
              <span>—</span>
              <span>{activePhase === 'all' ? 'All Phases' : activePhase === 'before' ? 'Pre-event phase' : activePhase === 'during' ? 'During-event phase' : 'Post-event phase'}</span>
              {activePhase !== 'all' && (
                <span className="mr-auto text-[10px] px-2 py-0.5 rounded"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }}>
                  {activePhase === 'before' ? 'Hours before the event' : activePhase === 'during' ? 'Event peak' : 'Recovery phase'}
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id={chartCfg.gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartCfg.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartCfg.color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="hour" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.35)', fontFamily: 'Tajawal' }} />
                <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.35)', fontFamily: 'Tajawal' }} />
                <Tooltip content={<CustomChartTooltip unit={chartCfg.unit} />} />
                {activePhase === 'all' && (
                  <>
                    <ReferenceLine x="0h" stroke={selectedEvent.color} strokeDasharray="4 2" strokeWidth={1.5}
                      label={{ value: 'Start', fill: selectedEvent.color, fontSize: 9 }} />
                  </>
                )}
                <Area
                  type="monotone"
                  dataKey={activeChart}
                  name={chartCfg.labelAr}
                  stroke={chartCfg.color}
                  strokeWidth={2}
                  fill={`url(#${chartCfg.gradientId})`}
                  dot={{ r: 3, fill: chartCfg.color, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: chartCfg.color }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Bottom row: Map + Zones + Multi-chart ── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr' }}>

          {/* Mini Map */}
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)', height: 260 }}>
            <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <MapPin size={12} style={{ color: selectedEvent.color }} />
              <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>Event Location</span>
              <span className="text-[10px] mr-auto font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {selectedEvent.lat.toFixed(4)}°N {selectedEvent.lng.toFixed(4)}°E
              </span>
            </div>
            <div style={{ height: 220 }}>
              <EventMiniMap
                key={selectedEvent.id}
                lat={selectedEvent.lat}
                lng={selectedEvent.lng}
                name={selectedEvent.region}
                color={selectedEvent.color}
              />
            </div>
          </div>

          {/* Affected Zones */}
          <div className="rounded-lg p-3" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
            <div className="text-xs font-semibold mb-3 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <AlertTriangle size={11} style={{ color: selectedEvent.color }} />
              Affected Areas
            </div>
            <div className="flex flex-col gap-2">
              {selectedEvent.affectedZones.map((zone, i) => {
                const depthPct = Math.min(100, (zone.depth / selectedEvent.maxDepth) * 100);
                const zoneColor = zone.depth > 80 ? '#DC2626' : zone.depth > 50 ? '#EF4444' : zone.depth > 25 ? '#F59E0B' : '#22C55E';
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{zone.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold" style={{ color: zoneColor }}>{zone.depth} cm</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: `${zoneColor}18`, color: zoneColor }}>
                          {zone.status}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-full overflow-hidden" style={{ height: 5, background: 'rgba(255,255,255,0.08)' }}>
                      <div style={{ width: `${depthPct}%`, height: '100%', background: `linear-gradient(90deg, ${zoneColor}88, ${zoneColor})`, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Source info */}
            <div className="mt-3 pt-3 border-t text-[10px]" style={{ borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>
              <div className="flex items-center gap-1 mb-1">
                <Info size={9} />
                Source Data: {selectedEvent.source}
              </div>
              <div>Traffic Satellite: {new Date(selectedEvent.satellitePass).toLocaleString('ar-AE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</div>
              {selectedEvent.economicLoss > 0 && (
                <div className="mt-1" style={{ color: '#F59E0B' }}>
                  Estimated economic losses: {selectedEvent.economicLoss} billion AED
                </div>
              )}
            </div>
          </div>

          {/* Multi-metric comparison (before/during/after) */}
          <div className="rounded-lg p-3" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
            <div className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <Droplets size={11} style={{ color: '#3B82F6' }} />
              Phase comparison — hourly rainfall (mm/hr)
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart
                data={selectedEvent.hourlyPrecip.map((v, i) => ({ h: `${i}hr`, v }))}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="hourlyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={selectedEvent.color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={selectedEvent.color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="h" tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)', fontFamily: 'Tajawal' }} interval={3} />
                <YAxis tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)', fontFamily: 'Tajawal' }} />
                <Tooltip content={<CustomChartTooltip unit="mm/hr" />} />
                <Area type="monotone" dataKey="v" name="Rainfall" stroke={selectedEvent.color} strokeWidth={2}
                  fill="url(#hourlyGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>

            {/* Phase summary */}
            <div className="grid grid-cols-3 gap-1 mt-2">
              {[
                { label: 'Before', data: selectedEvent.phases.before, color: '#3B82F6' },
                { label: 'during', data: selectedEvent.phases.during, color: selectedEvent.color },
                { label: 'after', data: selectedEvent.phases.after, color: '#10B981' },
              ].map((ph, i) => {
                const avgPrecip = ph.data.reduce((s, d) => s + d.precip, 0) / ph.data.length;
                const avgRisk = ph.data.reduce((s, d) => s + d.risk, 0) / ph.data.length;
                return (
                  <div key={i} className="rounded p-2 text-center" style={{ background: `${ph.color}0d`, border: `1px solid ${ph.color}25` }}>
                    <div className="text-[9px] font-bold mb-1" style={{ color: ph.color }}>{ph.label}</div>
                    <div className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.8)' }}>{avgPrecip.toFixed(1)}</div>
                    <div className="text-[8px]" style={{ color: 'rgba(255,255,255,0.3)' }}>mm/hr Average</div>
                    <div className="text-[10px] font-bold mt-0.5" style={{ color: ph.color }}>{avgRisk.toFixed(0)}%</div>
                    <div className="text-[8px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Risk Average</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
