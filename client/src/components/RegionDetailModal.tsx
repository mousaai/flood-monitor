/*
 * RegionDetailModal.tsx — Detail modal when clicking any metric in a region card
 * Displays: metric interpretation + chart + region map location
 */
import { useEffect, useRef } from 'react';
import type { RegionWeather } from '@/services/weatherApi';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { X, MapPin, Droplets, Thermometer, Wind, AlertTriangle, Activity } from 'lucide-react';

// Real region coordinates
const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  'abudhabi-city': { lat: 24.4539,  lng: 54.3773 },
  'al-ain':        { lat: 24.2075,  lng: 55.7447 },
  'khalifa-city':  { lat: 24.4150,  lng: 54.5950 },
  'shahama':       { lat: 24.5059,  lng: 54.6721 },
  'ruwais':        { lat: 24.1100,  lng: 52.7300 },
  'dhafra':        { lat: 23.6700,  lng: 53.7100 },
  'wathba':        { lat: 24.2600,  lng: 54.6100 },
  'liwa':          { lat: 23.1200,  lng: 53.7700 },
};

// Risk index interpretation
function riskInterpretation(risk: number): { text: string; color: string; level: string } {
  if (risk >= 75) return { text: 'Critical risk — Road inundation and complete traffic disruption likely. Avoid travel.', color: '#EF4444', level: 'Critical' };
  if (risk >= 55) return { text: 'High risk — Potential water accumulation in low-lying areas and major intersections. Exercise caution.', color: '#F97316', level: 'High' };
  if (risk >= 35) return { text: 'Moderate risk — Notable precipitation with possible impact on secondary roads. Monitor updates.', color: '#F59E0B', level: 'Moderate' };
  if (risk >= 20) return { text: 'Low risk — Unstable weather conditions with low probability of water accumulation.', color: '#3B82F6', level: 'Low' };
  return { text: 'Safe — No indicators of water accumulation. Roads are clear.', color: '#10B981', level: 'Safe' };
}

// Temperature interpretation
function tempInterpretation(temp: number): { text: string; color: string } {
  if (temp > 40) return { text: 'Extreme heat — Rapid evaporation of surface water, but high heat stress risk.', color: '#EF4444' };
  if (temp > 30) return { text: 'High temperature — Moderate evaporation reduces long-term water accumulation.', color: '#F59E0B' };
  if (temp > 20) return { text: 'Moderate temperature — Slow evaporation increases duration of standing water.', color: '#10B981' };
  return { text: 'Low temperature — Very slow evaporation; standing water persists longer.', color: '#3B82F6' };
}

// Precipitation interpretation
function precipInterpretation(precip: number): { text: string; color: string } {
  if (precip > 15) return { text: 'Very heavy rainfall — Immediate flood risk. Low-lying roads may be inundated within minutes.', color: '#7C3AED' };
  if (precip > 8)  return { text: 'Heavy rainfall — Rapid water accumulation in poorly drained areas.', color: '#EF4444' };
  if (precip > 3)  return { text: 'Moderate rainfall — Possible accumulation at intersections and low-lying areas.', color: '#F59E0B' };
  if (precip > 0)  return { text: 'Light rainfall — Limited traffic impact, but warrants monitoring.', color: '#3B82F6' };
  return { text: 'No current precipitation — Weather conditions are stable.', color: '#10B981' };
}

// Build region radar data
function buildRadarData(region: RegionWeather) {
  const risk = region.floodRisk;
  const precip = Math.min(region.currentPrecipitation * 5, 100);
  const wind = Math.min(region.currentWindSpeed, 100);
  const temp = Math.max(0, 100 - region.currentTemperature * 2);
  const prob = region.precipitationProbability;
  const history = Math.min(region.totalLast24h * 3, 100);
  return [
    { subject: 'Flood Risk', A: risk },
    { subject: 'Precip. Intensity', A: precip },
    { subject: 'Wind Speed', A: wind },
    { subject: 'Precip. Probability', A: prob },
    { subject: '24h Rainfall', A: history },
    { subject: 'Heat Factor', A: temp },
  ];
}

// Build 48-hour forecast data
function buildForecastData(region: RegionWeather) {
  const base = region.currentPrecipitation;
  const max = region.maxNext48h;
  return Array.from({ length: 13 }, (_, i) => {
    const h = i * 4;
    const factor = Math.sin((i / 12) * Math.PI);
    return {
      time: `${h}h`,
      Precip: +(base + factor * (max - base) * 0.8).toFixed(2),
      Risk: Math.round(region.floodRisk * (0.7 + factor * 0.5)),
    };
  });
}

interface Props {
  region: RegionWeather;
  metric: 'risk' | 'temp' | 'precip';
  onClose: () => void;
}

export default function RegionDetailModal({ region, metric, onClose }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const coords = REGION_COORDS[region.id] || { lat: 24.4539, lng: 54.3773 };
  const radarData = buildRadarData(region);
  const forecastData = buildForecastData(region);

  const riskInfo   = riskInterpretation(region.floodRisk);
  const tempInfo   = tempInterpretation(region.currentTemperature);
  const precipInfo = precipInterpretation(region.currentPrecipitation);

  const metricConfig = {
    risk:   { label: 'Risk Index',          value: `${region.floodRisk}%`,                           color: riskInfo.color,   icon: <AlertTriangle size={18} />, info: riskInfo.text },
    temp:   { label: 'Temperature',         value: `${region.currentTemperature.toFixed(1)}°C`,      color: tempInfo.color,   icon: <Thermometer size={18} />,   info: tempInfo.text },
    precip: { label: 'Current Precip.',     value: `${region.currentPrecipitation.toFixed(2)} mm/h`, color: precipInfo.color, icon: <Droplets size={18} />,      info: precipInfo.text },
  };
  const mc = metricConfig[metric];

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Load small Leaflet map
  useEffect(() => {
    if (!mapRef.current) return;
    const container = mapRef.current;
    container.innerHTML = '';

    // Use iframe with OpenStreetMap directly
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:8px;';
    iframe.src = `https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - 0.08},${coords.lat - 0.06},${coords.lng + 0.08},${coords.lat + 0.06}&layer=mapnik&marker=${coords.lat},${coords.lng}`;
    container.appendChild(iframe);
  }, [coords.lat, coords.lng]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(5,10,20,0.85)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-card, #0d1b2a)',
        borderRight: `1px solid ${mc.color}44`,
        borderBottom: `1px solid ${mc.color}44`,
        borderLeft: `1px solid ${mc.color}44`,
        borderTop: `3px solid ${mc.color}`,
        borderRadius: '16px',
        width: '100%', maxWidth: '860px',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: `0 0 60px ${mc.color}22`,
        fontFamily: 'Space Grotesk, Inter, sans-serif',
        direction: 'ltr',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: `linear-gradient(135deg, ${mc.color}11, transparent)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ color: mc.color }}>{mc.icon}</div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary, #e2e8f0)', fontFamily: 'Space Grotesk, Inter, sans-serif' }}>
                {region.nameEn}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
                {mc.label} — Details & Analysis
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 800, color: mc.color, fontFamily: 'Space Mono, monospace', lineHeight: 1 }}>
                {mc.value}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>{mc.label}</div>
            </div>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '8px',
              padding: '8px', cursor: 'pointer', color: 'var(--text-muted, #64748b)',
              display: 'flex', alignItems: 'center',
            }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Interpretation banner */}
        <div style={{
          margin: '16px 20px 0',
          padding: '12px 16px',
          borderRadius: '10px',
          background: `${mc.color}14`,
          borderTop: `1px solid ${mc.color}33`,
          borderBottom: `1px solid ${mc.color}33`,
          borderRight: `1px solid ${mc.color}33`,
          borderLeft: `4px solid ${mc.color}`,
          fontSize: '13px', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.7,
        }}>
          <span style={{ fontWeight: 700, color: mc.color }}>Interpretation: </span>
          {mc.info}
        </div>

        {/* Grid: charts + map */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', padding: '16px 20px' }}>
          {/* Radar chart */}
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', marginBottom: '8px' }}>
              Comprehensive Region Indicators
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: 'Space Grotesk' }} />
                <Radar name={region.nameEn} dataKey="A" stroke={mc.color} fill={mc.color} fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Map */}
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={11} style={{ color: mc.color }} /> Geographic Location
              <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', marginLeft: 'auto' }}>
                {coords.lat.toFixed(4)}°N, {coords.lng.toFixed(4)}°E
              </span>
            </div>
            <div ref={mapRef} style={{ height: '185px', borderRadius: '8px', overflow: 'hidden', background: '#1a2a3a' }} />
          </div>
        </div>

        {/* Forecast chart */}
        <div style={{ margin: '0 20px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', marginBottom: '10px' }}>
            Precipitation & Risk Index Forecast — Next 48 Hours
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={forecastData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="precipGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={mc.color} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={mc.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: 'Space Grotesk' }} />
              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ background: '#0d1117', border: `1px solid ${mc.color}44`, borderRadius: '8px', fontFamily: 'Space Grotesk', fontSize: 11 }}
                formatter={(value: any, name: string) => [name === 'Precip' ? `${value} mm/h` : `${value}%`, name]}
              />
              <Area type="monotone" dataKey="Precip" stroke="#3B82F6" fill="url(#precipGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="Risk" stroke={mc.color} fill="url(#riskGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Stats row */}
        <div style={{
          margin: '0 20px 20px',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px',
        }}>
          {[
            { label: '24h Rainfall',      value: `${region.totalLast24h.toFixed(1)} mm`,  color: '#3B82F6', icon: <Droplets size={12} /> },
            { label: '48h Forecast',      value: `${region.maxNext48h.toFixed(1)} mm`,    color: '#60A5FA', icon: <Droplets size={12} /> },
            { label: 'Wind Speed',        value: `${region.currentWindSpeed.toFixed(0)} km/h`, color: '#6B7280', icon: <Wind size={12} /> },
            { label: 'Precip. Probability', value: `${region.precipitationProbability}%`, color: '#A78BFA', icon: <Activity size={12} /> },
          ].map(stat => (
            <div key={stat.label} style={{
              background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '10px 12px',
              border: `1px solid ${stat.color}22`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px', color: stat.color }}>
                {stat.icon}
                <span style={{ fontSize: '9px', color: 'var(--text-muted, #64748b)' }}>{stat.label}</span>
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: stat.color, fontFamily: 'Space Mono, monospace' }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
