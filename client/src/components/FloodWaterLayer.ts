/**
 * FloodWaterLayer — v11 "Pixel-Perfect" Flood Visualization
 *
 * DESIGN PHILOSOPHY:
 *   Previous versions used scattered circles (dots) which left visible gaps
 *   at zoom=8 (emirate-wide view). This version uses a completely different
 *   approach: pixel-by-pixel rendering via Canvas ImageData API.
 *
 *   ALGORITHM:
 *   1. Sample the canvas at a coarse grid (every N pixels)
 *   2. For each sample, convert pixel → lat/lng
 *   3. Classify the point: urban / semi-urban / desert / sea
 *   4. Compute flood depth based on hydrology parameters
 *   5. Fill a NxN pixel block with the computed color
 *
 *   This guarantees ZERO GAPS in coverage — every pixel inside Abu Dhabi
 *   gets a computed depth value, either 0 (transparent) or > 0 (colored).
 *
 * FLOOD LOGIC (simplified rational method):
 *   depth = precip × runoffCoeff × (1 - infiltration) × (1 - drainage) × terrainFactor
 *
 *   Where terrainFactor amplifies depth in low-lying depressions and
 *   reduces it on slopes and in sandy desert areas.
 *
 * COLOR SCALE (FastFlood-matched):
 *   0 cm   → transparent
 *   10 cm  → rgba(147,210,255, 0.30)  very light sky blue
 *   25 cm  → rgba(100,180,255, 0.48)  light blue
 *   50 cm  → rgba( 55,140,240, 0.62)  medium blue
 *   100 cm → rgba( 20, 90,210, 0.74)  deep blue
 *   200 cm → rgba(  8, 50,160, 0.82)  dark blue
 *   500 cm → rgba(  2, 20, 90, 0.88)  navy
 */

import L from 'leaflet';
import { isInsideAbuDhabi, getUrbanDensity } from '@/data/abuDhabiBoundary';

// ── Color stops ───────────────────────────────────────────────────────────────
const STOPS = [
  { d:   0, r: 147, g: 210, b: 255, a: 0.00 },
  { d:  10, r: 147, g: 210, b: 255, a: 0.30 },
  { d:  25, r: 100, g: 180, b: 255, a: 0.48 },
  { d:  50, r:  55, g: 140, b: 240, a: 0.62 },
  { d: 100, r:  20, g:  90, b: 210, a: 0.74 },
  { d: 200, r:   8, g:  50, b: 160, a: 0.82 },
  { d: 500, r:   2, g:  20, b:  90, a: 0.88 },
];

function depthToRgba(depthCm: number): [number, number, number, number] {
  if (depthCm <= 0) return [0, 0, 0, 0];
  const s = STOPS;
  if (depthCm >= s[s.length - 1].d) {
    const t = s[s.length - 1];
    return [t.r, t.g, t.b, t.a];
  }
  for (let i = 0; i < s.length - 1; i++) {
    if (depthCm >= s[i].d && depthCm <= s[i + 1].d) {
      const f = (depthCm - s[i].d) / (s[i + 1].d - s[i].d);
      return [
        Math.round(s[i].r + f * (s[i + 1].r - s[i].r)),
        Math.round(s[i].g + f * (s[i + 1].g - s[i].g)),
        Math.round(s[i].b + f * (s[i + 1].b - s[i].b)),
        +(s[i].a + f * (s[i + 1].a - s[i].a)).toFixed(3),
      ];
    }
  }
  return [100, 180, 255, 0.40];
}

// ── Flood zone definitions ─────────────────────────────────────────────────────
// Each zone defines a rectangular area with specific hydrology parameters.
// Zones are checked in order; the first match wins.
// Parameters:
//   runoff: fraction of rain that becomes surface runoff (0–1)
//   drain:  drainage infrastructure efficiency (0=no drains, 1=perfect)
//   infil:  infiltration rate factor (0=sealed, 1=very sandy)
//   depFactor: depression amplification (1=flat, 3=deep basin)
//   baseDepthCm: base depth at mult=1.0 (100mm rain)
interface ZoneDef {
  minLat: number; maxLat: number;
  minLng: number; maxLng: number;
  name: string;
  runoff: number;
  drain: number;
  infil: number;
  depFactor: number;
  baseDepthCm: number;
}

const ZONE_DEFS: ZoneDef[] = [
  // ── Abu Dhabi Island (highly urbanized, poor drainage in 2024) ─────────────
  { name: 'Abu Dhabi Island',     minLat: 24.430, maxLat: 24.520, minLng: 54.300, maxLng: 54.460, runoff: 0.90, drain: 0.35, infil: 0.05, depFactor: 1.4, baseDepthCm: 55 },
  { name: 'Al Khalidiyah',        minLat: 24.455, maxLat: 24.495, minLng: 54.325, maxLng: 54.375, runoff: 0.92, drain: 0.30, infil: 0.04, depFactor: 1.6, baseDepthCm: 65 },
  { name: 'Al Muroor',            minLat: 24.460, maxLat: 24.490, minLng: 54.380, maxLng: 54.430, runoff: 0.88, drain: 0.38, infil: 0.05, depFactor: 1.5, baseDepthCm: 58 },
  { name: 'Al Mushrif',           minLat: 24.465, maxLat: 24.505, minLng: 54.360, maxLng: 54.410, runoff: 0.85, drain: 0.40, infil: 0.06, depFactor: 1.3, baseDepthCm: 50 },

  // ── Mussafah (industrial, very flat, very flood-prone) ────────────────────
  { name: 'Mussafah Industrial',  minLat: 24.330, maxLat: 24.415, minLng: 54.430, maxLng: 54.510, runoff: 0.88, drain: 0.15, infil: 0.04, depFactor: 2.2, baseDepthCm: 90 },
  { name: 'Mussafah Residential', minLat: 24.350, maxLat: 24.390, minLng: 54.445, maxLng: 54.490, runoff: 0.85, drain: 0.20, infil: 0.05, depFactor: 2.0, baseDepthCm: 80 },

  // ── KIZAD (industrial, flat, low drainage) ────────────────────────────────
  { name: 'KIZAD',                minLat: 24.260, maxLat: 24.340, minLng: 54.390, maxLng: 54.475, runoff: 0.82, drain: 0.20, infil: 0.06, depFactor: 1.8, baseDepthCm: 70 },

  // ── MBZ City ──────────────────────────────────────────────────────────────
  { name: 'MBZ City',             minLat: 24.355, maxLat: 24.415, minLng: 54.465, maxLng: 54.545, runoff: 0.80, drain: 0.35, infil: 0.08, depFactor: 1.6, baseDepthCm: 62 },

  // ── Khalifa City ──────────────────────────────────────────────────────────
  { name: 'Khalifa City A',       minLat: 24.395, maxLat: 24.450, minLng: 54.555, maxLng: 54.630, runoff: 0.78, drain: 0.40, infil: 0.08, depFactor: 1.5, baseDepthCm: 58 },
  { name: 'Khalifa City B',       minLat: 24.370, maxLat: 24.425, minLng: 54.615, maxLng: 54.705, runoff: 0.75, drain: 0.42, infil: 0.09, depFactor: 1.4, baseDepthCm: 52 },

  // ── Al Raha Beach / Yas Island ────────────────────────────────────────────
  { name: 'Al Raha Beach',        minLat: 24.435, maxLat: 24.485, minLng: 54.535, maxLng: 54.595, runoff: 0.72, drain: 0.50, infil: 0.10, depFactor: 1.3, baseDepthCm: 45 },
  { name: 'Yas Island',           minLat: 24.475, maxLat: 24.520, minLng: 54.585, maxLng: 54.645, runoff: 0.65, drain: 0.55, infil: 0.12, depFactor: 1.2, baseDepthCm: 38 },

  // ── Al Maqta (bridge/low area) ────────────────────────────────────────────
  { name: 'Al Maqta',             minLat: 24.470, maxLat: 24.520, minLng: 54.410, maxLng: 54.475, runoff: 0.82, drain: 0.45, infil: 0.07, depFactor: 1.5, baseDepthCm: 55 },

  // ── Shakhbout / Zayed City ────────────────────────────────────────────────
  { name: 'Shakhbout City',       minLat: 24.300, maxLat: 24.380, minLng: 54.535, maxLng: 54.630, runoff: 0.75, drain: 0.38, infil: 0.10, depFactor: 1.5, baseDepthCm: 55 },
  { name: 'Zayed City Shamkha',   minLat: 24.270, maxLat: 24.335, minLng: 54.585, maxLng: 54.685, runoff: 0.72, drain: 0.35, infil: 0.12, depFactor: 1.6, baseDepthCm: 58 },

  // ── Al Wathba (natural basin — very flood-prone) ──────────────────────────
  { name: 'Al Wathba',            minLat: 24.195, maxLat: 24.290, minLng: 54.565, maxLng: 54.665, runoff: 0.70, drain: 0.20, infil: 0.08, depFactor: 2.5, baseDepthCm: 85 },

  // ── Al Falah ──────────────────────────────────────────────────────────────
  { name: 'Al Falah',             minLat: 24.190, maxLat: 24.260, minLng: 54.535, maxLng: 54.625, runoff: 0.68, drain: 0.30, infil: 0.12, depFactor: 1.6, baseDepthCm: 55 },

  // ── Baniyas ───────────────────────────────────────────────────────────────
  { name: 'Baniyas',              minLat: 24.390, maxLat: 24.465, minLng: 54.605, maxLng: 54.695, runoff: 0.75, drain: 0.38, infil: 0.09, depFactor: 1.5, baseDepthCm: 55 },

  // ── Al Rahba / Shahama ────────────────────────────────────────────────────
  { name: 'Al Rahba',             minLat: 24.480, maxLat: 24.550, minLng: 54.535, maxLng: 54.605, runoff: 0.72, drain: 0.40, infil: 0.10, depFactor: 1.4, baseDepthCm: 48 },
  { name: 'Shahama',              minLat: 24.505, maxLat: 24.565, minLng: 54.405, maxLng: 54.480, runoff: 0.70, drain: 0.42, infil: 0.11, depFactor: 1.3, baseDepthCm: 45 },

  // ── ICAD ──────────────────────────────────────────────────────────────────
  { name: 'ICAD',                 minLat: 24.195, maxLat: 24.285, minLng: 54.435, maxLng: 54.545, runoff: 0.78, drain: 0.22, infil: 0.08, depFactor: 1.7, baseDepthCm: 65 },

  // ── Sweihan Road corridor ─────────────────────────────────────────────────
  { name: 'Sweihan Road',         minLat: 24.190, maxLat: 24.315, minLng: 54.615, maxLng: 54.755, runoff: 0.65, drain: 0.25, infil: 0.15, depFactor: 1.8, baseDepthCm: 60 },

  // ── Al Ain City ───────────────────────────────────────────────────────────
  { name: 'Al Ain City',          minLat: 24.185, maxLat: 24.265, minLng: 55.715, maxLng: 55.800, runoff: 0.78, drain: 0.45, infil: 0.08, depFactor: 1.5, baseDepthCm: 52 },
  { name: 'Al Ain Hili',          minLat: 24.225, maxLat: 24.275, minLng: 55.725, maxLng: 55.795, runoff: 0.72, drain: 0.40, infil: 0.10, depFactor: 1.4, baseDepthCm: 48 },
  { name: 'Al Ain Zakher',        minLat: 24.150, maxLat: 24.205, minLng: 55.685, maxLng: 55.750, runoff: 0.68, drain: 0.42, infil: 0.12, depFactor: 1.3, baseDepthCm: 42 },

  // ── Ruwais (industrial) ───────────────────────────────────────────────────
  { name: 'Ruwais',               minLat: 24.082, maxLat: 24.142, minLng: 52.700, maxLng: 52.762, runoff: 0.80, drain: 0.30, infil: 0.06, depFactor: 1.8, baseDepthCm: 68 },

  // ── Ghayathi ──────────────────────────────────────────────────────────────
  { name: 'Ghayathi',             minLat: 23.808, maxLat: 23.868, minLng: 52.768, maxLng: 52.828, runoff: 0.72, drain: 0.28, infil: 0.12, depFactor: 2.0, baseDepthCm: 72 },

  // ── Madinat Zayed ─────────────────────────────────────────────────────────
  { name: 'Madinat Zayed',        minLat: 23.675, maxLat: 23.715, minLng: 53.695, maxLng: 53.725, runoff: 0.70, drain: 0.32, infil: 0.12, depFactor: 1.6, baseDepthCm: 55 },

  // ── Liwa ──────────────────────────────────────────────────────────────────
  { name: 'Liwa',                 minLat: 23.090, maxLat: 23.155, minLng: 53.595, maxLng: 53.655, runoff: 0.65, drain: 0.25, infil: 0.15, depFactor: 1.5, baseDepthCm: 48 },

  // ── Al Quaa ───────────────────────────────────────────────────────────────
  { name: 'Al Quaa',              minLat: 23.675, maxLat: 23.745, minLng: 55.675, maxLng: 55.745, runoff: 0.62, drain: 0.28, infil: 0.18, depFactor: 1.4, baseDepthCm: 42 },

  // ── Al Mirfa ──────────────────────────────────────────────────────────────
  { name: 'Al Mirfa',             minLat: 23.895, maxLat: 23.950, minLng: 53.315, maxLng: 53.385, runoff: 0.65, drain: 0.30, infil: 0.14, depFactor: 1.5, baseDepthCm: 45 },

  // ── Al Sila ───────────────────────────────────────────────────────────────
  { name: 'Al Sila',              minLat: 24.080, maxLat: 24.135, minLng: 51.675, maxLng: 51.745, runoff: 0.62, drain: 0.28, infil: 0.15, depFactor: 1.4, baseDepthCm: 42 },
];

// Build a fast lookup index: for each zone, precompute its index
// so we can do O(n) lookup per pixel (n = ~30 zones, very fast)

// ── Zone lookup cache ─────────────────────────────────────────────────────────
const _zoneCache = new Map<string, ZoneDef | null>();

function findZone(lat: number, lng: number): ZoneDef | null {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = _zoneCache.get(key);
  if (cached !== undefined) return cached;
  let best: ZoneDef | null = null;
  let bestArea = Infinity;
  for (const z of ZONE_DEFS) {
    if (lat >= z.minLat && lat <= z.maxLat && lng >= z.minLng && lng <= z.maxLng) {
      const area = (z.maxLat - z.minLat) * (z.maxLng - z.minLng);
      if (area < bestArea) { bestArea = area; best = z; }
    }
  }
  if (_zoneCache.size > 16384) {
    const firstKey = _zoneCache.keys().next().value;
    if (firstKey !== undefined) _zoneCache.delete(firstKey);
  }
  _zoneCache.set(key, best);
  return best;
}

// ── Micro-variation for natural-looking patches ───────────────────────────────
// Returns a value in [0, 1] that varies smoothly with position
function microVar(lat: number, lng: number, scale: number = 1.0): number {
  const h1 = Math.sin(lat * 317.4 * scale + lng * 211.7 * scale) * 0.5 + 0.5;
  const h2 = Math.sin(lat *  89.3 * scale - lng * 143.1 * scale) * 0.5 + 0.5;
  const h3 = Math.cos(lat * 173.6 * scale - lng * 389.2 * scale) * 0.5 + 0.5;
  return h1 * 0.45 + h2 * 0.35 + h3 * 0.20;
}

// ── Compute flood depth for a given point ─────────────────────────────────────
// Returns depth in cm (0 = no flooding)
function computeDepth(lat: number, lng: number, mult: number): number {
  const precipMm = mult * 100.0; // 100mm at mult=1.0

  // Find the zone for this point
  const zone = findZone(lat, lng);

  if (zone !== null) {
    // Known urban/semi-urban zone — use zone hydrology
    const netRunoffMm = precipMm * zone.runoff * (1.0 - zone.infil) * (1.0 - zone.drain * 0.85);
    const micro = microVar(lat, lng) * 0.20 - 0.10; // ±10% variation
    const depthCm = zone.baseDepthCm * (netRunoffMm / 100.0) * zone.depFactor * (1.0 + micro);
    return Math.max(0, depthCm);
  }

  // Unknown area — check urban density
  const density = getUrbanDensity(lat, lng);

  if (density > 0.40) {
    // Medium-density urban area not in zone list — use generic urban hydrology
    const runoff = 0.70 + density * 0.15;
    const drain = 0.40;
    const infil = 0.08;
    const netRunoffMm = precipMm * runoff * (1.0 - infil) * (1.0 - drain * 0.85);
    const micro = microVar(lat, lng) * 0.20 - 0.10;
    const depthCm = 45.0 * (netRunoffMm / 100.0) * 1.3 * (1.0 + micro);
    return Math.max(0, depthCm);
  }

  if (density > 0.10) {
    // Low-density urban / suburban — light flooding
    const runoff = 0.55 + density * 0.20;
    const drain = 0.35;
    const infil = 0.15;
    const netRunoffMm = precipMm * runoff * (1.0 - infil) * (1.0 - drain * 0.85);
    const micro = microVar(lat, lng) * 0.20 - 0.10;
    const depthCm = 30.0 * (netRunoffMm / 100.0) * 1.1 * (1.0 + micro);
    return Math.max(0, depthCm);
  }

  // Desert / undeveloped area — NO flooding unless extreme rainfall
  // At 254mm (mult=2.49), show very light water only in natural depressions
  if (mult < 2.0) return 0; // No desert flooding below ~200mm

  // At extreme rainfall (200mm+), some wadi/sabkha areas do flood
  // Use micro-variation to create natural-looking sparse patches
  const mv = microVar(lat, lng, 0.3); // large-scale variation
  if (mv < 0.65) return 0; // 65% of desert stays dry even at extreme rain

  // Only the lowest 35% of desert terrain shows light flooding
  const netRunoffMm = precipMm * 0.35 * (1.0 - 0.45) * (1.0 - 0.15 * 0.85);
  const micro = microVar(lat, lng) * 0.30 - 0.15;
  const depthCm = 12.0 * (netRunoffMm / 100.0) * (mv - 0.65) / 0.35 * (1.0 + micro);
  return Math.max(0, depthCm);
}

// ── Pixel-based flood renderer ────────────────────────────────────────────────
// Renders flood layer by computing depth for each sampled pixel
function renderFloodPixels(
  ctx: CanvasRenderingContext2D,
  map: any,
  W: number,
  H: number,
  mult: number,
  zoom: number
): void {
  // Sample step: balance quality vs performance
  // At zoom=8 (emirate view): step=6px → ~(W/6)×(H/6) samples
  // At zoom=12 (city view): step=3px → finer detail
  // At zoom=16 (street view): step=1px → full resolution
  let step: number;
  if      (zoom >= 16) step = 1;
  else if (zoom >= 14) step = 2;
  else if (zoom >= 12) step = 3;
  else if (zoom >= 10) step = 4;
  else if (zoom >=  8) step = 6;
  else                 step = 10;

  // Create ImageData buffer
  const imgData = ctx.createImageData(W, H);
  const data = imgData.data;

  const bounds = map.getBounds();
  const north = bounds.getNorth();
  const south = bounds.getSouth();
  const west  = bounds.getWest();
  const east  = bounds.getEast();

  // Quick reject: if no overlap with Abu Dhabi bounding box
  if (north < 22.5 || south > 25.5 || east < 51.3 || west > 56.1) return;

  // Precompute lat/lng per pixel row/col
  const latRange = north - south;
  const lngRange = east - west;

  // Process in blocks of `step` pixels
  for (let py = 0; py < H; py += step) {
    const lat = north - (py / H) * latRange;

    // Quick lat check
    if (lat < 22.5 || lat > 25.5) continue;

    for (let px = 0; px < W; px += step) {
      const lng = west + (px / W) * lngRange;

      // Quick lng check
      if (lng < 51.3 || lng > 56.1) continue;

      // Check if inside Abu Dhabi land boundary
      if (!isInsideAbuDhabi(lat, lng)) continue;

      // Compute flood depth
      const depthCm = computeDepth(lat, lng, mult);
      if (depthCm < 2.0) continue; // Below minimum visible threshold

      // Get color
      const [r, g, b, alpha] = depthToRgba(depthCm);
      if (alpha < 0.01) continue;

      const a255 = Math.round(alpha * 255);

      // Fill the step×step block
      const endY = Math.min(py + step, H);
      const endX = Math.min(px + step, W);
      for (let fy = py; fy < endY; fy++) {
        for (let fx = px; fx < endX; fx++) {
          const idx = (fy * W + fx) * 4;
          // Alpha-blend with existing content (additive for water layers)
          const existA = data[idx + 3];
          if (existA === 0) {
            data[idx]     = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a255;
          } else {
            // Blend: take max alpha, average color weighted by alpha
            const newA = Math.max(existA, a255);
            const w1 = existA / 255;
            const w2 = a255 / 255;
            const wSum = w1 + w2;
            data[idx]     = Math.round((data[idx]     * w1 + r * w2) / wSum);
            data[idx + 1] = Math.round((data[idx + 1] * w1 + g * w2) / wSum);
            data[idx + 2] = Math.round((data[idx + 2] * w1 + b * w2) / wSum);
            data[idx + 3] = newA;
          }
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// ── Smooth overlay pass ───────────────────────────────────────────────────────
// After pixel rendering, apply a slight blur for smoother appearance
// (only at lower zoom levels where individual pixels are large)
function applySmoothing(ctx: CanvasRenderingContext2D, W: number, H: number, zoom: number): void {
  if (zoom >= 14) return; // No smoothing needed at high zoom
  const blurPx = zoom >= 12 ? 1 : zoom >= 10 ? 2 : zoom >= 8 ? 3 : 4;
  ctx.filter = `blur(${blurPx}px)`;
  // Re-draw the canvas onto itself with blur
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = W; tempCanvas.height = H;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return;
  tempCtx.drawImage(ctx.canvas, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.filter = 'none';
}

// ── Street-level detail (zoom >= 12) ─────────────────────────────────────────
// At high zoom, add street channel lines and intersection pools
// for more realistic appearance

function m2px(meters: number, lat: number, zoom: number): number {
  const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
  return meters / mpp;
}

// Street segments for detailed zoom levels
interface StreetSeg {
  pts: [number, number][];
  d: number; // base depth cm
  w: number; // width meters
}

const STREET_SEGS: StreetSeg[] = [
  // Mussafah main channels
  { pts: [[24.3950,54.4900],[24.3950,54.5000],[24.3950,54.5100],[24.3950,54.5200]], d: 75, w: 20 },
  { pts: [[24.3900,54.4900],[24.3900,54.5000],[24.3900,54.5100],[24.3900,54.5200]], d: 85, w: 24 },
  { pts: [[24.3850,54.4900],[24.3850,54.5000],[24.3850,54.5100],[24.3850,54.5200]], d: 95, w: 28 },
  { pts: [[24.3800,54.4900],[24.3800,54.5000],[24.3800,54.5100],[24.3800,54.5200]], d: 100, w: 30 },
  { pts: [[24.3950,54.5000],[24.3900,54.5000],[24.3850,54.5000],[24.3800,54.5000]], d: 88, w: 26 },
  { pts: [[24.3950,54.5100],[24.3900,54.5100],[24.3850,54.5100],[24.3800,54.5100]], d: 92, w: 28 },
  // Khalifa City channels
  { pts: [[24.4280,54.5750],[24.4230,54.5750],[24.4180,54.5750],[24.4130,54.5750]], d: 50, w: 12 },
  { pts: [[24.4280,54.5850],[24.4230,54.5850],[24.4180,54.5850],[24.4130,54.5850]], d: 65, w: 14 },
  { pts: [[24.4280,54.5950],[24.4230,54.5950],[24.4180,54.5950],[24.4130,54.5950]], d: 78, w: 16 },
  // Abu Dhabi Island channels
  { pts: [[24.4560,54.3840],[24.4560,54.3900],[24.4560,54.3960]], d: 42, w: 14 },
  { pts: [[24.4520,54.3840],[24.4520,54.3900],[24.4520,54.3960]], d: 48, w: 16 },
  { pts: [[24.4560,54.3880],[24.4520,54.3880],[24.4480,54.3880]], d: 45, w: 14 },
  // Al Ain channels
  { pts: [[24.2250,55.7500],[24.2200,55.7500],[24.2150,55.7500],[24.2100,55.7500]], d: 52, w: 16 },
  { pts: [[24.2200,55.7400],[24.2200,55.7500],[24.2200,55.7600],[24.2200,55.7700]], d: 62, w: 18 },
  // Sweihan Road
  { pts: [[24.2480,54.6200],[24.2480,54.6400],[24.2480,54.6600],[24.2480,54.6800],[24.2480,54.7000]], d: 95, w: 28 },
  { pts: [[24.2380,54.6200],[24.2380,54.6400],[24.2380,54.6600],[24.2380,54.6800],[24.2380,54.7000]], d: 88, w: 24 },
  // Al Shamkha
  { pts: [[24.2950,54.6400],[24.2950,54.6600],[24.2950,54.6800],[24.2950,54.7000]], d: 82, w: 22 },
  { pts: [[24.2850,54.6400],[24.2850,54.6600],[24.2850,54.6800],[24.2850,54.7000]], d: 88, w: 24 },
  { pts: [[24.2750,54.6400],[24.2750,54.6600],[24.2750,54.6800],[24.2750,54.7000]], d: 92, w: 26 },
  // Al Falah
  { pts: [[24.2150,54.5500],[24.2150,54.5700],[24.2150,54.5900],[24.2150,54.6100]], d: 72, w: 20 },
  { pts: [[24.2050,54.5500],[24.2050,54.5700],[24.2050,54.5900],[24.2050,54.6100]], d: 80, w: 22 },
  // Ruwais
  { pts: [[24.1100,52.7200],[24.1100,52.7300],[24.1100,52.7400],[24.1100,52.7500]], d: 65, w: 18 },
  { pts: [[24.1050,52.7200],[24.1050,52.7300],[24.1050,52.7400],[24.1050,52.7500]], d: 78, w: 22 },
  // Ghayathi
  { pts: [[23.8480,52.7950],[23.8480,52.8050],[23.8480,52.8150],[23.8480,52.8250]], d: 100, w: 40 },
  { pts: [[23.8400,52.7950],[23.8400,52.8050],[23.8400,52.8150],[23.8400,52.8250]], d: 120, w: 48 },
  { pts: [[23.8320,52.7950],[23.8320,52.8050],[23.8320,52.8150],[23.8320,52.8250]], d: 140, w: 55 },
  { pts: [[23.8400,52.8100],[23.8320,52.8100],[23.8240,52.8100]], d: 150, w: 60 },
];

// Intersection pools for detailed zoom
interface Pool { lat: number; lng: number; r: number; d: number; }
const POOLS: Pool[] = [
  { lat: 24.3950, lng: 54.5000, r: 100, d: 75 },
  { lat: 24.3950, lng: 54.5100, r: 110, d: 85 },
  { lat: 24.3900, lng: 54.5000, r: 105, d: 82 },
  { lat: 24.3900, lng: 54.5100, r: 115, d: 92 },
  { lat: 24.3850, lng: 54.5000, r: 110, d: 88 },
  { lat: 24.3850, lng: 54.5100, r: 120, d: 98 },
  { lat: 24.3800, lng: 54.5000, r: 115, d: 92 },
  { lat: 24.3800, lng: 54.5100, r: 125, d: 102 },
  { lat: 24.4280, lng: 54.5850, r: 95, d: 72 },
  { lat: 24.4230, lng: 54.5850, r: 100, d: 78 },
  { lat: 24.4180, lng: 54.5850, r: 108, d: 88 },
  { lat: 24.2480, lng: 54.6600, r: 160, d: 115 },
  { lat: 24.2480, lng: 54.6800, r: 145, d: 105 },
  { lat: 24.2380, lng: 54.6600, r: 140, d: 100 },
  { lat: 24.2750, lng: 54.6600, r: 155, d: 118 },
  { lat: 24.2850, lng: 54.6600, r: 150, d: 112 },
  { lat: 23.8480, lng: 52.8100, r: 200, d: 140 },
  { lat: 23.8400, lng: 52.8100, r: 220, d: 160 },
  { lat: 23.8320, lng: 52.8100, r: 240, d: 175 },
  { lat: 24.2200, lng: 55.7500, r: 100, d: 78 },
];

function _drawStreets(ctx: CanvasRenderingContext2D, map: any, zoom: number, bounds: any, mult: number): void {
  const latPad = (bounds.getNorth() - bounds.getSouth()) * 0.6;
  const lngPad = (bounds.getEast()  - bounds.getWest())  * 0.6;

  STREET_SEGS.forEach(seg => {
    const [lat0, lng0] = seg.pts[0];
    if (lat0 > bounds.getNorth() + latPad) return;
    if (lat0 < bounds.getSouth() - latPad) return;
    if (lng0 > bounds.getEast()  + lngPad) return;
    if (lng0 < bounds.getWest()  - lngPad) return;

    const effD = seg.d * mult;
    if (effD < 3) return;
    const [r, g, b, alpha] = depthToRgba(effD);
    if (alpha < 0.01) return;

    const wPx = m2px(seg.w, lat0, zoom);
    if (wPx < 0.8) return;

    const pts = seg.pts.map(([la, ln]) => map.latLngToContainerPoint([la, ln]));

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = `rgba(${r},${g},${b},${(alpha * 0.18).toFixed(3)})`;
    ctx.lineWidth = wPx * 2.8;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = `rgba(${r},${g},${b},${(alpha * 0.45).toFixed(3)})`;
    ctx.lineWidth = wPx * 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = `rgba(${r},${g},${b},${(alpha * 0.70).toFixed(3)})`;
    ctx.lineWidth = wPx * 0.70;
    ctx.stroke();

    ctx.restore();
  });
}

function _drawPools(ctx: CanvasRenderingContext2D, map: any, zoom: number, bounds: any, mult: number): void {
  const latPad = (bounds.getNorth() - bounds.getSouth()) * 0.5;
  const lngPad = (bounds.getEast()  - bounds.getWest())  * 0.5;

  POOLS.forEach(pool => {
    if (pool.lat > bounds.getNorth() + latPad) return;
    if (pool.lat < bounds.getSouth() - latPad) return;
    if (pool.lng > bounds.getEast()  + lngPad) return;
    if (pool.lng < bounds.getWest()  - lngPad) return;

    const effD = pool.d * mult;
    if (effD < 5) return;
    const [r, g, b, alpha] = depthToRgba(effD);
    if (alpha < 0.01) return;

    const pt = map.latLngToContainerPoint([pool.lat, pool.lng]);
    const rpx = m2px(pool.r, pool.lat, zoom);
    if (rpx < 1) return;

    const rx = rpx * (1.0 + Math.sin(pool.lat * 211.3 + pool.lng * 317.7) * 0.22);
    const ry = rpx * (0.72 + Math.cos(pool.lat * 149.1 + pool.lng * 251.3) * 0.18);

    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.scale(1, ry / rx);

    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    grd.addColorStop(0.00, `rgba(${r},${g},${b},${(alpha * 0.85).toFixed(3)})`);
    grd.addColorStop(0.35, `rgba(${r},${g},${b},${(alpha * 0.70).toFixed(3)})`);
    grd.addColorStop(0.62, `rgba(${r},${g},${b},${(alpha * 0.40).toFixed(3)})`);
    grd.addColorStop(0.85, `rgba(${r},${g},${b},${(alpha * 0.12).toFixed(3)})`);
    grd.addColorStop(1.00, `rgba(${r},${g},${b},0)`);

    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ── Public interfaces ─────────────────────────────────────────────────────────
export interface FloodHotspot {
  lat: number; lng: number;
  radius: number; baseDepth: number; intensity: number;
}

export interface FloodWaterLayerInstance {
  update: (precipMultiplier: number, lang?: 'ar' | 'en') => void;
  remove: () => void;
}

// ── Main factory ──────────────────────────────────────────────────────────────
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

    // Main pixel-based rendering
    renderFloodPixels(ctx, map, W, H, mult, zoom);

    // Apply smoothing blur for natural appearance
    applySmoothing(ctx, W, H, zoom);

    // Add street-level detail at high zoom
    if (zoom >= 12) _drawStreets(ctx, map, zoom, bounds, mult);
    if (zoom >= 12) _drawPools(ctx, map, zoom, bounds, mult);
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
