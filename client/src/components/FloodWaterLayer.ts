/**
 * FloodWaterLayer — v14 "Realistic Satellite" Flood Visualization
 *
 * APPROACH: Elliptical flood zones with pixel-by-pixel rendering.
 * Zones are sized to be clearly visible at zoom=8 (1°≈80px).
 * Strong blur creates organic, connected water body appearance.
 */

import L from 'leaflet';

const WATER_COLORS = [
  { d:   0, r: 120, g: 200, b: 255, a: 0.00 },
  { d:   5, r: 140, g: 215, b: 255, a: 0.65 },
  { d:  15, r: 100, g: 185, b: 250, a: 0.75 },
  { d:  30, r:  65, g: 150, b: 235, a: 0.82 },
  { d:  60, r:  35, g: 115, b: 210, a: 0.87 },
  { d: 120, r:  12, g:  75, b: 180, a: 0.91 },
  { d: 250, r:   4, g:  40, b: 140, a: 0.94 },
  { d: 500, r:   1, g:  18, b:  85, a: 0.96 },
];

function depthToColor(depthCm: number): [number, number, number, number] {
  if (depthCm <= 0) return [0, 0, 0, 0];
  const s = WATER_COLORS;
  if (depthCm >= s[s.length - 1].d) {
    const t = s[s.length - 1];
    return [t.r, t.g, t.b, t.a];
  }
  for (let i = 0; i < s.length - 1; i++) {
    if (depthCm >= s[i].d && depthCm < s[i + 1].d) {
      const f = (depthCm - s[i].d) / (s[i + 1].d - s[i].d);
      return [
        Math.round(s[i].r + f * (s[i + 1].r - s[i].r)),
        Math.round(s[i].g + f * (s[i + 1].g - s[i].g)),
        Math.round(s[i].b + f * (s[i + 1].b - s[i].b)),
        +(s[i].a + f * (s[i + 1].a - s[i].a)).toFixed(3),
      ];
    }
  }
  return [65, 150, 235, 0.82];
}

interface FloodZone {
  name: string;
  lat: number; lng: number;
  rLat: number; rLng: number;
  baseDepthCm: number;
  maxDepthCm: number;
  minMult: number;
}

// Zones sized for visibility at zoom=8 (1°≈80px)
// rLat/rLng of 0.20 = ~22km radius = ~32px at zoom=8
const FLOOD_ZONES: FloodZone[] = [
  // Greater Abu Dhabi urban area (large zone covering entire metro)
  { name: 'Greater Abu Dhabi', lat: 24.400, lng: 54.490, rLat: 0.22, rLng: 0.28, baseDepthCm: 72, maxDepthCm: 280, minMult: 0.3 },
  // Abu Dhabi Island (deeper)
  { name: 'Abu Dhabi Island', lat: 24.472, lng: 54.380, rLat: 0.055, rLng: 0.095, baseDepthCm: 62, maxDepthCm: 210, minMult: 0.4 },
  // Mussafah (deepest)
  { name: 'Mussafah', lat: 24.368, lng: 54.478, rLat: 0.075, rLng: 0.065, baseDepthCm: 105, maxDepthCm: 380, minMult: 0.25 },
  // Khalifa City
  { name: 'Khalifa City', lat: 24.408, lng: 54.635, rLat: 0.065, rLng: 0.085, baseDepthCm: 58, maxDepthCm: 195, minMult: 0.35 },
  // MBZ City
  { name: 'MBZ City', lat: 24.362, lng: 54.525, rLat: 0.060, rLng: 0.065, baseDepthCm: 68, maxDepthCm: 230, minMult: 0.3 },
  // Al Shamkha Corridor
  { name: 'Al Shamkha', lat: 24.278, lng: 54.668, rLat: 0.075, rLng: 0.085, baseDepthCm: 80, maxDepthCm: 270, minMult: 0.3 },
  // Al Falah
  { name: 'Al Falah', lat: 24.212, lng: 54.582, rLat: 0.055, rLng: 0.065, baseDepthCm: 72, maxDepthCm: 245, minMult: 0.35 },
  // Sweihan Wadi (3 overlapping zones forming a corridor)
  { name: 'Sweihan N', lat: 24.258, lng: 54.700, rLat: 0.055, rLng: 0.075, baseDepthCm: 115, maxDepthCm: 420, minMult: 0.45 },
  { name: 'Sweihan M', lat: 24.232, lng: 54.760, rLat: 0.050, rLng: 0.070, baseDepthCm: 130, maxDepthCm: 460, minMult: 0.45 },
  { name: 'Sweihan S', lat: 24.210, lng: 54.820, rLat: 0.045, rLng: 0.065, baseDepthCm: 120, maxDepthCm: 430, minMult: 0.5 },
  // Al Wathba
  { name: 'Al Wathba', lat: 24.245, lng: 54.795, rLat: 0.055, rLng: 0.070, baseDepthCm: 52, maxDepthCm: 178, minMult: 0.4 },
  // Baniyas
  { name: 'Baniyas', lat: 24.415, lng: 54.652, rLat: 0.055, rLng: 0.065, baseDepthCm: 48, maxDepthCm: 162, minMult: 0.4 },
  // Zayed City
  { name: 'Zayed City', lat: 24.122, lng: 54.620, rLat: 0.060, rLng: 0.070, baseDepthCm: 65, maxDepthCm: 218, minMult: 0.35 },
  // Al Ain
  { name: 'Al Ain', lat: 24.212, lng: 55.762, rLat: 0.080, rLng: 0.090, baseDepthCm: 44, maxDepthCm: 150, minMult: 0.45 },
  { name: 'Al Ain Hili', lat: 24.195, lng: 55.778, rLat: 0.040, rLng: 0.045, baseDepthCm: 50, maxDepthCm: 170, minMult: 0.45 },
  // Ghayathi
  { name: 'Ghayathi', lat: 23.842, lng: 52.815, rLat: 0.065, rLng: 0.080, baseDepthCm: 155, maxDepthCm: 540, minMult: 0.55 },
  // Ruwais
  { name: 'Ruwais', lat: 24.100, lng: 52.728, rLat: 0.055, rLng: 0.065, baseDepthCm: 62, maxDepthCm: 208, minMult: 0.45 },
  // Madinat Zayed
  { name: 'Madinat Zayed', lat: 23.698, lng: 53.738, rLat: 0.045, rLng: 0.055, baseDepthCm: 45, maxDepthCm: 152, minMult: 0.45 },
  // Liwa
  { name: 'Liwa', lat: 23.122, lng: 53.598, rLat: 0.040, rLng: 0.055, baseDepthCm: 38, maxDepthCm: 128, minMult: 0.55 },
];

function noise(lat: number, lng: number): number {
  return (
    Math.sin(lat * 127.3 + lng * 89.7) * 0.40 +
    Math.sin(lat * 43.1 - lng * 211.5) * 0.30 +
    Math.sin(lat * 311.7 + lng * 37.9) * 0.18 +
    Math.cos(lat * 73.4 - lng * 157.2) * 0.12
  );
}

export interface FloodHotspot {
  lat: number; lng: number;
  radius: number; baseDepth: number; intensity: number;
}

export interface FloodWaterLayerInstance {
  update: (precipMultiplier: number, lang?: 'ar' | 'en') => void;
  remove: () => void;
}

export function createFloodWaterLayer(
  map: any,
  _hotspots: FloodHotspot[],
  initialMultiplier = 1.0,
  initialLang: 'ar' | 'en' = 'ar'
): FloodWaterLayerInstance {
  if (!L || !map) return { update: () => {}, remove: () => {} };
  const container: HTMLElement = map.getContainer();
  if (!container) return { update: () => {}, remove: () => {} };

  container.querySelectorAll('#flood-water-canvas').forEach(el => el.remove());

  const canvas = document.createElement('canvas');
  canvas.id = 'flood-water-canvas';
  Object.assign(canvas.style, {
    position: 'absolute', top: '0', left: '0',
    pointerEvents: 'none', zIndex: '450',
  });
  container.appendChild(canvas);

  let currentMult = initialMultiplier;
  let currentLang: 'ar' | 'en' = initialLang;
  let animId: number | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  function render(mult: number, lang: 'ar' | 'en', immediate = false) {
    currentMult = mult; currentLang = lang;
    if (animId !== null) cancelAnimationFrame(animId);
    if (debounce !== null) clearTimeout(debounce);
    const go = () => { animId = requestAnimationFrame(() => { animId = null; _draw(mult); }); };
    if (immediate) go();
    else debounce = setTimeout(() => { debounce = null; go(); }, 80);
  }

  function _draw(mult: number) {
    const size = map.getSize();
    const W = size.x, H = size.y;
    canvas.width = W; canvas.height = H;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    canvas.style.left = '0px'; canvas.style.top = '0px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (mult < 0.05) return;

    const zoom = map.getZoom();
    const bounds = map.getBounds();
    const step = zoom >= 12 ? 1 : zoom >= 10 ? 2 : zoom >= 9 ? 3 : 4;

    const pad = 0.3;
    const visibleZones = FLOOD_ZONES.filter(z => {
      if (mult < z.minMult) return false;
      if (z.lat - z.rLat > bounds.getNorth() + pad) return false;
      if (z.lat + z.rLat < bounds.getSouth() - pad) return false;
      if (z.lng - z.rLng > bounds.getEast() + pad) return false;
      if (z.lng + z.rLng < bounds.getWest() - pad) return false;
      return true;
    });

    if (visibleZones.length === 0) return;

    const imageData = ctx.createImageData(W, H);
    const data = imageData.data;

    for (let py = 0; py < H; py += step) {
      for (let px = 0; px < W; px += step) {
        const latlng = map.containerPointToLatLng([px, py]);
        const lat = latlng.lat;
        const lng = latlng.lng;

        let maxDepth = 0;

        for (const zone of visibleZones) {
          // Ellipse distance
          const dlat = (lat - zone.lat) / zone.rLat;
          const dlng = (lng - zone.lng) / zone.rLng;
          const dist2 = dlat * dlat + dlng * dlng;
          if (dist2 > 1.0) continue;

          const dist = Math.sqrt(dist2);
          // Smoothstep fade from center to edge
          const t = 1.0 - dist;
          const edgeFade = t * t * (3 - 2 * t);

          const rawDepth = zone.baseDepthCm * mult;
          const cappedDepth = Math.min(rawDepth, zone.maxDepthCm);
          const nv = noise(lat, lng);
          const noisedDepth = cappedDepth * (1.0 + nv * 0.15);
          const finalDepth = noisedDepth * edgeFade;

          if (finalDepth > maxDepth) maxDepth = finalDepth;
        }

        if (maxDepth < 2) continue;

        const [r, g, b, alpha] = depthToColor(maxDepth);
        if (alpha < 0.05) continue;
        const a255 = Math.round(alpha * 255);

        for (let dy = 0; dy < step && py + dy < H; dy++) {
          for (let dx = 0; dx < step && px + dx < W; dx++) {
            const idx = ((py + dy) * W + (px + dx)) * 4;
            data[idx]     = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a255;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Blur for smooth organic appearance
    const blurPx = zoom >= 12 ? 1 : zoom >= 10 ? 2 : zoom >= 9 ? 4 : 6;
    if (blurPx > 0) {
      const tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = H;
      const tCtx = tmp.getContext('2d')!;
      tCtx.drawImage(canvas, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.filter = `blur(${blurPx}px)`;
      ctx.drawImage(tmp, 0, 0);
      ctx.filter = 'none';
    }
  }

  function onMove()   { render(currentMult, currentLang, false); }
  function onSettle() { render(currentMult, currentLang, true); }

  map.on('move',    onMove);
  map.on('zoom',    onMove);
  map.on('zoomend', onSettle);
  map.on('moveend', onSettle);
  map.on('resize',  onSettle);

  render(initialMultiplier, initialLang);

  return {
    update(mult: number, lang: 'ar' | 'en' = 'ar') { render(mult, lang); },
    remove() {
      if (animId !== null) cancelAnimationFrame(animId);
      if (debounce !== null) clearTimeout(debounce);
      map.off('move',    onMove);
      map.off('zoom',    onMove);
      map.off('zoomend', onSettle);
      map.off('moveend', onSettle);
      map.off('resize',  onSettle);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
}
