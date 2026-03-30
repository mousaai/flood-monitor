/**
 * FloodWaterLayer — FastFlood-style flood visualization
 *
 * CORRECTED ALGORITHM (v4):
 *
 * The key insight: water accumulates in LOW-LYING areas (wadis, drainage channels,
 * underpasses, low-density desert depressions). High-density urban areas (buildings,
 * elevated roads) BLOCK water flow — they should NOT be uniformly shaded.
 *
 * THREE-LAYER hybrid approach:
 *
 * LAYER 1 — Flood pool patches (zoom ≥ 10):
 *   Patches appear at KNOWN flood-prone low points (FLOOD_ZONES) and
 *   low-density areas with pseudo-random terrain below flood threshold.
 *   High-density urban zones are EXCLUDED from random patches.
 *
 * LAYER 2 — Road-following flood (zoom ≥ 13):
 *   Precise flood water along known road centerlines for worst-hit areas.
 *   Roads act as channels — water flows along them, not covering entire districts.
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

// ── Pseudo-random terrain height (simulates elevation variation) ──────────────
// Returns 0.0–1.0 where LOW values = depressions/wadis (flood-prone)
function terrainHeight(lat: number, lng: number): number {
  const h1 = Math.sin(lat * 317.4 + lng * 211.7) * 0.5 + 0.5;
  const h2 = Math.sin(lat * 89.3  - lng * 143.1) * 0.5 + 0.5;
  const h3 = Math.sin(lat * 521.1 + lng * 67.9)  * 0.5 + 0.5;
  const h4 = Math.cos(lat * 173.6 - lng * 389.2) * 0.5 + 0.5;
  return h1 * 0.35 + h2 * 0.30 + h3 * 0.20 + h4 * 0.15;
}

// ── Known flood-prone area depth boosts ──────────────────────────────────────
// These are REAL low-lying areas that flood during heavy rain events
interface FloodZone { lat: number; lng: number; r: number; boost: number; }

const FLOOD_ZONES: FloodZone[] = [
  // Khalifa City A — underpasses and low-lying streets
  { lat: 24.385, lng: 54.505, r: 0.025, boost: 3.5 },
  { lat: 24.390, lng: 54.510, r: 0.020, boost: 3.8 },
  { lat: 24.380, lng: 54.500, r: 0.018, boost: 3.2 },
  { lat: 24.420, lng: 54.590, r: 0.022, boost: 3.0 },
  { lat: 24.415, lng: 54.600, r: 0.018, boost: 3.5 },
  // MBZ City — drainage channels and low points
  { lat: 24.370, lng: 54.470, r: 0.020, boost: 3.2 },
  { lat: 24.360, lng: 54.480, r: 0.018, boost: 3.0 },
  { lat: 24.395, lng: 54.505, r: 0.022, boost: 2.8 },
  { lat: 24.388, lng: 54.515, r: 0.020, boost: 3.0 },
  // Al Wathba — natural depression
  { lat: 24.340, lng: 54.575, r: 0.030, boost: 2.8 },
  { lat: 24.270, lng: 54.610, r: 0.035, boost: 3.0 },
  // Baniyas — low-lying residential
  { lat: 24.420, lng: 54.640, r: 0.025, boost: 2.8 },
  { lat: 24.430, lng: 54.650, r: 0.020, boost: 2.6 },
  { lat: 24.400, lng: 54.640, r: 0.022, boost: 2.7 },
  // Ghayathi — worst hit April 2024 (desert wadi)
  { lat: 23.820, lng: 52.800, r: 0.040, boost: 4.5 },
  { lat: 23.835, lng: 52.805, r: 0.035, boost: 4.8 },
  { lat: 23.825, lng: 52.815, r: 0.030, boost: 4.2 },
  // Al Ain — wadi crossings
  { lat: 24.215, lng: 55.750, r: 0.025, boost: 2.6 },
  { lat: 24.205, lng: 55.760, r: 0.020, boost: 2.4 },
  // Abu Dhabi Island — low-lying streets (NOT the whole island)
  { lat: 24.455, lng: 54.380, r: 0.012, boost: 2.0 },
  { lat: 24.450, lng: 54.390, r: 0.010, boost: 2.2 },
  // Al Rahba — drainage basin
  { lat: 24.500, lng: 54.560, r: 0.025, boost: 2.6 },
  { lat: 24.510, lng: 54.570, r: 0.020, boost: 2.8 },
  // Shakhbout — low-lying new development
  { lat: 24.340, lng: 54.580, r: 0.025, boost: 2.5 },
  // Khalifa City B
  { lat: 24.400, lng: 54.660, r: 0.022, boost: 2.7 },
  // Al Shamkha / Zayed City
  { lat: 24.300, lng: 54.630, r: 0.030, boost: 2.6 },
  { lat: 24.310, lng: 54.640, r: 0.025, boost: 2.4 },
  // Madinat Zayed
  { lat: 23.705, lng: 53.730, r: 0.025, boost: 2.8 },
  { lat: 23.710, lng: 53.740, r: 0.020, boost: 3.0 },
  // Mussafah — industrial drainage
  { lat: 24.370, lng: 54.465, r: 0.030, boost: 3.2 },
  { lat: 24.360, lng: 54.455, r: 0.025, boost: 3.0 },
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
 * CORRECTED flood threshold logic:
 *
 * Water pools in LOW-LYING areas. High-density urban zones (buildings, elevated roads)
 * should NOT be randomly shaded — only specific flood-prone points within them.
 *
 * For the random grid (Layer 1):
 * - High urban density → HIGHER threshold needed to flood → LESS random coverage
 *   (buildings block random flooding; only actual low points from FLOOD_ZONES flood)
 * - Low density desert → LOWER threshold → more random flooding (wadis, depressions)
 *
 * The threshold here means: "terrain height must be BELOW this value to flood"
 * So LOWER threshold = harder to flood (need very low terrain)
 *     HIGHER threshold = easier to flood (more terrain qualifies)
 *
 * For desert/rural (density=0): threshold=0.55 → moderate random flooding
 * For dense urban (density=0.9): threshold=0.25 → almost no random flooding
 *   (urban areas flood only via FLOOD_ZONES and ROAD_SEGMENTS)
 */
function getFloodThreshold(lat: number, lng: number, multiplier: number): number {
  const density = getUrbanDensity(lat, lng);
  // INVERTED: high density → LOW threshold (harder to randomly flood)
  // desert (density=0): 0.55 + multiplierBoost
  // dense urban (density=0.9): 0.55 - 0.9*0.35 = 0.235 → almost no random patches
  const densityPenalty = density * 0.35;
  // multiplier boost: heavy rain raises threshold slightly (more areas flood)
  const multiplierBoost = (multiplier - 1.0) * 0.08;
  return Math.min(0.75, Math.max(0.15, 0.55 - densityPenalty + multiplierBoost));
}

// ── Road segment data ─────────────────────────────────────────────────────────
// These represent KNOWN flooded road segments from historical events
// Roads act as channels — water flows along them during floods
interface RoadSegment {
  coords: [number, number][];
  depthCm: number;
  widthM: number;
}

const ROAD_SEGMENTS: RoadSegment[] = [
  // MBZ City E-W main arteries (April 2024 flood)
  { coords: [[24.3950,54.4800],[24.3950,54.4900],[24.3950,54.5000],[24.3950,54.5100],[24.3950,54.5200],[24.3950,54.5300]], depthCm: 45, widthM: 18 },
  { coords: [[24.3900,54.4800],[24.3900,54.4900],[24.3900,54.5000],[24.3900,54.5100],[24.3900,54.5200],[24.3900,54.5300]], depthCm: 55, widthM: 22 },
  { coords: [[24.3850,54.4800],[24.3850,54.4900],[24.3850,54.5000],[24.3850,54.5100],[24.3850,54.5200],[24.3850,54.5300]], depthCm: 65, widthM: 22 },
  { coords: [[24.3800,54.4800],[24.3800,54.4900],[24.3800,54.5000],[24.3800,54.5100],[24.3800,54.5200],[24.3800,54.5300]], depthCm: 70, widthM: 25 },
  { coords: [[24.3750,54.4800],[24.3750,54.4900],[24.3750,54.5000],[24.3750,54.5100],[24.3750,54.5200],[24.3750,54.5300]], depthCm: 60, widthM: 18 },
  // MBZ City N-S
  { coords: [[24.4000,54.4900],[24.3950,54.4900],[24.3900,54.4900],[24.3850,54.4900],[24.3800,54.4900],[24.3750,54.4900]], depthCm: 40, widthM: 15 },
  { coords: [[24.4000,54.5000],[24.3950,54.5000],[24.3900,54.5000],[24.3850,54.5000],[24.3800,54.5000],[24.3750,54.5000]], depthCm: 55, widthM: 18 },
  { coords: [[24.4000,54.5100],[24.3950,54.5100],[24.3900,54.5100],[24.3850,54.5100],[24.3800,54.5100],[24.3750,54.5100]], depthCm: 65, widthM: 22 },
  { coords: [[24.4000,54.5200],[24.3950,54.5200],[24.3900,54.5200],[24.3850,54.5200],[24.3800,54.5200],[24.3750,54.5200]], depthCm: 60, widthM: 18 },
  // Khalifa City A E-W
  { coords: [[24.4280,54.5700],[24.4280,54.5800],[24.4280,54.5900],[24.4280,54.6000],[24.4280,54.6100]], depthCm: 60, widthM: 20 },
  { coords: [[24.4230,54.5700],[24.4230,54.5800],[24.4230,54.5900],[24.4230,54.6000],[24.4230,54.6100]], depthCm: 75, widthM: 24 },
  { coords: [[24.4180,54.5700],[24.4180,54.5800],[24.4180,54.5900],[24.4180,54.6000],[24.4180,54.6100]], depthCm: 85, widthM: 26 },
  { coords: [[24.4130,54.5700],[24.4130,54.5800],[24.4130,54.5900],[24.4130,54.6000],[24.4130,54.6100]], depthCm: 80, widthM: 24 },
  // Khalifa City A N-S
  { coords: [[24.4280,54.5750],[24.4230,54.5750],[24.4180,54.5750],[24.4130,54.5750],[24.4080,54.5750]], depthCm: 55, widthM: 16 },
  { coords: [[24.4280,54.5850],[24.4230,54.5850],[24.4180,54.5850],[24.4130,54.5850],[24.4080,54.5850]], depthCm: 70, widthM: 20 },
  { coords: [[24.4280,54.5950],[24.4230,54.5950],[24.4180,54.5950],[24.4130,54.5950],[24.4080,54.5950]], depthCm: 80, widthM: 24 },
  // Mussafah industrial channels
  { coords: [[24.3780,54.4550],[24.3780,54.4650],[24.3780,54.4750],[24.3780,54.4850]], depthCm: 70, widthM: 28 },
  { coords: [[24.3720,54.4550],[24.3720,54.4650],[24.3720,54.4750],[24.3720,54.4850]], depthCm: 85, widthM: 32 },
  { coords: [[24.3660,54.4550],[24.3660,54.4650],[24.3660,54.4750],[24.3660,54.4850]], depthCm: 90, widthM: 32 },
  { coords: [[24.3780,54.4700],[24.3720,54.4700],[24.3660,54.4700],[24.3600,54.4700]], depthCm: 80, widthM: 28 },
  // Abu Dhabi Island — specific low streets only
  { coords: [[24.4560,54.3840],[24.4560,54.3900],[24.4560,54.3960]], depthCm: 45, widthM: 18 },
  { coords: [[24.4520,54.3840],[24.4520,54.3900],[24.4520,54.3960]], depthCm: 50, widthM: 20 },
  { coords: [[24.4560,54.3880],[24.4520,54.3880],[24.4480,54.3880]], depthCm: 48, widthM: 18 },
  // Al Rahba
  { coords: [[24.5050,54.5500],[24.5050,54.5600],[24.5050,54.5700],[24.5050,54.5800]], depthCm: 55, widthM: 20 },
  { coords: [[24.4980,54.5500],[24.4980,54.5600],[24.4980,54.5700],[24.4980,54.5800]], depthCm: 65, widthM: 24 },
  { coords: [[24.5050,54.5650],[24.4980,54.5650],[24.4910,54.5650]], depthCm: 60, widthM: 22 },
  // Shakhbout
  { coords: [[24.3450,54.5500],[24.3450,54.5600],[24.3450,54.5700],[24.3450,54.5800],[24.3450,54.5900]], depthCm: 55, widthM: 20 },
  { coords: [[24.3380,54.5500],[24.3380,54.5600],[24.3380,54.5700],[24.3380,54.5800],[24.3380,54.5900]], depthCm: 65, widthM: 24 },
  { coords: [[24.3450,54.5700],[24.3380,54.5700],[24.3310,54.5700]], depthCm: 70, widthM: 26 },
  // Al Wathba
  { coords: [[24.2800,54.5850],[24.2800,54.5950],[24.2800,54.6050],[24.2800,54.6150],[24.2800,54.6250]], depthCm: 65, widthM: 22 },
  { coords: [[24.2700,54.5850],[24.2700,54.5950],[24.2700,54.6050],[24.2700,54.6150],[24.2700,54.6250]], depthCm: 80, widthM: 28 },
  { coords: [[24.2800,54.6050],[24.2700,54.6050],[24.2600,54.6050]], depthCm: 75, widthM: 26 },
  // Baniyas
  { coords: [[24.4200,54.6200],[24.4200,54.6300],[24.4200,54.6400],[24.4200,54.6500]], depthCm: 60, widthM: 22 },
  { coords: [[24.4300,54.6200],[24.4300,54.6300],[24.4300,54.6400],[24.4300,54.6500]], depthCm: 70, widthM: 26 },
  { coords: [[24.4200,54.6350],[24.4300,54.6350],[24.4400,54.6350]], depthCm: 65, widthM: 24 },
  // Ghayathi — wadi channels (April 2024)
  { coords: [[23.8480,52.7950],[23.8480,52.8050],[23.8480,52.8150],[23.8480,52.8250]], depthCm: 95, widthM: 45 },
  { coords: [[23.8400,52.7950],[23.8400,52.8050],[23.8400,52.8150],[23.8400,52.8250]], depthCm: 110, widthM: 50 },
  { coords: [[23.8320,52.7950],[23.8320,52.8050],[23.8320,52.8150],[23.8320,52.8250]], depthCm: 130, widthM: 60 },
  { coords: [[23.8400,52.8100],[23.8320,52.8100],[23.8240,52.8100]], depthCm: 140, widthM: 65 },
  // Al Ain
  { coords: [[24.2250,55.7500],[24.2200,55.7500],[24.2150,55.7500],[24.2100,55.7500],[24.2050,55.7500]], depthCm: 55, widthM: 20 },
  { coords: [[24.2200,55.7400],[24.2200,55.7500],[24.2200,55.7600],[24.2200,55.7700]], depthCm: 65, widthM: 24 },
  // Al Shamkha / Zayed City
  { coords: [[24.3050,54.6200],[24.3050,54.6300],[24.3050,54.6400],[24.3050,54.6500]], depthCm: 55, widthM: 20 },
  { coords: [[24.2980,54.6200],[24.2980,54.6300],[24.2980,54.6400],[24.2980,54.6500]], depthCm: 65, widthM: 24 },
  { coords: [[24.3050,54.6350],[24.2980,54.6350],[24.2910,54.6350]], depthCm: 60, widthM: 22 },
  // Madinat Zayed
  { coords: [[23.7100,53.7200],[23.7100,53.7300],[23.7100,53.7400],[23.7100,53.7500]], depthCm: 70, widthM: 24 },
  { coords: [[23.7050,53.7200],[23.7050,53.7300],[23.7050,53.7400],[23.7050,53.7500]], depthCm: 80, widthM: 30 },
  { coords: [[23.7100,53.7350],[23.7050,53.7350],[23.7000,53.7350]], depthCm: 85, widthM: 32 },
  // Khalifa City B
  { coords: [[24.4050,54.6350],[24.4050,54.6450],[24.4050,54.6550],[24.4050,54.6650]], depthCm: 60, widthM: 20 },
  { coords: [[24.3980,54.6350],[24.3980,54.6450],[24.3980,54.6550],[24.3980,54.6650]], depthCm: 70, widthM: 24 },
  { coords: [[24.4050,54.6500],[24.3980,54.6500],[24.3910,54.6500]], depthCm: 65, widthM: 22 },
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

    // LAYER 1: Flood pool patches at known low points (zoom ≥ 10)
    if (zoom >= 10) {
      _renderFloodPools(ctx, map, zoom, bounds, multiplier);
    }

    // LAYER 2: Road-following flood channels (zoom ≥ 13)
    if (zoom >= 13) {
      _renderRoadFlood(ctx, map, zoom, bounds, multiplier);
    }

    // LAYER 3: Blob hotspots overview (zoom < 12)
    if (zoom < 12) {
      _renderBlobFlood(ctx, map, zoom, bounds, multiplier);
    }
  }

  /**
   * LAYER 1 (CORRECTED): Flood pools at low-lying areas only.
   *
   * Key changes from v3:
   * - High urban density zones are EXCLUDED from random grid patches
   * - Only FLOOD_ZONES (known low points) get patches in urban areas
   * - Desert/rural areas get random patches based on terrain height
   * - Threshold is INVERTED: high density = harder to flood randomly
   */
  function _renderFloodPools(
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

    if (zoom >= 16) {
      stepLat = 0.0012; stepLng = 0.0014;
      patchRadiusM = 60; baseDepthCm = 18;
    } else if (zoom >= 14) {
      stepLat = 0.0025; stepLng = 0.0028;
      patchRadiusM = 120; baseDepthCm = 22;
    } else if (zoom >= 12) {
      stepLat = 0.0060; stepLng = 0.0068;
      patchRadiusM = 280; baseDepthCm = 28;
    } else if (zoom >= 10) {
      stepLat = 0.0160; stepLng = 0.0180;
      patchRadiusM = 450; baseDepthCm = 35;
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

        // Skip points outside Abu Dhabi emirate boundary
        if (!isInsideAbuDhabi(pLat, pLng)) { lng += stepLng; continue; }

        const density = getUrbanDensity(pLat, pLng);

        // CRITICAL FIX: Skip high-density urban areas for random patches
        // Urban areas (density > 0.55) only flood at FLOOD_ZONES (specific low points)
        // This prevents entire districts from being uniformly shaded
        if (density > 0.55) { lng += stepLng; continue; }

        // Check zone boost — only render if near a known flood-prone low point
        const zoneBoost = getZoneBoost(pLat, pLng);

        // For low-density areas: use terrain height + threshold
        // For medium-density (0.3-0.55): require zone boost
        if (density > 0.30 && zoneBoost < 1.5) { lng += stepLng; continue; }

        const threshold = getFloodThreshold(pLat, pLng, multiplier);
        const h = terrainHeight(pLat, pLng);

        if (h < threshold) {
          const floodFraction = (threshold - h) / threshold;
          // Depth scales with: base × multiplier × flood fraction × zone boost
          // Desert areas get reduced depth at low zoom
          const zoomFactor = zoom <= 10 ? 0.5 : 0.8;
          const depthCm = baseDepthCm * multiplier * floodFraction * zoneBoost * zoomFactor;

          if (depthCm >= 3) {
            const [r, g, b, alpha] = depthToRgba(depthCm);
            if (alpha > 0.01) {
              const pt = map.latLngToContainerPoint([pLat, pLng]);
              const rpx = metersToPixels(patchRadiusM, pLat, zoom);
              if (rpx >= 1) {
                const rx = rpx * (1.0 + Math.sin(pLat * 211 + pLng * 317) * 0.22);
                const ry = rpx * (0.72 + Math.cos(pLat * 149 + pLng * 251) * 0.18);
                const angle = Math.sin(pLat * 97 + pLng * 131) * 0.5;

                ctx.save();
                ctx.translate(pt.x, pt.y);
                ctx.rotate(angle);
                ctx.scale(1, ry / rx);

                const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
                grad.addColorStop(0.00, `rgba(${r},${g},${b},${alpha.toFixed(3)})`);
                grad.addColorStop(0.45, `rgba(${r},${g},${b},${(alpha * 0.75).toFixed(3)})`);
                grad.addColorStop(0.72, `rgba(${r},${g},${b},${(alpha * 0.35).toFixed(3)})`);
                grad.addColorStop(0.90, `rgba(${r},${g},${b},${(alpha * 0.10).toFixed(3)})`);
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
   * LAYER 2: Road-following flood for known worst-hit road segments (zoom ≥ 13).
   * Roads act as channels — water flows ALONG them, not covering entire districts.
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

      // Outer glow (wide, transparent)
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(alpha * 0.25).toFixed(3)})`;
      ctx.lineWidth = widthPx * 2.0;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke();

      // Main flood fill (road width)
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(alpha * 0.72).toFixed(3)})`;
      ctx.lineWidth = widthPx;
      ctx.stroke();

      // Deep channel center
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(alpha * 0.38).toFixed(3)})`;
      ctx.lineWidth = widthPx * 0.35;
      ctx.stroke();

      // Intersection pools (where roads cross = deeper water)
      pts.forEach((pt, i) => {
        if (i === 0 || i === pts.length - 1) return;
        const poolR = widthPx * 0.9;
        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, poolR);
        grad.addColorStop(0, `rgba(${r},${g},${b},${(alpha * 0.80).toFixed(3)})`);
        grad.addColorStop(0.5, `rgba(${r},${g},${b},${(alpha * 0.45).toFixed(3)})`);
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
   * Draw an irregular blob for overview zoom levels
   */
  function _drawIrregularBlob(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    rx: number, ry: number,
    r: number, g: number, b: number, alpha: number,
    seed: number
  ) {
    const N = 14;
    const pts: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const jitter = 0.70 + 0.30 * Math.abs(Math.sin(seed * 13.7 + i * 2.39));
      const vx = Math.cos(angle) * rx * jitter;
      const vy = Math.sin(angle) * ry * jitter;
      pts.push([vx, vy]);
    }
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
      if (!isInsideAbuDhabi(hs.lat, hs.lng)) return;
      const effectiveDepth = hs.baseDepth * multiplier * hs.intensity;
      if (effectiveDepth < 3) return;
      const pt = map.latLngToContainerPoint([hs.lat, hs.lng]);
      const rpx = metersToPixels(hs.radius, hs.lat, zoom);
      if (rpx < 2) return;
      const [r, g, b, alpha] = depthToRgba(effectiveDepth);
      const rx = rpx * (1.05 + Math.sin(hs.lat * 211 + hs.lng * 317) * 0.20);
      const ry = rpx * (0.80 + Math.cos(hs.lat * 149 + hs.lng * 251) * 0.18);
      const seed = hs.lat * 1000 + hs.lng;
      _drawIrregularBlob(ctx, pt.x, pt.y, rx, ry, r, g, b, alpha, seed);
    });
  }

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
