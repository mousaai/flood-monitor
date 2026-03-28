/**
 * RegionsExplorerPage — Abu Dhabi Emirate Regions Explorer
 * Data: 100% live from Open-Meteo via useLiveRegions hook
 * Historical: ERA5 archive up to 90 days | Forecast: 16-day forecast
 */
import { useState, useMemo } from 'react';
import { useIsMobile } from '@/hooks/useMobile';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  Cell, PieChart, Pie, ComposedChart, Line, ReferenceLine,
} from 'recharts';
import {
  MapPin, Droplets, AlertTriangle, Thermometer, Wind, Activity,
  ArrowUpRight, Building2, TrendingUp, Waves, Navigation,
  RefreshCw, Clock, BarChart2, Calendar, Search,
} from 'lucide-react';
import { alertColor, alertLabel, type AlertLevel } from '@/data/abuDhabiRegions';
import { useLiveRegions, type LiveSubArea, type LiveCity } from '@/hooks/useLiveRegions';
import { useRealWeather, computeWeatherSummary } from '@/hooks/useRealWeather';
import { trpc } from '@/lib/trpc';
import MetricTooltip from '@/components/MetricTooltip';
import { useLocation } from 'wouter';

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg: '#07101F', bgCard: '#0D1A2D', bgPanel: '#0A1525',
  border: 'rgba(27,79,138,0.3)', borderLight: 'rgba(27,79,138,0.15)',
  text: 'rgba(255,255,255,0.92)', textSub: 'rgba(255,255,255,0.55)',
  textMuted: 'rgba(255,255,255,0.32)',
  blue: '#42A5F5', blueLight: 'rgba(66,165,245,0.12)',
  green: '#66BB6A', orange: '#FFA726', red: '#EF4444', yellow: '#F59E0B',
  fontHead: "'Tajawal', sans-serif", fontMono: "'JetBrains Mono', monospace",
};
const tooltipStyle = {
  background: '#0D1A2D', border: '1px solid rgba(27,79,138,0.4)',
  borderRadius: '4px', color: T.text, fontSize: '11px', fontFamily: T.fontMono,
};

// ── Alert Badge ───────────────────────────────────────────────────────────────
function AlertBadge({ level }: { level: AlertLevel }) {
  const color = alertColor(level);
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '2px', fontSize: '10px',
      fontFamily: T.fontMono, fontWeight: 700, letterSpacing: '0.05em',
      background: `${color}18`, color, border: `1px solid ${color}40`,
    }}>{alertLabel(level)}</span>
  );
}

// ── Risk Bar ──────────────────────────────────────────────────────────────────
function RiskBar({ value }: { value: number }) {
  const color = value >= 70 ? T.red : value >= 50 ? T.yellow : value >= 30 ? T.blue : T.green;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: '11px', fontFamily: T.fontMono, color, fontWeight: 700, minWidth: '28px', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// ── KPI Mini Card ─────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, unit, color = T.blue, tooltipId }: {
  icon: React.ReactNode; label: string; value: string | number; unit?: string;
  color?: string; tooltipId?: string;
}) {
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color, opacity: 0.8 }}>{icon}</span>
        <span style={{ fontSize: '10px', color: T.textMuted, fontFamily: T.fontMono, flex: 1 }}>{label}</span>
        {tooltipId && <MetricTooltip id={tooltipId} size={10} position="top" />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontSize: '22px', fontWeight: 700, fontFamily: T.fontHead, color }}>{value}</span>
        {unit && <span style={{ fontSize: '11px', color: T.textMuted, fontFamily: T.fontMono }}>{unit}</span>}
      </div>
    </div>
  );
}

// ── Sub-Area Card ─────────────────────────────────────────────────────────────
function SubAreaCard({ area, onClick }: { area: LiveSubArea; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? 'rgba(66,165,245,0.06)' : T.bgCard, border: `1px solid ${hovered ? 'rgba(66,165,245,0.35)' : T.border}`, borderRadius: '4px', padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s ease' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: T.text, fontFamily: T.fontHead }}>{area.nameAr}</div>
          <div style={{ fontSize: '9px', color: T.textMuted, fontFamily: T.fontMono, marginTop: '1px' }}>{area.nameEn}</div>
        </div>
        <AlertBadge level={area.alertLevel} />
      </div>
      <RiskBar value={area.floodRisk} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginTop: '8px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: T.blue, fontFamily: T.fontMono }}>{area.maxWaterDepthCm}</div>
          <div style={{ fontSize: '8px', color: T.textMuted, fontFamily: T.fontMono }}>Depth cm</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: T.orange, fontFamily: T.fontMono }}>{area.drainageLoad}%</div>
          <div style={{ fontSize: '8px', color: T.textMuted, fontFamily: T.fontMono }}>Drainage</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: area.currentPrecipitation > 0 ? T.blue : T.green, fontFamily: T.fontMono }}>{area.currentPrecipitation}</div>
          <div style={{ fontSize: '8px', color: T.textMuted, fontFamily: T.fontMono }}>mm/hr</div>
        </div>
      </div>
      {area.note && (
        <div style={{ marginTop: '8px', padding: '4px 8px', background: 'rgba(245,158,11,0.08)', borderRadius: '2px', fontSize: '9px', color: T.yellow, fontFamily: T.fontMono }}>⚠ {area.note}</div>
      )}
    </div>
  );
}

// ── City Card ─────────────────────────────────────────────────────────────────
function CityCard({ city, onClick }: { city: LiveCity; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const areas = city.subAreas;
  const n = areas.length;
  const avgRisk = n > 0 ? Math.round(areas.reduce((s, a) => s + a.floodRisk, 0) / n) : 0;
  const totalFloodHa = areas.reduce((s, a) => s + a.floodAreaHa, 0);
  const criticalCount = areas.filter(a => a.alertLevel === 'critical').length;
  const warningCount = areas.filter(a => a.alertLevel === 'warning').length;
  const watchCount = areas.filter(a => a.alertLevel === 'watch').length;
  const safeCount = areas.filter(a => a.alertLevel === 'safe').length;
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? `${city.color}08` : T.bgCard, border: `1px solid ${hovered ? city.color + '50' : T.border}`, borderRadius: '6px', padding: '18px', cursor: 'pointer', transition: 'all 0.18s ease', flex: 1 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: city.color, fontFamily: T.fontHead }}>{city.nameAr}</div>
          <div style={{ fontSize: '10px', color: T.textMuted, fontFamily: T.fontMono }}>{city.nameEn}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span style={{ fontSize: '22px', fontWeight: 800, color: city.color, fontFamily: T.fontMono }}>{avgRisk}</span>
          <span style={{ fontSize: '8px', color: T.textMuted, fontFamily: T.fontMono }}>risk index</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <div style={{ background: T.bgPanel, borderRadius: '3px', padding: '8px' }}>
          <div style={{ fontSize: '11px', color: T.textMuted, fontFamily: T.fontMono }}>Regions</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: T.text, fontFamily: T.fontMono }}>{n}</div>
        </div>
        <div style={{ background: T.bgPanel, borderRadius: '3px', padding: '8px' }}>
          <div style={{ fontSize: '11px', color: T.textMuted, fontFamily: T.fontMono }}>Flood Area</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: T.blue, fontFamily: T.fontMono }}>{totalFloodHa} <span style={{ fontSize: '10px' }}>ha</span></div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
        {criticalCount > 0 && <div style={{ flex: criticalCount, height: '6px', background: T.red, borderRadius: '2px' }} />}
        {warningCount > 0 && <div style={{ flex: warningCount, height: '6px', background: T.yellow, borderRadius: '2px' }} />}
        {watchCount > 0 && <div style={{ flex: watchCount, height: '6px', background: T.blue, borderRadius: '2px' }} />}
        {safeCount > 0 && <div style={{ flex: safeCount, height: '6px', background: T.green, borderRadius: '2px' }} />}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {criticalCount > 0 && <span style={{ fontSize: '9px', color: T.red, fontFamily: T.fontMono }}>●Critical {criticalCount}</span>}
        {warningCount > 0 && <span style={{ fontSize: '9px', color: T.yellow, fontFamily: T.fontMono }}>●Warning {warningCount}</span>}
        {watchCount > 0 && <span style={{ fontSize: '9px', color: T.blue, fontFamily: T.fontMono }}>●Watch {watchCount}</span>}
        {safeCount > 0 && <span style={{ fontSize: '9px', color: T.green, fontFamily: T.fontMono }}>●Safe {safeCount}</span>}
      </div>
    </div>
  );
}

// ── Historical/Forecast Chart ─────────────────────────────────────────────────
type ChartMode = '24h' | '7d' | '30d' | '90d' | '16d_forecast';

function PrecipHistoryChart({ lat, lon, regionName }: { lat: number; lon: number; regionName: string }) {
  const [mode, setMode] = useState<ChartMode>('7d');
  const query = trpc.weather.getPrecipHistory.useQuery({ lat, lon, mode }, { staleTime: 45 * 1000, refetchInterval: 60 * 1000, retry: 1 });
  const points = query.data?.points ?? [];
  const { lang: chartLang } = useLanguage();
  const isAr = chartLang === 'ar';

  const modes: { key: ChartMode; label: string; desc: string }[] = [
    { key: '24h', label: isAr ? '24ساعة' : '24h', desc: isAr ? 'آخر 12ساعة + القادمة 12ساعة' : 'Last 12h + Next 12h' },
    { key: '7d', label: isAr ? '7 أيام' : '7 days', desc: isAr ? 'آخر 3 أيام + توقعات 4 أيام' : 'Last 3 days + Next 4 days' },
    { key: '30d', label: isAr ? '30 يوم' : '30 days', desc: isAr ? 'أرشيف ERA5 + توقعات 3 أيام' : 'ERA5 Archive + 3-day forecast' },
    { key: '90d', label: isAr ? '90 يوم' : '90 days', desc: isAr ? 'أرشيف ERA5 (ثلاثة أشهر)' : 'ERA5 Archive (3 months)' },
    { key: '16d_forecast', label: isAr ? 'توقعات 16 يوم' : '16d Forecast', desc: isAr ? 'توقعات الـ 16 يوماً القادمة' : 'Next 16 days forecast' },
  ];

  const formatX = (tick: string) => mode === '24h' ? tick.slice(0, 5) : tick.slice(5, 10);
  const nowLabel = points.find(p => !p.isHistory)?.time ?? null;
  const maxPrecip = Math.max(...points.map(p => p.precipitation), 1);
  const totalHist = Math.round(points.filter(p => p.isHistory).reduce((s, p) => s + p.precipitation, 0) * 10) / 10;
  const totalForecast = Math.round(points.filter(p => !p.isHistory).reduce((s, p) => s + p.precipitation, 0) * 10) / 10;
  const peakPrecip = points.length > 0 ? Math.max(...points.map(p => p.precipitation)).toFixed(1) : '0';

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart2 size={13} color={T.blue} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: T.text, fontFamily: T.fontHead }}>{isAr ? 'تاريخ الأمطار والتوقعات' : 'Rainfall History & Forecast'}</span>
          <span style={{ fontSize: '9px', color: T.textMuted, fontFamily: T.fontMono }}>{regionName} · ERA5 + Open-Meteo</span>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {modes.map(m => (
            <button key={m.key} onClick={() => setMode(m.key)} title={m.desc}
              style={{ padding: '4px 10px', borderRadius: '3px', fontSize: '10px', fontFamily: T.fontMono, cursor: 'pointer', border: '1px solid', background: mode === m.key ? T.blueLight : 'transparent', borderColor: mode === m.key ? T.blue + '60' : T.borderLight, color: mode === m.key ? T.blue : T.textMuted, transition: 'all 0.15s' }}
            >{m.label}</button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '12px', height: '12px', background: '#1E88E5', borderRadius: '2px', opacity: 0.8 }} />
          <span style={{ fontSize: '9px', color: T.textMuted, fontFamily: T.fontMono }}>{isAr ? 'تاريخي (mm)' : 'Historical (mm)'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '12px', height: '12px', background: '#42A5F5', borderRadius: '2px', opacity: 0.5 }} />
          <span style={{ fontSize: '9px', color: T.textMuted, fontFamily: T.fontMono }}>{isAr ? 'توقعات (mm)' : 'Forecast (mm)'}</span>
        </div>
        {mode !== '30d' && mode !== '90d' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '12px', height: '2px', background: T.orange }} />
            <span style={{ fontSize: '9px', color: T.textMuted, fontFamily: T.fontMono }}>{isAr ? 'احتمال (%)' : 'Probability (%)'}</span>
          </div>
        )}
        {nowLabel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '2px', height: '12px', background: T.red }} />
            <span style={{ fontSize: '9px', color: T.textMuted, fontFamily: T.fontMono }}>{isAr ? 'الآن' : 'Now'}</span>
          </div>
        )}
      </div>

      {query.isLoading ? (
        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textMuted, fontFamily: T.fontMono, fontSize: '11px' }}>
          <RefreshCw size={14} style={{ marginRight: '6px' }} />
          {isAr ? (mode === '90d' ? 'جاري تحميل أرشيف ERA5 (90 يوم)...' : mode === '30d' ? 'جاري تحميل أرشيف ERA5 (30 يوم)...' : 'جاري التحميل...') : (`Loading ${mode === '90d' ? 'ERA5 archive (90 days)' : mode === '30d' ? 'ERA5 archive (30 days)' : 'data'}...`)}
        </div>
      ) : query.isError ? (
        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.red, fontFamily: T.fontMono, fontSize: '11px' }}>{isAr ? 'فشل التحميل. حاول مجدداً.' : 'Failed to load. Retry.'}</div>
      ) : points.length === 0 ? (
        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textMuted, fontFamily: T.fontMono, fontSize: '11px' }}>{isAr ? 'لا توجد بيانات لهذه الفترة.' : 'No data for this period.'}</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={points} margin={{ top: 5, right: 10, bottom: 20, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(66,165,245,0.07)" />
            <XAxis dataKey="time" tickFormatter={formatX} tick={{ fill: T.textMuted, fontSize: 9, fontFamily: T.fontMono }} angle={-30} textAnchor="end"
              interval={mode === '24h' ? 3 : mode === '7d' ? 11 : mode === '16d_forecast' ? 23 : 'preserveStartEnd'} />
            <YAxis yAxisId="left" tick={{ fill: T.textMuted, fontSize: 9, fontFamily: T.fontMono }} domain={[0, Math.ceil(maxPrecip * 1.2)]}
              label={{ value: 'mm', angle: -90, position: 'insideLeft', fill: T.textMuted, fontSize: 9 }} />
            {mode !== '30d' && mode !== '90d' && (
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: T.textMuted, fontSize: 9, fontFamily: T.fontMono }}
                label={{ value: '%', angle: 90, position: 'insideRight', fill: T.textMuted, fontSize: 9 }} />
            )}
            <Tooltip contentStyle={tooltipStyle}
              formatter={(value: number, name: string) => {
                if (name === 'hist') return [`${value} mm`, isAr ? 'هطول (تاريخي)' : 'Rainfall (Historical)'];
                if (name === 'fcst') return [`${value} mm`, isAr ? 'هطول (توقع)' : 'Rainfall (Forecast)'];
                if (name === 'prob') return [`${value}%`, isAr ? 'احتمال المطر' : 'Rain Probability'];
                return [value, name];
              }}
              labelFormatter={(l) => `${isAr ? 'الوقت' : 'Time'}: ${l}`}
            />
            {nowLabel && (
              <ReferenceLine yAxisId="left" x={nowLabel} stroke={T.red} strokeDasharray="4 2"
                label={{ value: isAr ? 'الآن' : 'NOW', fill: T.red, fontSize: 8, fontFamily: T.fontMono }} />
            )}
            <Bar yAxisId="left" dataKey={(p: any) => p.isHistory ? p.precipitation : null} name="hist" fill="#1E88E5" fillOpacity={0.85} radius={[1,1,0,0]} />
            <Bar yAxisId="left" dataKey={(p: any) => !p.isHistory ? p.precipitation : null} name="fcst" fill="#42A5F5" fillOpacity={0.5} radius={[1,1,0,0]} />
            {mode !== '30d' && mode !== '90d' && (
              <Line yAxisId="right" type="monotone" dataKey="probability" name="prob" stroke={T.orange} strokeWidth={1.5} dot={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {points.length > 0 && (
        <div style={{ display: 'flex', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '9px', color: T.textMuted, fontFamily: T.fontMono }}>
            <span style={{ color: T.blue }}>{isAr ? 'مجموع تاريخي: ' : 'Historical total: '}</span>{totalHist} mm
          </span>
          <span style={{ fontSize: '9px', color: T.textMuted, fontFamily: T.fontMono }}>
            <span style={{ color: '#42A5F5' }}>{isAr ? 'مجموع التوقع: ' : 'Forecast total: '}</span>{totalForecast} mm
          </span>
          <span style={{ fontSize: '9px', color: T.textMuted, fontFamily: T.fontMono }}>
            <span style={{ color: T.orange }}>{isAr ? 'ذروة: ' : 'Peak: '}</span>{peakPrecip} mm
          </span>
          <span style={{ fontSize: '9px', color: T.textMuted, fontFamily: T.fontMono }}>
            <span style={{ color: T.textSub }}>{isAr ? 'نقاط: ' : 'Points: '}</span>{points.length}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Level 0: Emirate View ─────────────────────────────────────────────────────
function EmirateView({ cities, onSelectCity }: { cities: LiveCity[]; onSelectCity: (city: LiveCity) => void }) {
  const isMobile = useIsMobile();
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const allAreas = useMemo(() => cities.flatMap(c => c.subAreas), [cities]);
  const totalFloodHa = allAreas.reduce((s, a) => s + a.floodAreaHa, 0);
  // Use live weather summary for counts — matches Dashboard exactly (90 live regions)
  const { data: liveData } = useRealWeather();
  const liveSummary = useMemo(() => computeWeatherSummary(liveData), [liveData]);
  const n = liveData?.regions?.length ?? 90;
  const avgRisk = liveSummary ? Math.round(liveSummary.maxRisk * 0.6) : 0; // avg ≈ 60% of max
  const criticalCount = liveSummary?.criticalCount ?? 0;
  const warningCount = liveSummary?.warningCount ?? 0;
  const watchCount = liveSummary?.watchCount ?? 0;
  const safeCount = n - criticalCount - warningCount - watchCount;

  const comparisonData = cities.map(c => {
    const cn = c.subAreas.length;
    return {
      name: c.nameAr,
      'risk index': cn > 0 ? Math.round(c.subAreas.reduce((s, a) => s + a.floodRisk, 0) / cn) : 0,
      fill: c.color,
    };
  });
  const alertPieData = [
    { name: 'Critical', value: criticalCount, fill: T.red },
    { name: 'Warning', value: warningCount, fill: T.yellow },
    { name: 'Watch', value: watchCount, fill: T.blue },
    { name: 'Safe', value: safeCount, fill: T.green },
  ].filter(d => d.value > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px' }}>
        <KpiCard icon={<Building2 size={14} />} label={isAr ? 'إجمالي المناطق' : 'Total Regions'} value={n} tooltipId="total-areas" />
        <KpiCard icon={<Activity size={14} />} label={isAr ? 'متوسط مؤشر الخطر' : 'Average Risk Index'} value={avgRisk} unit="%" color={avgRisk >= 50 ? T.yellow : T.blue} tooltipId="flood-risk-index" />
        <KpiCard icon={<Waves size={14} />} label={isAr ? 'إجمالي مساحة الفيضان' : 'Total Flood Area'} value={totalFloodHa} unit="ha" color={T.blue} tooltipId="flood-area" />
        <KpiCard icon={<AlertTriangle size={14} />} label={isAr ? 'حرج + تحذير' : 'Critical + Warning'} value={criticalCount + warningCount} color={T.red} tooltipId="critical-areas" />
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <h2 style={{ fontFamily: T.fontHead, fontSize: '14px', fontWeight: 700, color: T.text }}>{isAr ? 'ثلاث مدن — انقر للتفاصيل' : 'Three cities — click for details'}</h2>
          <MetricTooltip id="cities-comparison" size={11} position="bottom" />
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          {cities.map(city => <CityCard key={city.id} city={city} onClick={() => onSelectCity(city)} />)}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '14px' }}>
          <h3 style={{ fontFamily: T.fontHead, fontSize: '12px', fontWeight: 600, color: T.text, marginBottom: '8px' }}>{isAr ? 'توزيع مستويات التنبيه — كامل الإمارة' : 'Alert Level Distribution — Entire Emirate'}</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={alertPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" nameKey="name"
                label={({ name, value }) => `${name}: ${value}`} labelLine={{ stroke: 'rgba(255,255,255,0.2)' }}>
                {alertPieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '14px' }}>
          <h3 style={{ fontFamily: T.fontHead, fontSize: '12px', fontWeight: 600, color: T.text, marginBottom: '8px' }}>{isAr ? 'مقارنة مؤشر الخطر بين المدن' : 'Risk Index Comparison Between Cities'}</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={comparisonData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(66,165,245,0.07)" />
              <XAxis dataKey="name" tick={{ fill: T.textSub, fontSize: 11, fontFamily: T.fontHead }} />
              <YAxis tick={{ fill: T.textMuted, fontSize: 9, fontFamily: T.fontMono }} domain={[0, 100]} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="risk index" radius={[3,3,0,0]}>
                {comparisonData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {/* Full comparison table */}
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
          <h3 style={{ fontFamily: T.fontHead, fontSize: '12px', fontWeight: 600, color: T.text }}>{isAr ? 'مقارنة شاملة — جميع المناطق (بيانات حية)' : 'Comprehensive Comparison — All Regions (Live Data)'}</h3>
          <MetricTooltip id="all-areas-table" size={10} position="top" />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: T.fontMono }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {(isAr ? ['المنطقة', 'المدينة', 'التنبيه', 'الخطر', 'عمق سم', 'فيضان هك', 'صرف%', 'مم/ساعة', 'أقصي 48ساعة', 'حرارة°'] : ['Region', 'City', 'Alert', 'Risk', 'Depth cm', 'Flood ha', 'Drainage%', 'mm/hr', 'Max48h mm', 'Temp°C']).map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'right', color: T.textMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cities.flatMap(city => city.subAreas.map(area => (
                <tr key={area.id} style={{ borderBottom: `1px solid ${T.borderLight}`, cursor: 'pointer' }} onClick={() => onSelectCity(city)}>
                  <td style={{ padding: '6px 10px', color: T.text, fontFamily: T.fontHead, whiteSpace: 'nowrap' }}>{area.nameAr}</td>
                  <td style={{ padding: '6px 10px', color: city.color, whiteSpace: 'nowrap' }}>{city.nameAr}</td>
                  <td style={{ padding: '6px 10px' }}><AlertBadge level={area.alertLevel} /></td>
                  <td style={{ padding: '6px 10px' }}><RiskBar value={area.floodRisk} /></td>
                  <td style={{ padding: '6px 10px', color: T.blue, textAlign: 'center' }}>{area.maxWaterDepthCm}</td>
                  <td style={{ padding: '6px 10px', color: T.blue, textAlign: 'center' }}>{area.floodAreaHa}</td>
                  <td style={{ padding: '6px 10px', color: area.drainageLoad >= 80 ? T.red : area.drainageLoad >= 60 ? T.yellow : T.green, textAlign: 'center' }}>{area.drainageLoad}%</td>
                  <td style={{ padding: '6px 10px', color: area.currentPrecipitation > 0 ? T.blue : T.textSub, textAlign: 'center' }}>{area.currentPrecipitation}</td>
                  <td style={{ padding: '6px 10px', color: area.maxNext48h > 5 ? T.orange : T.textSub, textAlign: 'center' }}>{area.maxNext48h}</td>
                  <td style={{ padding: '6px 10px', color: T.orange, textAlign: 'center' }}>{area.tempC}°</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Level 1: City View ────────────────────────────────────────────────────────
function CityView({ city, onSelectArea }: { city: LiveCity; onSelectArea: (area: LiveSubArea) => void; onBack: () => void }) {
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState<AlertLevel | 'all'>('all');
  const [sortBy, setSortBy] = useState<'risk' | 'depth' | 'drain'>('risk');
  const { lang: cityLang } = useLanguage();
  const isAr = cityLang === 'ar';
  const areas = city.subAreas;
  const n = areas.length;
  const avgRisk = n > 0 ? Math.round(areas.reduce((s, a) => s + a.floodRisk, 0) / n) : 0;
  const totalFloodHa = areas.reduce((s, a) => s + a.floodAreaHa, 0);
  const avgDrainageLoad = n > 0 ? Math.round(areas.reduce((s, a) => s + a.drainageLoad, 0) / n) : 0;
  const criticalCount = areas.filter(a => a.alertLevel === 'critical').length;
  const warningCount = areas.filter(a => a.alertLevel === 'warning').length;
  const watchCount = areas.filter(a => a.alertLevel === 'watch').length;
  const safeCount = areas.filter(a => a.alertLevel === 'safe').length;

  const radarData = [
    { subject: 'Risk', value: avgRisk },
    { subject: 'Drainage', value: avgDrainageLoad },
    { subject: 'Depth', value: Math.min(Math.round(areas.reduce((s, a) => s + a.maxWaterDepthCm, 0) / n), 100) },
    { subject: 'Rainfall', value: Math.min(Math.round(areas.reduce((s, a) => s + a.currentPrecipitation, 0) / n * 100), 100) },
    { subject: 'Max48h', value: Math.min(Math.round(areas.reduce((s, a) => s + a.maxNext48h, 0) / n * 5), 100) },
  ];

  const filtered = useMemo(() => {
    let list = areas;
    if (filterLevel !== 'all') list = list.filter(a => a.alertLevel === filterLevel);
    if (search) list = list.filter(a => a.nameAr.includes(search) || a.nameEn.toLowerCase().includes(search.toLowerCase()));
    return [...list].sort((a, b) => sortBy === 'risk' ? b.floodRisk - a.floodRisk : sortBy === 'depth' ? b.maxWaterDepthCm - a.maxWaterDepthCm : b.drainageLoad - a.drainageLoad);
  }, [areas, filterLevel, search, sortBy]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
        <KpiCard icon={<Building2 size={13} />} label="Regions" value={n} />
        <KpiCard icon={<Activity size={13} />} label="Avg Risk Index" value={avgRisk} unit="%" color={avgRisk >= 50 ? T.yellow : T.blue} tooltipId="flood-risk-index" />
        <KpiCard icon={<Waves size={13} />} label="Flood Area" value={totalFloodHa} unit="ha" color={T.blue} />
        <KpiCard icon={<TrendingUp size={13} />} label="Avg Drainage Load" value={`${avgDrainageLoad}%`} color={avgDrainageLoad >= 70 ? T.red : T.orange} tooltipId="drainage-load" />
        <KpiCard icon={<AlertTriangle size={13} />} label="Critical Regions" value={criticalCount} color={T.red} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '12px' }}>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '14px' }}>
          <h3 style={{ fontFamily: T.fontHead, fontSize: '12px', fontWeight: 600, color: T.text, marginBottom: '8px' }}>{isAr ? 'ملف الخطر' : 'Risk Profile'}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(66,165,245,0.15)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: T.textMuted, fontSize: 9, fontFamily: T.fontMono }} />
              <Radar name={city.nameAr} dataKey="value" stroke={city.color} fill={city.color} fillOpacity={0.2} />
              <Tooltip contentStyle={tooltipStyle} />
            </RadarChart>
          </ResponsiveContainer>
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {([['critical', T.red, criticalCount], ['warning', T.yellow, warningCount], ['watch', T.blue, watchCount], ['safe', T.green, safeCount]] as const).map(([lvl, color, cnt]) =>
              cnt > 0 && (
                <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                  <span style={{ fontSize: '10px', color: T.textSub, fontFamily: T.fontMono, flex: 1 }}>{alertLabel(lvl as AlertLevel)}</span>
                  <span style={{ fontSize: '10px', color, fontFamily: T.fontMono, fontWeight: 700 }}>{cnt}</span>
                </div>
              )
            )}
          </div>
        </div>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '160px', background: T.bgPanel, border: `1px solid ${T.borderLight}`, borderRadius: '3px', padding: '5px 10px' }}>
              <Search size={11} color={T.textMuted} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={isAr ? 'بحث في المناطق...' : 'Search regions...'}
                style={{ background: 'transparent', border: 'none', outline: 'none', color: T.text, fontSize: '11px', fontFamily: T.fontHead, width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['all', 'critical', 'warning', 'watch', 'safe'] as const).map(lvl => (
                <button key={lvl} onClick={() => setFilterLevel(lvl)} style={{ padding: '4px 8px', borderRadius: '2px', fontSize: '9px', fontFamily: T.fontMono, cursor: 'pointer', border: '1px solid', background: filterLevel === lvl ? (lvl === 'all' ? T.blue : alertColor(lvl as AlertLevel)) + '20' : 'transparent', borderColor: filterLevel === lvl ? (lvl === 'all' ? T.blue : alertColor(lvl as AlertLevel)) : T.borderLight, color: lvl === 'all' ? T.textSub : alertColor(lvl as AlertLevel) }}>
                  {lvl === 'all' ? 'All' : alertLabel(lvl as AlertLevel)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {([['risk', 'Risk'], ['depth', 'Depth'], ['drain', 'Drainage']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setSortBy(key)} style={{ padding: '4px 8px', borderRadius: '2px', fontSize: '9px', fontFamily: T.fontMono, cursor: 'pointer', border: `1px solid ${sortBy === key ? T.blue : T.borderLight}`, background: sortBy === key ? T.blueLight : 'transparent', color: sortBy === key ? T.blue : T.textMuted }}>↓ {label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
            {filtered.map(area => <SubAreaCard key={area.id} area={area} onClick={() => onSelectArea(area)} />)}
            {filtered.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '32px', color: T.textMuted, fontFamily: T.fontMono, fontSize: '12px' }}>no matching results</div>
            )}
          </div>
          <div style={{ fontSize: '9px', color: T.textMuted, fontFamily: T.fontMono }}>{isAr ? `عرض ${filtered.length} من ${n} منطقة` : `Showing ${filtered.length} of ${n} regions`}</div>
        </div>
      </div>
    </div>
  );
}

// ── Level 2: Sub-Area View ────────────────────────────────────────────────────
function SubAreaView({ area, city, onBack, onBackToCity }: {
  area: LiveSubArea; city: LiveCity; onBack: () => void; onBackToCity: () => void;
}) {
  const [, navigate] = useLocation();
  const { lang: subLang } = useLanguage();
  const isAr = subLang === 'ar';
  const indicators = [
    { label: isAr ? 'مؤشر خطر الفيضان' : 'Flood Risk Index', value: area.floodRisk, unit: '%', color: area.floodRisk >= 70 ? T.red : area.floodRisk >= 50 ? T.yellow : T.blue, icon: <Activity size={13} />, tooltipId: 'flood-risk-index' },
    { label: isAr ? 'أقصى عمق تراكم' : 'Max Accumulation Depth', value: area.maxWaterDepthCm, unit: 'cm', color: T.blue, icon: <Waves size={13} />, tooltipId: 'max-water-depth' },
    { label: isAr ? 'مساحة الفيضان' : 'Flood Area', value: area.floodAreaHa, unit: 'ha', color: T.blue, icon: <MapPin size={13} /> },
    { label: isAr ? 'هطول حالي' : 'Current Rainfall', value: area.currentPrecipitation, unit: 'mm/hr', color: area.currentPrecipitation > 0 ? T.blue : T.textSub, icon: <Droplets size={13} />, tooltipId: 'precipitation-rate' },
    { label: isAr ? 'مجموع آخر 24ساعة' : 'Total Last 24h', value: area.totalLast24h, unit: 'mm', color: area.totalLast24h > 10 ? T.orange : T.blue, icon: <Calendar size={13} /> },
    { label: isAr ? 'أقصى توقع 48ساعة' : 'Max Next 48h', value: area.maxNext48h, unit: 'mm', color: area.maxNext48h > 10 ? T.red : area.maxNext48h > 5 ? T.yellow : T.green, icon: <TrendingUp size={13} /> },
    { label: isAr ? 'احتمال المطر' : 'Rain Probability', value: area.precipitationProbability, unit: '%', color: area.precipitationProbability > 50 ? T.orange : T.textSub, icon: <Droplets size={13} /> },
    { label: isAr ? 'حمل الصرف' : 'Drainage Load', value: `${area.drainageLoad}%`, unit: '', color: area.drainageLoad >= 80 ? T.red : area.drainageLoad >= 60 ? T.yellow : T.green, icon: <TrendingUp size={13} />, tooltipId: 'drainage-load' },
    { label: isAr ? 'نقاط الصرف' : 'Drainage Points', value: area.drainagePoints, unit: isAr ? 'نقطة' : 'pt', color: T.orange, icon: <Navigation size={13} /> },
    { label: isAr ? 'طرق متأثرة' : 'Affected Roads', value: area.affectedRoads, unit: isAr ? 'طريق' : 'roads', color: area.affectedRoads > 5 ? T.red : area.affectedRoads > 0 ? T.yellow : T.green, icon: <Wind size={13} /> },
    { label: isAr ? 'درجة الحرارة' : 'Temperature', value: area.tempC, unit: '°C', color: T.orange, icon: <Thermometer size={13} />, tooltipId: 'temperature' },
    { label: isAr ? 'الرطوبة' : 'Humidity', value: `${area.humidity}%`, unit: '', color: T.blue, icon: <Droplets size={13} /> },
    { label: isAr ? 'سرعة الرياح' : 'Wind Speed', value: area.currentWindSpeed, unit: 'km/h', color: T.textSub, icon: <Wind size={13} /> },
    { label: isAr ? 'المساحة' : 'Area', value: area.areaSqKm, unit: 'km²', color: T.textSub, icon: <Building2 size={13} /> },
    { label: isAr ? 'السكان' : 'Population', value: area.population.toLocaleString(), unit: '', color: T.textSub, icon: <Building2 size={13} /> },
  ];

  const radarData = [
    { subject: 'Flood Risk', value: area.floodRisk },
    { subject: 'Drainage Load', value: area.drainageLoad },
    { subject: 'Flood Depth', value: Math.min(area.maxWaterDepthCm, 100) },
    { subject: 'Rainfall', value: Math.min(area.currentPrecipitation * 100, 100) },
    { subject: 'Max 48h', value: Math.min(area.maxNext48h * 5, 100) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <AlertBadge level={area.alertLevel} />
            {area.lastUpdated && (
              <span style={{ fontSize: '9px', color: T.textMuted, fontFamily: T.fontMono, display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Clock size={9} /> Live · {new Date(area.lastUpdated).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <span style={{ fontSize: '9px', color: T.green, fontFamily: T.fontMono }}>● Open-Meteo</span>
          </div>
          <h1 style={{ fontFamily: T.fontHead, fontSize: '20px', fontWeight: 800, color: T.text, marginBottom: '4px' }}>{area.nameAr}</h1>
          <p style={{ fontFamily: T.fontMono, fontSize: '11px', color: T.textMuted }}>{area.nameEn} · {city.nameAr} · {area.lat.toFixed(4)}°N {area.lng.toFixed(4)}°E</p>
          {area.note && (
            <div style={{ marginTop: '8px', padding: '5px 10px', background: 'rgba(245,158,11,0.08)', borderRadius: '3px', fontSize: '11px', color: T.yellow, fontFamily: T.fontMono }}>⚠ {area.note}</div>
          )}
        </div>
        <button onClick={() => navigate(`/map?lat=${area.lat}&lng=${area.lng}&zoom=14`)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: T.blueLight, border: `1px solid ${T.blue}40`, borderRadius: '3px', cursor: 'pointer', color: T.blue, fontSize: '11px', fontFamily: T.fontMono }}>
          <MapPin size={12} /> {isAr ? 'عرض على الخريطة' : 'View on map'} <ArrowUpRight size={10} />
        </button>
      </div>

      {/* All indicators */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
          <h2 style={{ fontFamily: T.fontHead, fontSize: '13px', fontWeight: 700, color: T.text }}>{isAr ? 'مؤشرات حية' : 'Live Indicators'}</h2>
          <MetricTooltip id="all-indicators" size={11} position="bottom" />
          <span style={{ fontSize: '9px', color: T.green, fontFamily: T.fontMono, marginLeft: '4px' }}>● LIVE · Open-Meteo ERA5 + GFS</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
          {indicators.map((ind, i) => (
            <KpiCard key={i} icon={ind.icon} label={ind.label} value={ind.value} unit={ind.unit} color={ind.color} tooltipId={ind.tooltipId} />
          ))}
        </div>
      </div>

      {/* Historical/Forecast Chart */}
      <PrecipHistoryChart lat={area.lat} lon={area.lng} regionName={area.nameEn} />

      {/* Risk profile + Water depth distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '14px' }}>
          <h3 style={{ fontFamily: T.fontHead, fontSize: '12px', fontWeight: 600, color: T.text, marginBottom: '8px' }}>{isAr ? 'ملف الخطر' : 'Risk Profile'}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(66,165,245,0.15)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: T.textMuted, fontSize: 9, fontFamily: T.fontMono }} />
              <Radar name={area.nameAr} dataKey="value" stroke={alertColor(area.alertLevel)} fill={alertColor(area.alertLevel)} fillOpacity={0.2} />
              <Tooltip contentStyle={tooltipStyle} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '14px' }}>
          <h3 style={{ fontFamily: T.fontHead, fontSize: '12px', fontWeight: 600, color: T.text, marginBottom: '8px' }}>{isAr ? 'توزيع مستوى المياه المتوقع' : 'Forecasted Water Level Distribution'}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={[
                { level: '< 10 cm', area: Math.round(area.floodAreaHa * 0.35) },
                { level: '10-25 cm', area: Math.round(area.floodAreaHa * 0.30) },
                { level: '25-50 cm', area: Math.round(area.floodAreaHa * 0.20) },
                { level: '50-100 cm', area: Math.round(area.floodAreaHa * 0.10) },
                { level: '> 1 m', area: Math.round(area.floodAreaHa * 0.05) },
              ]}
              margin={{ top: 5, right: 5, bottom: 20, left: -10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(66,165,245,0.07)" />
              <XAxis dataKey="level" tick={{ fill: T.textMuted, fontSize: 9, fontFamily: T.fontMono }} angle={-25} textAnchor="end" />
              <YAxis tick={{ fill: T.textMuted, fontSize: 9, fontFamily: T.fontMono }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} ha`, 'Area']} />
              <Bar dataKey="area" radius={[2,2,0,0]}>
                {[0,1,2,3,4].map(i => <Cell key={i} fill={['#42A5F5','#1E88E5','#1565C0','#0D47A1','#082060'][i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Water accumulation details */}
      {area.waterAccumulation && (
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '14px' }}>
          <h3 style={{ fontFamily: T.fontHead, fontSize: '12px', fontWeight: 600, color: T.text, marginBottom: '10px' }}>{isAr ? 'تحليل تراكم المياه — GloFAS + DEM' : 'Water Accumulation Analysis — GloFAS + DEM'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
            <KpiCard icon={<Waves size={13} />} label={isAr ? 'درجة التراكم' : 'Accumulation Score'} value={area.waterAccumulation.score} unit="/100" color={area.waterAccumulation.score >= 70 ? T.red : area.waterAccumulation.score >= 40 ? T.yellow : T.blue} />
            <KpiCard icon={<Droplets size={13} />} label={isAr ? 'عمق تقديري' : 'Est. Depth'} value={area.waterAccumulation.estimatedDepthCm} unit="cm" color={T.blue} />
            <KpiCard icon={<MapPin size={13} />} label={isAr ? 'مساحة تقديرية' : 'Est. Area'} value={area.waterAccumulation.estimatedAreaKm2} unit="km²" color={T.blue} />
            <KpiCard icon={<Activity size={13} />} label={isAr ? 'قابلية التأثر' : 'Susceptibility'} value={area.waterAccumulation.susceptibility} unit="%" color={T.orange} />
            {area.waterAccumulation.wadiDischarge !== null && (
              <KpiCard icon={<TrendingUp size={13} />} label={isAr ? 'تدفق الوادي' : 'Wadi Discharge'} value={area.waterAccumulation.wadiDischarge?.toFixed(1) ?? '0'} unit="m³/s" color={T.blue} />
            )}
          </div>
          <div style={{ marginTop: '8px', fontSize: '9px', color: T.textMuted, fontFamily: T.fontMono }}>
            {isAr ? 'المصادر: ' : 'Sources: '}{area.waterAccumulation.sources.join(' · ')} · {isAr ? 'التربة: ' : 'Soil: '}{area.waterAccumulation.soilType}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RegionsExplorerPage() {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const { cities, isLive, loading, lastUpdated } = useLiveRegions();
  const [level, setLevel] = useState<0 | 1 | 2>(0);
  const [selectedCity, setSelectedCity] = useState<LiveCity | null>(null);
  const [selectedArea, setSelectedArea] = useState<LiveSubArea | null>(null);

  const handleSelectCity = (city: LiveCity) => { setSelectedCity(city); setLevel(1); };
  const handleSelectArea = (area: LiveSubArea) => { setSelectedArea(area); setLevel(2); };
  const handleBackToEmirate = () => { setLevel(0); setSelectedCity(null); setSelectedArea(null); };
  const handleBackToCity = () => { setLevel(1); setSelectedArea(null); };

  const tabs = [
    { label: 'Emirate Abu Dhabi', active: level === 0, onClick: handleBackToEmirate },
    { label: selectedCity?.nameAr ?? 'City', active: level === 1, disabled: !selectedCity, onClick: () => selectedCity && setLevel(1) },
    { label: selectedArea?.nameAr ?? 'Region', active: level === 2, disabled: !selectedArea, onClick: () => selectedArea && setLevel(2) },
  ];

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.fontHead, direction: isAr ? 'rtl' : 'ltr' }}>
      <div style={{ background: T.bgPanel, borderBottom: `1px solid ${T.border}`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontFamily: T.fontHead, fontSize: '16px', fontWeight: 800, color: T.text }}>Abu Dhabi Emirate Regions Explorer</h1>
          <span style={{ fontSize: '10px', color: T.textMuted, fontFamily: T.fontMono }}>{cities.flatMap(c => c.subAreas).length} regions · 3 cities</span>
          {loading && <span style={{ fontSize: '9px', color: T.orange, fontFamily: T.fontMono, display: 'flex', alignItems: 'center', gap: '3px' }}><RefreshCw size={9} /> Loading live data...</span>}
          {isLive && !loading && <span style={{ fontSize: '9px', color: T.green, fontFamily: T.fontMono }}>● LIVE · {lastUpdated ? new Date(lastUpdated).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : ''}</span>}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {tabs.map((tab, i) => (
            <button key={i} onClick={tab.onClick} disabled={tab.disabled}
              style={{ padding: '5px 12px', borderRadius: '3px', fontSize: '11px', fontFamily: T.fontMono, cursor: tab.disabled ? 'not-allowed' : 'pointer', background: tab.active ? T.blueLight : 'transparent', border: `1px solid ${tab.active ? T.blue + '60' : T.borderLight}`, color: tab.disabled ? T.textMuted : tab.active ? T.blue : T.textSub, transition: 'all 0.15s' }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {level === 0 && <EmirateView cities={cities} onSelectCity={handleSelectCity} />}
        {level === 1 && selectedCity && <CityView city={selectedCity} onSelectArea={handleSelectArea} onBack={handleBackToEmirate} />}
        {level === 2 && selectedArea && selectedCity && <SubAreaView area={selectedArea} city={selectedCity} onBack={handleBackToEmirate} onBackToCity={handleBackToCity} />}
      </div>
    </div>
  );
}
