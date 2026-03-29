/**
 * FloodWaterLayer — FastFlood-style flood visualization
 *
 * THREE-LAYER hybrid approach:
 *
 * LAYER 1 — Dynamic viewport grid (zoom ≥ 10):
 *   Dense irregular patches covering the visible viewport WITHIN
 *   Abu Dhabi emirate land boundary (OSM relation 3766481).
 *   Flood threshold scales with OSM-derived urban density:
 *     density 0.9 → threshold 0.82 (very high coverage)
 *     density 0.5 → threshold 0.68 (moderate coverage)
 *     density 0.0 → threshold 0.40 (sparse / desert)
 *
 * LAYER 2 — Road-following flood (zoom ≥ 13):
 *   Precise flood water along known road centerlines for worst-hit areas.
 *
 * LAYER 3 — Blob hotspots (zoom < 12):
 *   Classic radial gradient blobs for overview zoom levels.
 */

import L from 'leaflet';
import { getHotspotsForZoomMerged, type FloodHotspot } from '@/data/floodHotspots';
import { isInsideAbuDhabi, getUrbanDensity } from '@/data/abuDhabiBoundary';

export type { FloodHotspot };

export interface FloodWaterLayerInstance {
  update: (precipMultiplier: number, lang?: 'ar' | 'en') => void;
  remove: () => void;
}

// ── FastFlood depth → RGBA color scale ───────────────────────────────────────
const DEPTH_STOPS = [
  { d:   0, r: 147, g: 210, b: 255, a: 0.00 },
  { d:   8, r: 130, g: 195, b: 255, a: 0.22 },
  { d:  20, r:  95, g: 170, b: 250, a: 0.32 },
  { d:  45, r:  55, g: 140, b: 240, a: 0.44 },
  { d:  90, r:  28, g: 105, b: 215, a: 0.56 },
  { d: 180, r:  12, g:  70, b: 170, a: 0.66 },
  { d: 450, r:   4, g:  25, b:  90, a: 0.76 },
];

function depthToRgba(depthCm: number): [number, number, number, number] {
  if (depthCm <= 0) return [0, 0, 0, 0];
  const s = DEPTH_STOPS;
  if (depthCm >= s[s.length - 1].d) {
    const last = s[s.length - 1];
    return [last.r, last.g, last.b, last.a];
  }
  for (let i = 0; i < s.length - 1; i++) {
    if (depthCm >= s[i].d && depthCm <= s[i + 1].d) {
      const t = (depthCm - s[i].d) / (s[i + 1].d - s[i].d);
      return [
        Math.round(s[i].r + t * (s[i + 1].r - s[i].r)),
        Math.round(s[i].g + t * (s[i + 1].g - s[i].g)),
        Math.round(s[i].b + t * (s[i + 1].b - s[i].b)),
        s[i].a + t * (s[i + 1].a - s[i].a),
      ];
    }
  }
  return [95, 170, 250, 0.32];
}

function metersToPixels(meters: number, lat: number, zoom: number): number {
  const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
  return meters / mpp;
}

// ── Pseudo-random terrain height ──────────────────────────────────────────────
function terrainHeight(lat: number, lng: number): number {
  const h1 = Math.sin(lat * 317.4 + lng * 211.7) * 0.5 + 0.5;
  const h2 = Math.sin(lat * 89.3  - lng * 143.1) * 0.5 + 0.5;
  const h3 = Math.sin(lat * 521.1 + lng * 67.9)  * 0.5 + 0.5;
  const h4 = Math.cos(lat * 173.6 - lng * 389.2) * 0.5 + 0.5;
  return h1 * 0.35 + h2 * 0.30 + h3 * 0.20 + h4 * 0.15;
}

// ── Known flood-prone area depth boosts ──────────────────────────────────────
interface FloodZone { lat: number; lng: number; r: number; boost: number; }

const FLOOD_ZONES: FloodZone[] = [
  // Khalifa City A
  { lat: 24.385, lng: 54.505, r: 0.08, boost: 2.8 },
  { lat: 24.390, lng: 54.510, r: 0.06, boost: 3.0 },
  { lat: 24.380, lng: 54.500, r: 0.05, boost: 2.5 },
  { lat: 24.420, lng: 54.590, r: 0.07, boost: 2.8 },
  { lat: 24.415, lng: 54.600, r: 0.06, boost: 3.2 },
  // MBZ City
  { lat: 24.370, lng: 54.470, r: 0.06, boost: 3.0 },
  { lat: 24.360, lng: 54.480, r: 0.05, boost: 2.8 },
  // Al Wathba
  { lat: 24.340, lng: 54.575, r: 0.06, boost: 2.5 },
  { lat: 24.270, lng: 54.610, r: 0.07, boost: 2.8 },
  // Baniyas
  { lat: 24.420, lng: 54.640, r: 0.07, boost: 2.6 },
  { lat: 24.430, lng: 54.650, r: 0.05, boost: 2.4 },
  { lat: 24.400, lng: 54.640, r: 0.06, boost: 2.5 },
  // Ghayathi (worst hit April 2024)
  { lat: 23.820, lng: 52.800, r: 0.08, boost: 3.5 },
  { lat: 23.835, lng: 52.805, r: 0.07, boost: 3.8 },
  // Al Ain
  { lat: 24.215, lng: 55.750, r: 0.06, boost: 2.4 },
  // Abu Dhabi Island — corrected coordinates (was in Khor Al Maqta channel)
  { lat: 24.455, lng: 54.380, r: 0.04, boost: 1.8 },
  { lat: 24.450, lng: 54.390, r: 0.04, boost: 2.0 },
  { lat: 24.460, lng: 54.395, r: 0.04, boost: 1.9 }, // Al Manhal / Al Nahyan area
  { lat: 24.445, lng: 54.375, r: 0.04, boost: 1.8 }, // Al Khalidiyah area
  // Al Rahba
  { lat: 24.500, lng: 54.560, r: 0.06, boost: 2.4 },
  { lat: 24.510, lng: 54.570, r: 0.05, boost: 2.6 },
  // Shakhbout
  { lat: 24.340, lng: 54.580, r: 0.06, boost: 2.3 },
  // Khalifa City B
  { lat: 24.400, lng: 54.660, r: 0.06, boost: 2.5 },
  // Al Shamkha / Zayed City
  { lat: 24.300, lng: 54.630, r: 0.07, boost: 2.4 },
  { lat: 24.310, lng: 54.640, r: 0.06, boost: 2.2 },
  // Madinat Zayed
  { lat: 23.705, lng: 53.730, r: 0.06, boost: 2.6 },
  { lat: 23.710, lng: 53.740, r: 0.05, boost: 2.8 },
];

function getZoneBoost(lat: number, lng: number): number {
  let maxBoost = 1.0;
  for (const z of FLOOD_ZONES) {
    const dlat = lat - z.lat, dlng = lng - z.lng;
    const dist = Math.sqrt(dlat * dlat + dlng * dlng);
    if (dist < z.r) {
      const t = 1 - dist / z.r;
      const b = 1.0 + (z.boost - 1.0) * t * t;
      if (b > maxBoost) maxBoost = b;
    }
  }
  return maxBoost;
}

/**
 * Compute flood threshold for a point based on urban density + precipitation.
 * Higher density → higher threshold → more cells flood → denser visualization.
 * Wider precipitation range: multiplier 0.3 → -0.084 (dry/clear), multiplier 2.5 → +0.18 (heavy rain)
 *
 * Formula: threshold = 0.38 + density * 0.44 + multiplierBoost
 *   multiplier=0.3, density=0.0  → 0.38 - 0.084 = 0.296 (desert, dry)
 *   multiplier=1.0, density=0.65 → 0.38 + 0.286 + 0.0 = 0.666 (suburban, normal)
 *   multiplier=2.5, density=0.82 → 0.38 + 0.361 + 0.18 = 0.921 → capped 0.90 (dense, heavy rain)
 */
function getFloodThreshold(lat: number, lng: number, multiplier: number): number {
  const density = getUrbanDensity(lat, lng);
  // Wide range: each unit of multiplier above 1.0 adds 0.12 to threshold
  // multiplier 0.3 → boost = -0.084 (drier, less flooding)
  // multiplier 1.0 → boost = 0.0   (baseline)
  // multiplier 2.5 → boost = +0.18  (heavy rain, much more flooding)
  const multiplierBoost = (multiplier - 1.0) * 0.12;
  return Math.min(0.90, Math.max(0.20, 0.38 + density * 0.44 + multiplierBoost));
}

// ── Road segment data ─────────────────────────────────────────────────────────
interface RoadSegment {
  coords: [number, number][];
  depthCm: number;
  widthM: number;
}

const ROAD_SEGMENTS: RoadSegment[] = [
  // MBZ City E-W
  { coords: [[24.3950,54.4800],[24.3950,54.4900],[24.3950,54.5000],[24.3950,54.5100],[24.3950,54.5200],[24.3950,54.5300]], depthCm: 45, widthM: 25 },
  { coords: [[24.3900,54.4800],[24.3900,54.4900],[24.3900,54.5000],[24.3900,54.5100],[24.3900,54.5200],[24.3900,54.5300]], depthCm: 55, widthM: 30 },
  { coords: [[24.3850,54.4800],[24.3850,54.4900],[24.3850,54.5000],[24.3850,54.5100],[24.3850,54.5200],[24.3850,54.5300]], depthCm: 65, widthM: 30 },
  { coords: [[24.3800,54.4800],[24.3800,54.4900],[24.3800,54.5000],[24.3800,54.5100],[24.3800,54.5200],[24.3800,54.5300]], depthCm: 70, widthM: 35 },
  { coords: [[24.3750,54.4800],[24.3750,54.4900],[24.3750,54.5000],[24.3750,54.5100],[24.3750,54.5200],[24.3750,54.5300]], depthCm: 60, widthM: 25 },
  // MBZ City N-S
  { coords: [[24.4000,54.4900],[24.3950,54.4900],[24.3900,54.4900],[24.3850,54.4900],[24.3800,54.4900],[24.3750,54.4900]], depthCm: 40, widthM: 20 },
  { coords: [[24.4000,54.5000],[24.3950,54.5000],[24.3900,54.5000],[24.3850,54.5000],[24.3800,54.5000],[24.3750,54.5000]], depthCm: 55, widthM: 25 },
  { coords: [[24.4000,54.5100],[24.3950,54.5100],[24.3900,54.5100],[24.3850,54.5100],[24.3800,54.5100],[24.3750,54.5100]], depthCm: 65, widthM: 30 },
  { coords: [[24.4000,54.5200],[24.3950,54.5200],[24.3900,54.5200],[24.3850,54.5200],[24.3800,54.5200],[24.3750,54.5200]], depthCm: 60, widthM: 25 },
  // Khalifa City A E-W
  { coords: [[24.4280,54.5700],[24.4280,54.5800],[24.4280,54.5900],[24.4280,54.6000],[24.4280,54.6100]], depthCm: 60, widthM: 28 },
  { coords: [[24.4230,54.5700],[24.4230,54.5800],[24.4230,54.5900],[24.4230,54.6000],[24.4230,54.6100]], depthCm: 75, widthM: 32 },
  { coords: [[24.4180,54.5700],[24.4180,54.5800],[24.4180,54.5900],[24.4180,54.6000],[24.4180,54.6100]], depthCm: 85, widthM: 35 },
  { coords: [[24.4130,54.5700],[24.4130,54.5800],[24.4130,54.5900],[24.4130,54.6000],[24.4130,54.6100]], depthCm: 80, widthM: 32 },
  // Khalifa City A N-S
  { coords: [[24.4280,54.5750],[24.4230,54.5750],[24.4180,54.5750],[24.4130,54.5750],[24.4080,54.5750]], depthCm: 55, widthM: 22 },
  { coords: [[24.4280,54.5850],[24.4230,54.5850],[24.4180,54.5850],[24.4130,54.5850],[24.4080,54.5850]], depthCm: 70, widthM: 28 },
  { coords: [[24.4280,54.5950],[24.4230,54.5950],[24.4180,54.5950],[24.4130,54.5950],[24.4080,54.5950]], depthCm: 80, widthM: 32 },
  // Mussafah
  { coords: [[24.3780,54.4550],[24.3780,54.4650],[24.3780,54.4750],[24.3780,54.4850]], depthCm: 70, widthM: 35 },
  { coords: [[24.3720,54.4550],[24.3720,54.4650],[24.3720,54.4750],[24.3720,54.4850]], depthCm: 85, widthM: 40 },
  { coords: [[24.3660,54.4550],[24.3660,54.4650],[24.3660,54.4750],[24.3660,54.4850]], depthCm: 90, widthM: 40 },
  { coords: [[24.3780,54.4700],[24.3720,54.4700],[24.3660,54.4700],[24.3600,54.4700]], depthCm: 80, widthM: 35 },
  // Abu Dhabi Island
  { coords: [[24.4650,54.3580],[24.4630,54.3650],[24.4610,54.3720],[24.4590,54.3790],[24.4570,54.3860],[24.4550,54.3930]], depthCm: 50, widthM: 30 },
  { coords: [[24.4560,54.3840],[24.4560,54.3900],[24.4560,54.3960]], depthCm: 58, widthM: 25 },
  { coords: [[24.4520,54.3840],[24.4520,54.3900],[24.4520,54.3960]], depthCm: 62, widthM: 28 },
  { coords: [[24.4560,54.3880],[24.4520,54.3880],[24.4480,54.3880]], depthCm: 60, widthM: 26 },
  // Al Rahba
  { coords: [[24.5050,54.5500],[24.5050,54.5600],[24.5050,54.5700],[24.5050,54.5800]], depthCm: 55, widthM: 28 },
  { coords: [[24.4980,54.5500],[24.4980,54.5600],[24.4980,54.5700],[24.4980,54.5800]], depthCm: 65, widthM: 32 },
  { coords: [[24.5050,54.5650],[24.4980,54.5650],[24.4910,54.5650]], depthCm: 60, widthM: 30 },
  // Shakhbout
  { coords: [[24.3450,54.5500],[24.3450,54.5600],[24.3450,54.5700],[24.3450,54.5800],[24.3450,54.5900]], depthCm: 55, widthM: 28 },
  { coords: [[24.3380,54.5500],[24.3380,54.5600],[24.3380,54.5700],[24.3380,54.5800],[24.3380,54.5900]], depthCm: 65, widthM: 32 },
  { coords: [[24.3450,54.5700],[24.3380,54.5700],[24.3310,54.5700]], depthCm: 70, widthM: 35 },
  // Al Wathba
  { coords: [[24.2800,54.5850],[24.2800,54.5950],[24.2800,54.6050],[24.2800,54.6150],[24.2800,54.6250]], depthCm: 65, widthM: 30 },
  { coords: [[24.2700,54.5850],[24.2700,54.5950],[24.2700,54.6050],[24.2700,54.6150],[24.2700,54.6250]], depthCm: 80, widthM: 35 },
  { coords: [[24.2800,54.6050],[24.2700,54.6050],[24.2600,54.6050]], depthCm: 75, widthM: 32 },
  // Ghayathi
  { coords: [[23.8400,52.7950],[23.8400,52.8050],[23.8400,52.8150],[23.8400,52.8250]], depthCm: 90, widthM: 40 },
  { coords: [[23.8320,52.7950],[23.8320,52.8050],[23.8320,52.8150],[23.8320,52.8250]], depthCm: 110, widthM: 48 },
  { coords: [[23.8400,52.8100],[23.8320,52.8100],[23.8240,52.8100]], depthCm: 120, widthM: 55 },
  // Al Ain
  { coords: [[24.2250,55.7500],[24.2200,55.7500],[24.2150,55.7500],[24.2100,55.7500],[24.2050,55.7500]], depthCm: 55, widthM: 28 },
  { coords: [[24.2200,55.7400],[24.2200,55.7500],[24.2200,55.7600],[24.2200,55.7700]], depthCm: 65, widthM: 32 },
  // Al Shamkha / Zayed City
  { coords: [[24.3050,54.6200],[24.3050,54.6300],[24.3050,54.6400],[24.3050,54.6500]], depthCm: 55, widthM: 28 },
  { coords: [[24.2980,54.6200],[24.2980,54.6300],[24.2980,54.6400],[24.2980,54.6500]], depthCm: 65, widthM: 32 },
  { coords: [[24.3050,54.6350],[24.2980,54.6350],[24.2910,54.6350]], depthCm: 60, widthM: 30 },
  // Madinat Zayed
  { coords: [[23.7100,53.7200],[23.7100,53.7300],[23.7100,53.7400],[23.7100,53.7500]], depthCm: 70, widthM: 32 },
  { coords: [[23.7050,53.7200],[23.7050,53.7300],[23.7050,53.7400],[23.7050,53.7500]], depthCm: 80, widthM: 38 },
  { coords: [[23.7100,53.7350],[23.7050,53.7350],[23.7000,53.7350]], depthCm: 85, widthM: 40 },
  // Khalifa City B
  { coords: [[24.4050,54.6350],[24.4050,54.6450],[24.4050,54.6550],[24.4050,54.6650]], depthCm: 60, widthM: 28 },
  { coords: [[24.3980,54.6350],[24.3980,54.6450],[24.3980,54.6550],[24.3980,54.6650]], depthCm: 70, widthM: 32 },
  { coords: [[24.4050,54.6500],[24.3980,54.6500],[24.3910,54.6500]], depthCm: 65, widthM: 30 },
];

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
    position: 'absolute',
    top: '0', left: '0',
    pointerEvents: 'none',
    zIndex: '450',
  });
  container.appendChild(canvas);

  let currentMultiplier = initialMultiplier;
  let currentLang: 'ar' | 'en' = initialLang;
  let animFrameId: number | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Debounced render: during zoom/pan, wait 80ms before redrawing
  // This prevents re-drawing on every intermediate zoom step
  function render(multiplier: number, lang: 'ar' | 'en', immediate = false) {
    currentMultiplier = multiplier;
    currentLang = lang;
    if (animFrameId !== null) cancelAnimationFrame(animFrameId);
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    if (immediate) {
      animFrameId = requestAnimationFrame(() => { animFrameId = null; _doRender(multiplier); });
    } else {
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        animFrameId = requestAnimationFrame(() => { animFrameId = null; _doRender(multiplier); });
      }, 80);
    }
  }

  function _doRender(multiplier: number) {
    const size = map.getSize();
    const W = size.x, H = size.y;
    canvas.width = W; canvas.height = H;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    canvas.style.left = '0px'; canvas.style.top = '0px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    const zoom = map.getZoom();
    const bounds = map.getBounds();

    // LAYER 1: Dynamic viewport grid (zoom ≥ 10) — land areas only
    _renderDynamicGrid(ctx, map, zoom, bounds, multiplier);

    // LAYER 2: Road-following flood (zoom ≥ 13)
    if (zoom >= 13) {
      _renderRoadFlood(ctx, map, zoom, bounds, multiplier);
    }

    // LAYER 3: Blob hotspots (zoom < 12 only)
    if (zoom < 12) {
      _renderBlobFlood(ctx, map, zoom, bounds, multiplier);
    }
  }

  /**
   * LAYER 1: Dense irregular grid — Abu Dhabi land only.
   * Threshold per cell = f(urban density from OSM zones).
   */
  function _renderDynamicGrid(
    ctx: CanvasRenderingContext2D,
    map: any,
    zoom: number,
    bounds: any,
    multiplier: number
  ) {
    // Clip to Abu Dhabi bounding box
    const north = Math.min(bounds.getNorth(), 25.5);
    const south = Math.max(bounds.getSouth(), 22.5);
    const east  = Math.min(bounds.getEast(),  56.2);
    const west  = Math.max(bounds.getWest(),  51.3);

    if (north < 22.5 || south > 25.5 || east < 51.3 || west > 56.2) return;

    let stepLat: number, stepLng: number, patchRadiusM: number, baseDepthCm: number;

    // Performance: coarser grid at high zoom (fewer points, same visual quality)
    if (zoom >= 16) {
      stepLat = 0.0010; stepLng = 0.0012;  // was 0.0006/0.0007 — 2.8x fewer points
      patchRadiusM = 80; baseDepthCm = 20;
    } else if (zoom >= 14) {
      stepLat = 0.0022; stepLng = 0.0025;  // was 0.0015/0.0017 — 2.1x fewer points
      patchRadiusM = 160; baseDepthCm = 25;
    } else if (zoom >= 12) {
      stepLat = 0.0055; stepLng = 0.0060;  // was 0.0040/0.0045 — 1.9x fewer points
      patchRadiusM = 380; baseDepthCm = 30;
    } else if (zoom >= 10) {
      stepLat = 0.0150; stepLng = 0.0165;  // was 0.0120/0.0135 — 1.5x fewer points
      patchRadiusM = 560; baseDepthCm = 38;
    } else {
      return;
    }

    let lat = south;
    while (lat <= north + stepLat) {
      let lng = west;
      while (lng <= east + stepLng) {
        // Jitter to break grid regularity
        const jLat = (Math.sin(lat * 1337 + lng * 919) * 0.4) * stepLat;
        const jLng = (Math.cos(lat * 773  + lng * 1153) * 0.4) * stepLng;
        const pLat = lat + jLat;
        const pLng = lng + jLng;

        // ── KEY: Skip points outside Abu Dhabi emirate boundary ──────────
        if (!isInsideAbuDhabi(pLat, pLng)) { lng += stepLng; continue; }

        // ── Threshold based on OSM urban density ─────────────────────────
        const threshold = getFloodThreshold(pLat, pLng, multiplier);

        const h = terrainHeight(pLat, pLng);
        if (h < threshold) {
          const floodFraction = (threshold - h) / threshold;
          const zoneBoost = getZoneBoost(pLat, pLng);
          const density = getUrbanDensity(pLat, pLng);
          // Urban areas: full depth; rural/desert: strongly reduced at low zoom
          // At zoom 10, desert areas (density≈0) get factor 0.08 → nearly invisible
          const desertSuppression = zoom <= 10 ? 0.08 : 0.45;
          const urbanFactor = desertSuppression + density * (zoom <= 10 ? 0.80 : 0.60);
          const depthCm = baseDepthCm * multiplier * floodFraction * zoneBoost * urbanFactor;

          if (depthCm >= 2) {
            const [r, g, b, alpha] = depthToRgba(depthCm);
            if (alpha > 0.01) {
              const pt = map.latLngToContainerPoint([pLat, pLng]);
              const rpx = metersToPixels(patchRadiusM, pLat, zoom);
              if (rpx >= 1) {
                const rx = rpx * (1.0 + Math.sin(pLat * 211 + pLng * 317) * 0.25);
                const ry = rpx * (0.75 + Math.cos(pLat * 149 + pLng * 251) * 0.20);
                const angle = Math.sin(pLat * 97 + pLng * 131) * 0.5;

                ctx.save();
                ctx.translate(pt.x, pt.y);
                ctx.rotate(angle);
                ctx.scale(1, ry / rx);

                const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
                grad.addColorStop(0.00, `rgba(${r},${g},${b},${alpha.toFixed(3)})`);
                grad.addColorStop(0.45, `rgba(${r},${g},${b},${(alpha * 0.80).toFixed(3)})`);
                grad.addColorStop(0.70, `rgba(${r},${g},${b},${(alpha * 0.45).toFixed(3)})`);
                grad.addColorStop(0.88, `rgba(${r},${g},${b},${(alpha * 0.15).toFixed(3)})`);
                grad.addColorStop(1.00, `rgba(${r},${g},${b},0)`);

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(0, 0, rx, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
              }
            }
          }
        }
        lng += stepLng;
      }
      lat += stepLat;
    }
  }

  /**
   * LAYER 2: Road-following flood for known worst-hit areas (zoom ≥ 13).
   */
  function _renderRoadFlood(
    ctx: CanvasRenderingContext2D,
    map: any,
    zoom: number,
    bounds: any,
    multiplier: number
  ) {
    const latSpan = bounds.getNorth() - bounds.getSouth();
    const lngSpan = bounds.getEast()  - bounds.getWest();
    const pad = 0.5;

    ROAD_SEGMENTS.forEach(seg => {
      const [lat0, lng0] = seg.coords[0];
      if (lat0 > bounds.getNorth() + latSpan * pad) return;
      if (lat0 < bounds.getSouth() - latSpan * pad) return;
      if (lng0 > bounds.getEast()  + lngSpan * pad) return;
      if (lng0 < bounds.getWest()  - lngSpan * pad) return;

      const effectiveDepth = seg.depthCm * multiplier;
      if (effectiveDepth < 3) return;

      const [r, g, b, alpha] = depthToRgba(effectiveDepth);
      if (alpha < 0.01) return;

      const widthPx = metersToPixels(seg.widthM, lat0, zoom);
      if (widthPx < 1) return;

      const pts = seg.coords.map(([lat, lng]) =>
        map.latLngToContainerPoint([lat, lng])
      );

      ctx.save();

      // Outer glow
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(alpha * 0.35).toFixed(3)})`;
      ctx.lineWidth = widthPx * 2.2;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke();

      // Main flood fill
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(alpha * 0.80).toFixed(3)})`;
      ctx.lineWidth = widthPx * 1.3;
      ctx.stroke();

      // Deep channel
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(alpha * 0.40).toFixed(3)})`;
      ctx.lineWidth = widthPx * 0.4;
      ctx.stroke();

      // Intersection pools
      pts.forEach((pt, i) => {
        if (i === 0 || i === pts.length - 1) return;
        const poolR = widthPx * 1.1;
        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, poolR);
        grad.addColorStop(0, `rgba(${r},${g},${b},${(alpha * 0.85).toFixed(3)})`);
        grad.addColorStop(0.5, `rgba(${r},${g},${b},${(alpha * 0.55).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, poolR, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();
    });
  }

  /**
   * Draw an irregular blob (not a perfect circle) using a polar polygon
   * with per-vertex radius jitter driven by the hotspot coordinates.
   * This breaks the "uniform circle" appearance seen at low zoom.
   */
  function _drawIrregularBlob(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    rx: number, ry: number,
    r: number, g: number, b: number, alpha: number,
    seed: number
  ) {
    const N = 14; // polygon vertices
    const pts: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      // Jitter radius per vertex: ±30% using sin-based pseudo-random
      const jitter = 0.70 + 0.30 * Math.abs(Math.sin(seed * 13.7 + i * 2.39));
      const vx = Math.cos(angle) * rx * jitter;
      const vy = Math.sin(angle) * ry * jitter;
      pts.push([vx, vy]);
    }
    // Smooth the polygon using a simple Catmull-Rom-like pass
    ctx.save();
    ctx.translate(cx, cy);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry));
    grad.addColorStop(0.00, `rgba(${r},${g},${b},${alpha.toFixed(3)})`);
    grad.addColorStop(0.40, `rgba(${r},${g},${b},${(alpha * 0.80).toFixed(3)})`);
    grad.addColorStop(0.68, `rgba(${r},${g},${b},${(alpha * 0.45).toFixed(3)})`);
    grad.addColorStop(0.88, `rgba(${r},${g},${b},${(alpha * 0.12).toFixed(3)})`);
    grad.addColorStop(1.00, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < N; i++) {
      const prev = pts[(i - 1 + N) % N];
      const curr = pts[i];
      const next = pts[(i + 1) % N];
      const cpx = curr[0] + (next[0] - prev[0]) * 0.15;
      const cpy = curr[1] + (next[1] - prev[1]) * 0.15;
      ctx.quadraticCurveTo(curr[0], curr[1], cpx, cpy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function _renderBlobFlood(
    ctx: CanvasRenderingContext2D,
    map: any,
    zoom: number,
    bounds: any,
    multiplier: number
  ) {
    const hotspots = getHotspotsForZoomMerged(zoom);
    const latSpan = bounds.getNorth() - bounds.getSouth();
    const lngSpan = bounds.getEast()  - bounds.getWest();
    const pad = 1.5;
    hotspots.forEach(hs => {
      if (hs.lat > bounds.getNorth() + latSpan * pad) return;
      if (hs.lat < bounds.getSouth() - latSpan * pad) return;
      if (hs.lng > bounds.getEast()  + lngSpan * pad) return;
      if (hs.lng < bounds.getWest()  - lngSpan * pad) return;
      // ✅ Skip hotspots outside Abu Dhabi land boundary (sea, Gulf, channels)
      if (!isInsideAbuDhabi(hs.lat, hs.lng)) return;
      const effectiveDepth = hs.baseDepth * multiplier * hs.intensity;
      if (effectiveDepth < 3) return;
      const pt = map.latLngToContainerPoint([hs.lat, hs.lng]);
      const rpx = metersToPixels(hs.radius, hs.lat, zoom);
      if (rpx < 2) return;
      const [r, g, b, alpha] = depthToRgba(effectiveDepth);
      // Use irregular blob instead of perfect circle
      const rx = rpx * (1.05 + Math.sin(hs.lat * 211 + hs.lng * 317) * 0.20);
      const ry = rpx * (0.80 + Math.cos(hs.lat * 149 + hs.lng * 251) * 0.18);
      const seed = hs.lat * 1000 + hs.lng;
      _drawIrregularBlob(ctx, pt.x, pt.y, rx, ry, r, g, b, alpha, seed);
    });
  }

  // During active zoom/pan: use debounced render (80ms delay)
  // On zoomend/moveend: render immediately for crisp final result
  function onMapMove()   { render(currentMultiplier, currentLang, false); }
  function onMapSettle() { render(currentMultiplier, currentLang, true); }

  map.on('move',    onMapMove);
  map.on('zoom',    onMapMove);
  map.on('zoomend', onMapSettle);
  map.on('moveend', onMapSettle);
  map.on('resize',  onMapSettle);

  render(initialMultiplier, initialLang);

  return {
    update(precipMultiplier: number, lang: 'ar' | 'en' = 'ar') {
      render(precipMultiplier, lang);
    },
    remove() {
      if (animFrameId !== null) cancelAnimationFrame(animFrameId);
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      map.off('move',    onMapMove);
      map.off('zoom',    onMapMove);
      map.off('zoomend', onMapSettle);
      map.off('moveend', onMapSettle);
      map.off('resize',  onMapSettle);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
}
