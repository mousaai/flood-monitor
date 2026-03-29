/*
 * HistoricalTimelineScrubber.tsx
 * Month-based timeline bar for historical mode — same visual style as TimelineScrubber
 * Shows 12 months of the selected year with precipitation bars
 * Fixed height 88px — embedded inside map (position:absolute, bottom:0)
 */

import { useState, useEffect, useRef } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { FLOOD_EVENTS, AVAILABLE_YEARS, type FloodEventDef } from '@/data/historicalWater';

const MONTH_NAMES_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const MONTH_NAMES_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface MonthBar {
  month: number;        // 1–12
  labelAr: string;
  labelEn: string;
  precipMm: number;     // max precip for that month (0 if no event)
  hasEvent: boolean;
  event?: FloodEventDef;
  severity: string;     // 'none' | 'low' | 'moderate' | 'high' | 'severe' | 'extreme'
}

interface HistoricalTimelineScrubberProps {
  year: number;
  selectedMonth: number;          // 1–12
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  onClose: () => void;
  lang: 'ar' | 'en';
}

function buildMonthBars(year: number): MonthBar[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const event = FLOOD_EVENTS.find(e => e.year === year && e.month === month);
    return {
      month,
      labelAr: MONTH_NAMES_AR[i],
      labelEn: MONTH_NAMES_EN[i],
      precipMm: event?.max_mm ?? 0,
      hasEvent: !!event,
      event,
      severity: event?.severity ?? 'none',
    };
  });
}

const SEVERITY_COLOR: Record<string, string> = {
  none:     '#1e293b',
  low:      '#3B82F6',
  moderate: '#F59E0B',
  high:     '#F97316',
  severe:   '#EF4444',
  extreme:  '#7C3AED',
};

export default function HistoricalTimelineScrubber({
  year,
  selectedMonth,
  onMonthChange,
  onYearChange,
  onClose,
  lang,
}: HistoricalTimelineScrubberProps) {
  const [playing, setPlaying] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const bars = buildMonthBars(year);
  const maxPrecip = Math.max(...bars.map(b => b.precipMm), 1);
  const selectedBar = bars[selectedMonth - 1];

  // Auto-play through months
  useEffect(() => {
    if (playing) {
      playRef.current = setInterval(() => {
        const next = selectedMonth < 12 ? selectedMonth + 1 : 1;
        onMonthChange(next);
        if (next === 12) setPlaying(false);
      }, 600);
    } else {
      if (playRef.current) clearInterval(playRef.current);
    }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [playing, selectedMonth, onMonthChange]);

  // Scroll selected bar into view
  useEffect(() => {
    if (!trackRef.current) return;
    const bar = trackRef.current.querySelector(`[data-month="${selectedMonth}"]`) as HTMLElement | null;
    if (bar) bar.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedMonth]);

  const selColor = selectedBar?.hasEvent
    ? SEVERITY_COLOR[selectedBar.severity]
    : '#475569';

  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '96px',
      background: 'linear-gradient(to top, rgba(8,14,24,0.98) 65%, rgba(8,14,24,0.0))',
      zIndex: 998,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      padding: '0 10px 6px',
      userSelect: 'none',
      pointerEvents: 'none',
    }}>

      {/* ── Info row ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '4px',
        pointerEvents: 'auto',
      }}>
        {/* Play/Pause */}
        <button
          onClick={() => setPlaying(p => !p)}
          title={playing ? 'Pause' : 'Play'}
          style={{
            width: '26px', height: '26px', borderRadius: '50%',
            background: playing ? 'rgba(255,107,53,0.25)' : 'rgba(251,191,36,0.2)',
            border: `1px solid ${playing ? 'rgba(255,107,53,0.6)' : 'rgba(251,191,36,0.5)'}`,
            color: playing ? '#FF6B35' : '#FBBF24',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          {playing ? <Pause size={12} /> : <Play size={12} />}
        </button>

        {/* Prev/Next month */}
        <button
          onClick={() => { setPlaying(false); onMonthChange(Math.max(1, selectedMonth - 1)); }}
          style={{ width: '22px', height: '22px', borderRadius: '4px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#90CAF9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <ChevronLeft size={11} />
        </button>
        <button
          onClick={() => { setPlaying(false); onMonthChange(Math.min(12, selectedMonth + 1)); }}
          style={{ width: '22px', height: '22px', borderRadius: '4px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#90CAF9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <ChevronRight size={11} />
        </button>

        {/* HIST badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{
            fontSize: '9px', fontWeight: 700, color: '#FBBF24',
            fontFamily: 'Space Mono, monospace', letterSpacing: '0.08em',
          }}>
            HIST
          </span>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#E8F4F8', fontFamily: 'Space Mono, monospace' }}>
            {lang === 'ar' ? selectedBar?.labelAr : selectedBar?.labelEn} {year}
          </span>
        </div>

        {/* Event name if exists */}
        {selectedBar?.hasEvent && (
          <span style={{
            fontSize: '9px', color: selColor, fontFamily: 'Tajawal, sans-serif',
            background: `${selColor}22`, padding: '2px 6px', borderRadius: '4px',
            border: `1px solid ${selColor}44`,
          }}>
            {selectedBar.event?.name}
          </span>
        )}

        {/* Stats */}
        <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto', alignItems: 'center' }}>
          {selectedBar?.hasEvent ? (
            <>
              <span style={{ fontSize: '10px', color: '#42A5F5', fontFamily: 'monospace' }}>
                Precip.: <strong>{selectedBar.precipMm} mm</strong>
              </span>
              <span style={{ fontSize: '10px', color: selColor, fontFamily: 'monospace' }}>
                Prob.: <strong>100%</strong>
              </span>
            </>
          ) : (
            <span style={{ fontSize: '10px', color: '#475569', fontFamily: 'monospace' }}>
              Precip.: <strong>0 mm</strong>
            </span>
          )}

          {/* Year selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <button
              onClick={() => onYearChange(Math.max(2015, year - 1))}
              style={{ width: '18px', height: '18px', borderRadius: '3px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#90CAF9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <ChevronLeft size={9} />
            </button>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#FBBF24', fontFamily: 'monospace', minWidth: '32px', textAlign: 'center' }}>{year}</span>
            <button
              onClick={() => onYearChange(Math.min(2025, year + 1))}
              style={{ width: '18px', height: '18px', borderRadius: '3px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#90CAF9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <ChevronRight size={9} />
            </button>
          </div>

          {/* Close / back to LIVE */}
          <button
            onClick={onClose}
            title={lang === 'ar' ? 'العودة للبث المباشر' : 'Back to Live'}
            style={{
              display: 'flex', alignItems: 'center', gap: '3px',
              background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: '5px', cursor: 'pointer', color: '#10B981',
              padding: '3px 7px', fontSize: '9px', fontFamily: 'Tajawal, sans-serif',
            }}
          >
            <X size={9} />
            <span>{lang === 'ar' ? 'مباشر' : 'Live'}</span>
          </button>
        </div>
      </div>

      {/* ── Month bars ── */}
      <div
        ref={trackRef}
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '2px',
          height: '36px',
          cursor: 'crosshair',
          overflowX: 'hidden',
          overflowY: 'hidden',
          position: 'relative',
          pointerEvents: 'auto',
        }}
      >
        {bars.map((bar) => {
          const barH = bar.hasEvent
            ? Math.max(4, (bar.precipMm / maxPrecip) * 32)
            : 3;
          const isSelected = bar.month === selectedMonth;
          const color = bar.hasEvent ? SEVERITY_COLOR[bar.severity] : '#1e3a5f';
          const opacity = isSelected ? 1 : bar.hasEvent ? 0.55 : 0.25;

          return (
            <div
              key={bar.month}
              data-month={bar.month}
              onClick={() => onMonthChange(bar.month)}
              title={`${lang === 'ar' ? bar.labelAr : bar.labelEn} ${year}${bar.hasEvent ? ` — ${bar.precipMm} mm` : ''}`}
              style={{
                flex: 1,
                minWidth: '16px',
                height: '36px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              <div style={{
                width: '100%',
                height: `${barH}px`,
                background: isSelected ? color : `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`,
                borderRadius: '2px 2px 0 0',
                boxShadow: isSelected ? `0 0 8px ${color}88` : 'none',
                transition: 'height 0.3s ease, background 0.3s ease',
              }} />
              {/* Selected cursor */}
              {isSelected && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: '2px', height: '100%',
                  background: color,
                  boxShadow: `0 0 6px ${color}`,
                  borderRadius: '1px',
                }} />
              )}
              {/* Event dot */}
              {bar.hasEvent && !isSelected && (
                <div style={{
                  position: 'absolute',
                  top: '2px',
                  width: '4px', height: '4px',
                  borderRadius: '50%',
                  background: color,
                  opacity: 0.8,
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Month labels ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '2px',
        pointerEvents: 'none',
      }}>
        {bars.map(bar => (
          <span key={bar.month} style={{
            flex: 1,
            textAlign: 'center',
            fontSize: '7px',
            fontFamily: 'Space Mono, monospace',
            color: bar.month === selectedMonth
              ? (bar.hasEvent ? SEVERITY_COLOR[bar.severity] : '#FBBF24')
              : bar.hasEvent ? '#546E7A' : '#2d3748',
            fontWeight: bar.month === selectedMonth ? 700 : 400,
            transition: 'color 0.2s',
          }}>
            {lang === 'ar' ? bar.labelAr.slice(0, 3) : bar.labelEn}
          </span>
        ))}
      </div>
    </div>
  );
}
