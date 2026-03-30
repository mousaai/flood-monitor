/**
 * FloodWaterLayer — FastFlood Global style v5
 *
 * DESIGN GOAL: Match FastFlood Global appearance exactly:
 *   • Light-blue translucent water patches flowing ALONG streets
 *   • Deeper blue pools collecting at intersections and low-lying areas
 *   • NO large circular blobs, NO colored frames, NO outlines
 *   • Identical rendering for LIVE and HISTORICAL modes
 *   • Precise street-level detail at zoom ≥ 12
 *   • Subtle area coverage at lower zoom levels
 *
 * COLOR SCALE (FastFlood-matched):
 *   0 cm   → transparent
 *   10 cm  → rgba(147,210,255, 0.25)  very light sky blue
 *   25 cm  → rgba(100,180,255, 0.40)  light blue
 *   50 cm  → rgba( 55,140,240, 0.55)  medium blue
 *   100 cm → rgba( 20, 90,210, 0.68)  deep blue
 *   200 cm → rgba(  8, 50,160, 0.78)  dark blue
 *   500 cm → rgba(  2, 20, 90, 0.85)  navy
 */

import L from 'leaflet';
import { isInsideAbuDhabi, getUrbanDensity } from '@/data/abuDhabiBoundary';
import { REGION_HYDROLOGY } from '@/data/abuDhabiHydrology';

// ── Real terrain lookup from DEM data ─────────────────────────────────────────
// Each region has a known elevation and slope. We use these to bias the
// terrain function: low-elevation flat areas get lower terrain values
// (more flood-prone), high-elevation or steep areas get higher values.
//
// Terrain value 0.0 = very flood-prone (low, flat, sealed)
// Terrain value 1.0 = very dry (high, steep, sandy)
//
// Structure: [minLat, maxLat, minLng, maxLng, regionId]
const TERRAIN_REGIONS: [number, number, number, number, string][] = [
  // Abu Dhabi Island (2–5m, flat, paved)
  [24.430, 24.520, 54.300, 54.460, 'Abu Dhabi Island'],
  [24.455, 24.475, 54.330, 54.360, 'Al Bateen'],
  [24.455, 24.475, 54.360, 54.390, 'Al Manhal'],
  [24.460, 24.485, 54.345, 54.375, 'Al Khalidiyah'],
  [24.460, 24.485, 54.370, 54.400, 'Al Zaab'],
  [24.460, 24.485, 54.395, 54.425, 'Al Muroor'],
  [24.470, 24.500, 54.370, 54.405, 'Al Mushrif'],
  [24.480, 24.505, 54.355, 54.390, 'Tourist Club Area'],
  [24.440, 24.465, 54.355, 54.395, 'Downtown Abu Dhabi'],
  // Mussafah (1–3m, flat, industrial — VERY flood-prone)
  [24.330, 24.420, 54.430, 54.540, 'Mussafah'],
  [24.340, 24.380, 54.435, 54.480, 'Mussafah Industrial'],
  [24.380, 24.415, 54.460, 54.520, 'Mussafah Residential'],
  // KIZAD (1–2m, flat, industrial)
  [24.265, 24.335, 54.395, 54.470, 'KIZAD'],
  [24.270, 24.320, 54.400, 54.455, 'KIZAD Industrial'],
  // MBZ City
  [24.355, 24.400, 54.490, 54.560, 'Mohammed Bin Zayed City'],
  // Khalifa City
  [24.395, 24.445, 54.555, 54.625, 'Khalifa City A'],
  [24.420, 24.455, 54.595, 54.655, 'Khalifa City B'],
  // Al Raha / Yas
  [24.460, 24.510, 54.580, 54.650, 'Yas Island'],
  [24.440, 24.480, 54.540, 54.590, 'Al Raha Beach'],
  // Al Maqta (very low, bridge area)
  [24.475, 24.515, 54.415, 54.475, 'Al Maqta'],
  // Al Wathba (natural basin, very low)
  [24.200, 24.280, 54.720, 54.840, 'Al Wathba'],
  // Al Shamkha (flat, poor drainage)
  [24.312, 24.415, 54.580, 54.720, 'Al Shamkha'],
  // Sweihan Road corridor
  [24.195, 24.310, 54.620, 54.750, 'Sweihan Road'],
  // Al Falah
  [24.195, 24.255, 54.540, 54.620, 'Al Falah'],
  // Baniyas
  [24.420, 24.480, 54.620, 54.700, 'Baniyas'],
  // Zayed City
  [24.310, 24.380, 54.540, 54.620, 'Zayed City'],
  // Al Rahba / Shahama
  [24.490, 24.545, 54.600, 54.680, 'Al Rahba'],
  // ICAD
  [24.200, 24.280, 54.440, 54.540, 'ICAD'],
  // Al Ain
  [24.190, 24.260, 55.720, 55.790, 'Al Ain City'],
  // Ruwais
  [24.095, 24.125, 52.710, 52.750, 'Ruwais'],
  // Al Dhafra / Liwa
  [23.100, 23.150, 53.600, 53.650, 'Liwa'],
  // Madinat Zayed
  [23.680, 23.710, 53.690, 53.720, 'Madinat Zayed'],
  // Ghayathi (wadi-prone)
  [23.830, 23.860, 52.790, 52.820, 'Ghayathi'],
];

// Cache for terrain region lookups
const _terrainCache = new Map<string, number>();

function getRegionTerrainValue(lat: number, lng: number): number {
  // Find the most specific region containing this point
  let best: string | null = null;
  let bestArea = Infinity;
  for (const [minLat, maxLat, minLng, maxLng, id] of TERRAIN_REGIONS) {
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      const area = (maxLat - minLat) * (maxLng - minLng);
      if (area < bestArea) { bestArea = area; best = id; }
    }
  }
  if (!best) return -1; // not in any known region
  const h = REGION_HYDROLOGY[best];
  if (!h) return -1;
  // Convert elevation + slope to terrain value (0=flood-prone, 1=dry)
  // Normalize elevation: 0m → 0.0, 300m → 1.0
  const elevNorm = Math.min(1.0, h.elevationM / 300.0);
  // Slope contribution: flat (0) → flood-prone, steep (0.15+) → dry
  const slopeNorm = Math.min(1.0, h.slopeIndex / 0.15);
  // Runoff coefficient: high runoff → more flood-prone
  const runoffPenalty = (h.runoffCoeff - 0.5) * 0.4;
  // Combined terrain value
  const terrainVal = elevNorm * 0.50 + slopeNorm * 0.30 - runoffPenalty * 0.20;
  return Math.max(0.0, Math.min(1.0, terrainVal));
}

export interface FloodHotspot {
  lat: number; lng: number;
  radius: number; baseDepth: number; intensity: number;
}

export interface FloodWaterLayerInstance {
  update: (precipMultiplier: number, lang?: 'ar' | 'en') => void;
  remove: () => void;
}

// ── FastFlood depth → RGBA ────────────────────────────────────────────────────
const STOPS = [
  { d:   0, r: 147, g: 210, b: 255, a: 0.00 },
  { d:  10, r: 147, g: 210, b: 255, a: 0.35 },
  { d:  25, r: 100, g: 180, b: 255, a: 0.52 },
  { d:  50, r:  55, g: 140, b: 240, a: 0.65 },
  { d: 100, r:  20, g:  90, b: 210, a: 0.76 },
  { d: 200, r:   8, g:  50, b: 160, a: 0.84 },
  { d: 500, r:   2, g:  20, b:  90, a: 0.90 },
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

function m2px(meters: number, lat: number, zoom: number): number {
  const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
  return meters / mpp;
}

// ── Hybrid terrain: real DEM data + micro-variation for natural look ─────────
// Returns 0.0 (very flood-prone) to 1.0 (very dry)
// - Known regions: use real elevation, slope, runoff data
// - Unknown areas: use pseudo-random but biased toward Abu Dhabi's flat terrain
function terrain(lat: number, lng: number): number {
  // Try real DEM lookup first
  const realVal = getRegionTerrainValue(lat, lng);
  if (realVal >= 0) {
    // Add small micro-variation (±8%) for natural-looking patches
    // This prevents perfectly uniform flooding within a region
    const micro = (Math.sin(lat * 521.1 + lng * 317.7) * 0.5 + 0.5) * 0.08;
    return Math.max(0.0, Math.min(1.0, realVal + micro - 0.04));
  }
  // Fallback for areas outside known regions (desert, sea, etc.)
  // Abu Dhabi is generally flat (2-10m) so bias toward flood-prone
  const h1 = Math.sin(lat * 317.4 + lng * 211.7) * 0.5 + 0.5;
  const h2 = Math.sin(lat *  89.3 - lng * 143.1) * 0.5 + 0.5;
  const h3 = Math.sin(lat * 521.1 + lng *  67.9) * 0.5 + 0.5;
  const h4 = Math.cos(lat * 173.6 - lng * 389.2) * 0.5 + 0.5;
  // Bias toward lower values (more flood-prone) for desert areas
  return (h1 * 0.35 + h2 * 0.30 + h3 * 0.20 + h4 * 0.15) * 0.75;
}

// ── Known flood-prone low points ─────────────────────────────────────────────
interface FZ { lat: number; lng: number; r: number; boost: number; }
const FLOOD_ZONES: FZ[] = [
  { lat: 24.385, lng: 54.505, r: 0.022, boost: 4.0 },
  { lat: 24.390, lng: 54.510, r: 0.018, boost: 4.2 },
  { lat: 24.380, lng: 54.500, r: 0.016, boost: 3.8 },
  { lat: 24.420, lng: 54.590, r: 0.020, boost: 3.5 },
  { lat: 24.415, lng: 54.600, r: 0.016, boost: 3.8 },
  { lat: 24.408, lng: 54.595, r: 0.014, boost: 3.6 },
  { lat: 24.425, lng: 54.585, r: 0.012, boost: 3.2 },
  { lat: 24.370, lng: 54.470, r: 0.018, boost: 3.5 },
  { lat: 24.360, lng: 54.480, r: 0.016, boost: 3.2 },
  { lat: 24.395, lng: 54.505, r: 0.020, boost: 3.0 },
  { lat: 24.388, lng: 54.515, r: 0.018, boost: 3.2 },
  { lat: 24.375, lng: 54.490, r: 0.014, boost: 2.8 },
  { lat: 24.382, lng: 54.498, r: 0.012, boost: 3.0 },
  { lat: 24.340, lng: 54.575, r: 0.028, boost: 3.0 },
  { lat: 24.270, lng: 54.610, r: 0.032, boost: 3.2 },
  { lat: 24.300, lng: 54.590, r: 0.022, boost: 2.8 },
  { lat: 24.420, lng: 54.640, r: 0.022, boost: 3.0 },
  { lat: 24.430, lng: 54.650, r: 0.018, boost: 2.8 },
  { lat: 24.410, lng: 54.635, r: 0.016, boost: 2.6 },
  { lat: 23.820, lng: 52.800, r: 0.038, boost: 5.0 },
  { lat: 23.835, lng: 52.805, r: 0.032, boost: 5.2 },
  { lat: 23.825, lng: 52.815, r: 0.028, boost: 4.8 },
  { lat: 23.828, lng: 52.798, r: 0.020, boost: 4.5 },
  { lat: 24.215, lng: 55.750, r: 0.022, boost: 2.8 },
  { lat: 24.205, lng: 55.760, r: 0.018, boost: 2.6 },
  // Abu Dhabi Island — documented flood zones April 2024
  { lat: 24.4650, lng: 54.3600, r: 0.018, boost: 3.5 }, // Al Khalidiyah underpass
  { lat: 24.4520, lng: 54.3680, r: 0.015, boost: 3.2 }, // Al Manhal low point
  { lat: 24.4720, lng: 54.3850, r: 0.020, boost: 3.0 }, // Al Mushrif depression
  { lat: 24.4580, lng: 54.3420, r: 0.016, boost: 2.8 }, // Al Bateen coastal
  { lat: 24.4680, lng: 54.3780, r: 0.022, boost: 3.4 }, // Al Muroor road basin
  { lat: 24.4600, lng: 54.3720, r: 0.012, boost: 3.2 }, // Al Zaab intersection
  { lat: 24.4900, lng: 54.3700, r: 0.016, boost: 2.8 }, // Tourist Club area
  { lat: 24.4750, lng: 54.3950, r: 0.020, boost: 3.0 }, // Al Nahyan camp drain
  { lat: 24.4700, lng: 54.3650, r: 0.018, boost: 3.2 }, // Central Abu Dhabi low
  { lat: 24.4630, lng: 54.3550, r: 0.014, boost: 2.9 }, // Al Khalidiyah west
  { lat: 24.4800, lng: 54.3800, r: 0.020, boost: 2.8 }, // Al Karamah area
  { lat: 24.4550, lng: 54.3750, r: 0.016, boost: 3.0 }, // Downtown low
  { lat: 24.4850, lng: 54.3650, r: 0.018, boost: 2.7 }, // Al Corniche low
  { lat: 24.455, lng: 54.380, r: 0.010, boost: 2.2 },
  { lat: 24.450, lng: 54.390, r: 0.008, boost: 2.4 },
  { lat: 24.500, lng: 54.560, r: 0.022, boost: 2.8 },
  { lat: 24.510, lng: 54.570, r: 0.018, boost: 3.0 },
  { lat: 24.340, lng: 54.580, r: 0.022, boost: 2.6 },
  { lat: 24.332, lng: 54.572, r: 0.016, boost: 2.4 },
  { lat: 24.370, lng: 54.465, r: 0.028, boost: 3.5 },
  { lat: 24.360, lng: 54.455, r: 0.022, boost: 3.2 },
  { lat: 24.355, lng: 54.462, r: 0.018, boost: 3.0 },
  { lat: 23.705, lng: 53.730, r: 0.022, boost: 3.0 },
  { lat: 23.710, lng: 53.740, r: 0.018, boost: 3.2 },
  { lat: 24.400, lng: 54.660, r: 0.020, boost: 2.8 },
  { lat: 24.392, lng: 54.655, r: 0.016, boost: 2.6 },
  { lat: 24.300, lng: 54.630, r: 0.028, boost: 2.8 },
  { lat: 24.310, lng: 54.640, r: 0.022, boost: 2.6 },
  { lat: 24.110, lng: 52.730, r: 0.025, boost: 2.8 },
  { lat: 24.105, lng: 52.720, r: 0.020, boost: 2.6 },

  // ── KIZAD / Khalifa Industrial Zone (كيزاد) ──────────────────────────────
  { lat: 24.300, lng: 54.430, r: 0.035, boost: 4.5 }, // KIZAD main basin
  { lat: 24.295, lng: 54.420, r: 0.028, boost: 4.2 }, // KIZAD west
  { lat: 24.310, lng: 54.440, r: 0.025, boost: 4.0 }, // KIZAD north
  { lat: 24.285, lng: 54.435, r: 0.022, boost: 3.8 }, // KIZAD south
  { lat: 24.305, lng: 54.450, r: 0.020, boost: 3.6 }, // KIZAD east
  { lat: 24.290, lng: 54.415, r: 0.018, boost: 3.5 }, // KIZAD port area
  { lat: 24.315, lng: 54.425, r: 0.022, boost: 4.0 }, // KIZAD industrial
  { lat: 24.280, lng: 54.445, r: 0.018, boost: 3.8 }, // KIZAD SE

  // ── Khalifa City A / B / C (خليفة سيتي) ─────────────────────────────────
  { lat: 24.415, lng: 54.590, r: 0.030, boost: 4.2 }, // Khalifa City A main
  { lat: 24.408, lng: 54.580, r: 0.025, boost: 4.0 }, // Khalifa City A west
  { lat: 24.422, lng: 54.600, r: 0.022, boost: 3.8 }, // Khalifa City A east
  { lat: 24.430, lng: 54.610, r: 0.020, boost: 3.5 }, // Khalifa City B
  { lat: 24.435, lng: 54.620, r: 0.018, boost: 3.2 }, // Khalifa City B north
  { lat: 24.440, lng: 54.630, r: 0.016, boost: 3.0 }, // Khalifa City C
  { lat: 24.402, lng: 54.575, r: 0.018, boost: 3.8 }, // Khalifa City A south

  // ── Zayed City / MBZ City (مدينة زايد / محمد بن زايد) ───────────────────
  { lat: 24.350, lng: 54.620, r: 0.032, boost: 4.0 }, // Zayed City main
  { lat: 24.342, lng: 54.610, r: 0.026, boost: 3.8 }, // Zayed City west
  { lat: 24.358, lng: 54.630, r: 0.022, boost: 3.6 }, // Zayed City east
  { lat: 24.365, lng: 54.640, r: 0.020, boost: 3.4 }, // MBZ City north
  { lat: 24.338, lng: 54.600, r: 0.018, boost: 3.5 }, // Zayed City south
  { lat: 24.372, lng: 54.650, r: 0.022, boost: 3.2 }, // MBZ City main
  { lat: 24.380, lng: 54.660, r: 0.018, boost: 3.0 }, // MBZ City east

  // ── Al Shamkha (الشامخة) ─────────────────────────────────────────────────
  { lat: 24.330, lng: 54.540, r: 0.030, boost: 4.0 }, // Al Shamkha main basin
  { lat: 24.320, lng: 54.530, r: 0.025, boost: 3.8 }, // Al Shamkha west
  { lat: 24.338, lng: 54.550, r: 0.022, boost: 3.6 }, // Al Shamkha east
  { lat: 24.312, lng: 54.520, r: 0.020, boost: 3.5 }, // Al Shamkha south
  { lat: 24.345, lng: 54.558, r: 0.018, boost: 3.2 }, // Al Shamkha north

  // ── Baniyas (بني ياس) ────────────────────────────────────────────────────
  { lat: 24.320, lng: 54.640, r: 0.028, boost: 3.8 }, // Baniyas main
  { lat: 24.312, lng: 54.630, r: 0.022, boost: 3.6 }, // Baniyas west
  { lat: 24.328, lng: 54.650, r: 0.020, boost: 3.4 }, // Baniyas east
  { lat: 24.305, lng: 54.620, r: 0.018, boost: 3.2 }, // Baniyas south
  { lat: 24.335, lng: 54.658, r: 0.016, boost: 3.0 }, // Baniyas north

  // ── Al Rahba (الرحبة) ────────────────────────────────────────────────────
  { lat: 24.505, lng: 54.580, r: 0.028, boost: 3.8 }, // Al Rahba main
  { lat: 24.498, lng: 54.570, r: 0.022, boost: 3.6 }, // Al Rahba west
  { lat: 24.512, lng: 54.590, r: 0.020, boost: 3.4 }, // Al Rahba east
  { lat: 24.490, lng: 54.560, r: 0.018, boost: 3.2 }, // Al Rahba south
  { lat: 24.520, lng: 54.598, r: 0.016, boost: 3.0 }, // Al Rahba north

  // ── Al Wathba (الوثبة) ───────────────────────────────────────────────────
  { lat: 24.268, lng: 54.610, r: 0.035, boost: 4.2 }, // Al Wathba lake area
  { lat: 24.258, lng: 54.600, r: 0.028, boost: 4.0 }, // Al Wathba west
  { lat: 24.278, lng: 54.620, r: 0.025, boost: 3.8 }, // Al Wathba east
  { lat: 24.248, lng: 54.590, r: 0.022, boost: 3.6 }, // Al Wathba south
  { lat: 24.288, lng: 54.630, r: 0.020, boost: 3.4 }, // Al Wathba north

  // ── Al Falah / Ghayathi area (الفلاح / غياثي) ───────────────────────────
  { lat: 24.230, lng: 54.580, r: 0.030, boost: 3.8 }, // Al Falah main
  { lat: 24.220, lng: 54.570, r: 0.025, boost: 3.6 }, // Al Falah west
  { lat: 24.240, lng: 54.590, r: 0.022, boost: 3.4 }, // Al Falah east

  // ── Madinat Zayed (مدينة زايد الغربية) ──────────────────────────────────
  { lat: 23.695, lng: 53.705, r: 0.032, boost: 3.8 }, // Madinat Zayed main
  { lat: 23.688, lng: 53.695, r: 0.025, boost: 3.6 }, // Madinat Zayed west
  { lat: 23.702, lng: 53.715, r: 0.022, boost: 3.4 }, // Madinat Zayed east

  // ── Al Ain flood zones (العين) ───────────────────────────────────────────
  { lat: 24.218, lng: 55.748, r: 0.028, boost: 3.5 }, // Al Ain main wadi
  { lat: 24.208, lng: 55.738, r: 0.022, boost: 3.3 }, // Al Ain west
  { lat: 24.228, lng: 55.758, r: 0.020, boost: 3.1 }, // Al Ain east
  { lat: 24.195, lng: 55.728, r: 0.018, boost: 3.0 }, // Al Ain south wadi
  { lat: 24.238, lng: 55.768, r: 0.016, boost: 2.8 }, // Al Ain north

  // ── Al Bateen / Al Muntazah (4 Critical Hotspots — Municipality Register) ────
  { lat: 24.427, lng: 54.471, r: 0.030, boost: 4.5 }, // Khalifa Park Area — Critical
  { lat: 24.427, lng: 54.445, r: 0.028, boost: 4.5 }, // Air Force Roundabout / Al Muntazah — Critical
  { lat: 24.428, lng: 54.450, r: 0.025, boost: 4.3 }, // Al Bateen low point — Critical
  { lat: 24.438, lng: 54.464, r: 0.022, boost: 4.0 }, // Qasr Al Mina / Al Jamayel — Critical
  { lat: 24.404, lng: 54.477, r: 0.020, boost: 3.8 }, // Officers Club Park — no network

  // ── Al Shahama East / Al Falah outer (9 hotspots — no drainage network) ────
  { lat: 24.428, lng: 54.742, r: 0.030, boost: 3.5 }, // Al Falah outer east
  { lat: 24.419, lng: 54.753, r: 0.025, boost: 3.2 }, // Opposite Al Falah
  { lat: 24.427, lng: 54.756, r: 0.022, boost: 3.0 }, // Al Thawb Street
  { lat: 24.461, lng: 54.716, r: 0.022, boost: 3.0 }, // Al Kawthar Street
  { lat: 24.387, lng: 54.724, r: 0.020, boost: 2.8 }, // Al Shamekha Makani Mall
  { lat: 24.400, lng: 54.734, r: 0.020, boost: 2.8 }, // Al Shamekha Mall parking
  { lat: 24.378, lng: 54.770, r: 0.025, boost: 3.5 }, // Al Riyadh Al Metlaa — Critical

  // ── Al Shahama Tunnel / Al Reef area ─────────────────────────────────────
  { lat: 24.538, lng: 54.685, r: 0.030, boost: 3.8 }, // Shahama Tunnel — Critical
  { lat: 24.483, lng: 54.648, r: 0.022, boost: 3.0 }, // Yas Bridges Complex
  { lat: 24.555, lng: 54.694, r: 0.020, boost: 2.8 }, // Bani Yas Cooperative

  // ── Al Adla / Wathba East (no drainage) ──────────────────────────────────
  { lat: 24.411, lng: 54.870, r: 0.028, boost: 3.0 }, // Al Adla area
  { lat: 24.419, lng: 54.866, r: 0.022, boost: 2.8 }, // Armed Forces Cooperative

  // ── Khalifa Industrial City / Al Samha (no drainage) ─────────────────────
  { lat: 24.672, lng: 54.761, r: 0.030, boost: 3.0 }, // Al Samha
  { lat: 24.683, lng: 54.767, r: 0.025, boost: 2.8 }, // Khalifa Industrial City 1
  { lat: 24.690, lng: 54.777, r: 0.025, boost: 2.8 }, // Khalifa Industrial City 2
  { lat: 24.695, lng: 54.781, r: 0.022, boost: 2.8 }, // Khalifa Industrial City 3

  // ── Ghantoot (far north — no drainage) ───────────────────────────────────
  { lat: 24.854, lng: 54.900, r: 0.035, boost: 3.2 }, // Ghantoot inbound
  { lat: 24.854, lng: 54.900, r: 0.030, boost: 3.0 }, // Ghantoot outbound

  // ── Al Khatim / Al Khatem (far east — no drainage) ───────────────────────
  { lat: 24.183, lng: 54.993, r: 0.030, boost: 3.0 }, // Al Khatim school area

  // ── Khalifa City Al Murayf (Critical) ─────────────────────────────────────
  { lat: 24.425, lng: 54.546, r: 0.028, boost: 4.0 }, // Al Murayf / Al Maqasid — Critical

  // ── Al Dhafra / Liwa area (الظفرة / ليوا) ───────────────────────────────
  { lat: 23.120, lng: 53.620, r: 0.040, boost: 3.5 }, // Liwa oasis basin
  { lat: 23.110, lng: 53.610, r: 0.030, boost: 3.2 }, // Liwa west
  { lat: 23.130, lng: 53.630, r: 0.025, boost: 3.0 }, // Liwa east

  // ── Ruwais (الرويس) ──────────────────────────────────────────────────────
  { lat: 24.108, lng: 52.728, r: 0.030, boost: 3.5 }, // Ruwais main
  { lat: 24.100, lng: 52.718, r: 0.025, boost: 3.2 }, // Ruwais west
  { lat: 24.116, lng: 52.738, r: 0.022, boost: 3.0 }, // Ruwais east

  // ── Musaffah (مصفح) — additional points ─────────────────────────────────
  { lat: 24.365, lng: 54.462, r: 0.025, boost: 4.5 }, // Mussafah industrial NW
  { lat: 24.355, lng: 54.452, r: 0.020, boost: 4.2 }, // Mussafah channel
  { lat: 24.375, lng: 54.472, r: 0.022, boost: 4.0 }, // Mussafah NE
  { lat: 24.345, lng: 54.445, r: 0.018, boost: 3.8 }, // Mussafah SW
  { lat: 24.385, lng: 54.480, r: 0.020, boost: 3.6 }, // Mussafah SE

  // ── Sweihan Road Corridor / Al Shamkha South / Al Falah North ─────────────
  // تقاطع شارع سويحان مع نهاية الشامخة والفلاح — منطقة تجمع مياه حقيقية أبريل 2024
  { lat: 24.248, lng: 54.660, r: 0.038, boost: 5.0 }, // Sweihan Rd main basin
  { lat: 24.238, lng: 54.650, r: 0.032, boost: 4.8 }, // Sweihan Rd west
  { lat: 24.258, lng: 54.670, r: 0.030, boost: 4.6 }, // Sweihan Rd east
  { lat: 24.228, lng: 54.640, r: 0.028, boost: 4.4 }, // Al Falah N junction
  { lat: 24.268, lng: 54.680, r: 0.026, boost: 4.2 }, // Sweihan Rd north
  { lat: 24.218, lng: 54.630, r: 0.025, boost: 4.0 }, // Al Falah N main
  { lat: 24.278, lng: 54.690, r: 0.022, boost: 3.8 }, // Sweihan Rd far north
  { lat: 24.208, lng: 54.620, r: 0.020, boost: 3.6 }, // Al Falah N south
  { lat: 24.248, lng: 54.700, r: 0.030, boost: 4.5 }, // Sweihan Rd E basin
  { lat: 24.238, lng: 54.710, r: 0.025, boost: 4.2 }, // Sweihan Rd E2
  { lat: 24.258, lng: 54.720, r: 0.022, boost: 4.0 }, // Sweihan Rd E3
  { lat: 24.228, lng: 54.730, r: 0.020, boost: 3.8 }, // Sweihan Rd SE
  // Al Shamkha South — lower extension
  { lat: 24.295, lng: 54.660, r: 0.030, boost: 4.0 }, // Shamkha S main
  { lat: 24.285, lng: 54.650, r: 0.025, boost: 3.8 }, // Shamkha S west
  { lat: 24.305, lng: 54.670, r: 0.022, boost: 3.6 }, // Shamkha S east
  { lat: 24.275, lng: 54.640, r: 0.020, boost: 3.5 }, // Shamkha S far west
  { lat: 24.315, lng: 54.680, r: 0.018, boost: 3.4 }, // Shamkha S far east
  // Al Falah Central
  { lat: 24.215, lng: 54.570, r: 0.028, boost: 3.8 }, // Al Falah central
  { lat: 24.205, lng: 54.560, r: 0.022, boost: 3.6 }, // Al Falah west
  { lat: 24.225, lng: 54.580, r: 0.020, boost: 3.4 }, // Al Falah east
  { lat: 24.195, lng: 54.550, r: 0.018, boost: 3.2 }, // Al Falah SW
  { lat: 24.235, lng: 54.590, r: 0.016, boost: 3.0 }, // Al Falah NE
];

function zoneBoost(lat: number, lng: number): number {
  let max = 1.0;
  for (const z of FLOOD_ZONES) {
    const d = Math.sqrt((lat - z.lat) ** 2 + (lng - z.lng) ** 2);
    if (d < z.r) {
      const t = 1 - d / z.r;
      const b = 1.0 + (z.boost - 1.0) * t * t;
      if (b > max) max = b;
    }
  }
  return max;
}

// ── Street segments (FastFlood-style channels) ────────────────────────────────
interface Seg { pts: [number, number][]; d: number; w: number; }
const SEGS: Seg[] = [
  { pts: [[24.3950,54.4800],[24.3950,54.4900],[24.3950,54.5000],[24.3950,54.5100],[24.3950,54.5200],[24.3950,54.5300]], d: 45, w: 14 },
  { pts: [[24.3900,54.4800],[24.3900,54.4900],[24.3900,54.5000],[24.3900,54.5100],[24.3900,54.5200],[24.3900,54.5300]], d: 60, w: 16 },
  { pts: [[24.3850,54.4800],[24.3850,54.4900],[24.3850,54.5000],[24.3850,54.5100],[24.3850,54.5200],[24.3850,54.5300]], d: 70, w: 18 },
  { pts: [[24.3800,54.4800],[24.3800,54.4900],[24.3800,54.5000],[24.3800,54.5100],[24.3800,54.5200],[24.3800,54.5300]], d: 75, w: 18 },
  { pts: [[24.3750,54.4800],[24.3750,54.4900],[24.3750,54.5000],[24.3750,54.5100],[24.3750,54.5200],[24.3750,54.5300]], d: 65, w: 14 },
  { pts: [[24.4000,54.4900],[24.3950,54.4900],[24.3900,54.4900],[24.3850,54.4900],[24.3800,54.4900],[24.3750,54.4900]], d: 40, w: 12 },
  { pts: [[24.4000,54.5000],[24.3950,54.5000],[24.3900,54.5000],[24.3850,54.5000],[24.3800,54.5000],[24.3750,54.5000]], d: 55, w: 14 },
  { pts: [[24.4000,54.5100],[24.3950,54.5100],[24.3900,54.5100],[24.3850,54.5100],[24.3800,54.5100],[24.3750,54.5100]], d: 68, w: 16 },
  { pts: [[24.4000,54.5200],[24.3950,54.5200],[24.3900,54.5200],[24.3850,54.5200],[24.3800,54.5200],[24.3750,54.5200]], d: 62, w: 14 },
  { pts: [[24.4280,54.5700],[24.4280,54.5800],[24.4280,54.5900],[24.4280,54.6000],[24.4280,54.6100]], d: 55, w: 14 },
  { pts: [[24.4230,54.5700],[24.4230,54.5800],[24.4230,54.5900],[24.4230,54.6000],[24.4230,54.6100]], d: 72, w: 16 },
  { pts: [[24.4180,54.5700],[24.4180,54.5800],[24.4180,54.5900],[24.4180,54.6000],[24.4180,54.6100]], d: 88, w: 18 },
  { pts: [[24.4130,54.5700],[24.4130,54.5800],[24.4130,54.5900],[24.4130,54.6000],[24.4130,54.6100]], d: 82, w: 16 },
  { pts: [[24.4080,54.5700],[24.4080,54.5800],[24.4080,54.5900],[24.4080,54.6000],[24.4080,54.6100]], d: 68, w: 14 },
  { pts: [[24.4280,54.5750],[24.4230,54.5750],[24.4180,54.5750],[24.4130,54.5750],[24.4080,54.5750]], d: 50, w: 12 },
  { pts: [[24.4280,54.5850],[24.4230,54.5850],[24.4180,54.5850],[24.4130,54.5850],[24.4080,54.5850]], d: 65, w: 14 },
  { pts: [[24.4280,54.5950],[24.4230,54.5950],[24.4180,54.5950],[24.4130,54.5950],[24.4080,54.5950]], d: 78, w: 16 },
  { pts: [[24.4280,54.6050],[24.4230,54.6050],[24.4180,54.6050],[24.4130,54.6050],[24.4080,54.6050]], d: 70, w: 14 },
  { pts: [[24.3780,54.4550],[24.3780,54.4650],[24.3780,54.4750],[24.3780,54.4850]], d: 72, w: 22 },
  { pts: [[24.3720,54.4550],[24.3720,54.4650],[24.3720,54.4750],[24.3720,54.4850]], d: 88, w: 26 },
  { pts: [[24.3660,54.4550],[24.3660,54.4650],[24.3660,54.4750],[24.3660,54.4850]], d: 95, w: 28 },
  { pts: [[24.3780,54.4700],[24.3720,54.4700],[24.3660,54.4700],[24.3600,54.4700]], d: 82, w: 24 },
  { pts: [[24.3780,54.4600],[24.3720,54.4600],[24.3660,54.4600],[24.3600,54.4600]], d: 75, w: 20 },
  { pts: [[24.3600,54.4550],[24.3600,54.4650],[24.3600,54.4750],[24.3600,54.4850]], d: 80, w: 22 },
  { pts: [[24.4560,54.3840],[24.4560,54.3900],[24.4560,54.3960]], d: 42, w: 14 },
  { pts: [[24.4520,54.3840],[24.4520,54.3900],[24.4520,54.3960]], d: 48, w: 16 },
  { pts: [[24.4560,54.3880],[24.4520,54.3880],[24.4480,54.3880]], d: 45, w: 14 },
  { pts: [[24.4540,54.3860],[24.4540,54.3920],[24.4540,54.3980]], d: 40, w: 12 },
  { pts: [[24.5050,54.5500],[24.5050,54.5600],[24.5050,54.5700],[24.5050,54.5800]], d: 52, w: 14 },
  { pts: [[24.4980,54.5500],[24.4980,54.5600],[24.4980,54.5700],[24.4980,54.5800]], d: 65, w: 16 },
  { pts: [[24.5050,54.5650],[24.4980,54.5650],[24.4910,54.5650]], d: 58, w: 14 },
  { pts: [[24.4910,54.5500],[24.4910,54.5600],[24.4910,54.5700],[24.4910,54.5800]], d: 48, w: 12 },
  { pts: [[24.3450,54.5500],[24.3450,54.5600],[24.3450,54.5700],[24.3450,54.5800],[24.3450,54.5900]], d: 52, w: 14 },
  { pts: [[24.3380,54.5500],[24.3380,54.5600],[24.3380,54.5700],[24.3380,54.5800],[24.3380,54.5900]], d: 65, w: 16 },
  { pts: [[24.3450,54.5700],[24.3380,54.5700],[24.3310,54.5700]], d: 70, w: 18 },
  { pts: [[24.3310,54.5500],[24.3310,54.5600],[24.3310,54.5700],[24.3310,54.5800]], d: 55, w: 14 },
  { pts: [[24.2800,54.5850],[24.2800,54.5950],[24.2800,54.6050],[24.2800,54.6150],[24.2800,54.6250]], d: 62, w: 16 },
  { pts: [[24.2700,54.5850],[24.2700,54.5950],[24.2700,54.6050],[24.2700,54.6150],[24.2700,54.6250]], d: 78, w: 20 },
  { pts: [[24.2800,54.6050],[24.2700,54.6050],[24.2600,54.6050]], d: 72, w: 18 },
  { pts: [[24.2600,54.5850],[24.2600,54.5950],[24.2600,54.6050],[24.2600,54.6150]], d: 65, w: 16 },
  { pts: [[24.4200,54.6200],[24.4200,54.6300],[24.4200,54.6400],[24.4200,54.6500]], d: 58, w: 14 },
  { pts: [[24.4300,54.6200],[24.4300,54.6300],[24.4300,54.6400],[24.4300,54.6500]], d: 68, w: 16 },
  { pts: [[24.4200,54.6350],[24.4300,54.6350],[24.4400,54.6350]], d: 62, w: 14 },
  { pts: [[24.4100,54.6200],[24.4100,54.6300],[24.4100,54.6400],[24.4100,54.6500]], d: 52, w: 12 },
  { pts: [[23.8480,52.7950],[23.8480,52.8050],[23.8480,52.8150],[23.8480,52.8250]], d: 100, w: 40 },
  { pts: [[23.8400,52.7950],[23.8400,52.8050],[23.8400,52.8150],[23.8400,52.8250]], d: 120, w: 48 },
  { pts: [[23.8320,52.7950],[23.8320,52.8050],[23.8320,52.8150],[23.8320,52.8250]], d: 140, w: 55 },
  { pts: [[23.8400,52.8100],[23.8320,52.8100],[23.8240,52.8100]], d: 150, w: 60 },
  { pts: [[23.8480,52.8000],[23.8400,52.8000],[23.8320,52.8000],[23.8240,52.8000]], d: 130, w: 52 },
  { pts: [[24.2250,55.7500],[24.2200,55.7500],[24.2150,55.7500],[24.2100,55.7500],[24.2050,55.7500]], d: 52, w: 16 },
  { pts: [[24.2200,55.7400],[24.2200,55.7500],[24.2200,55.7600],[24.2200,55.7700]], d: 62, w: 18 },
  { pts: [[24.2150,55.7450],[24.2150,55.7550],[24.2150,55.7650]], d: 48, w: 14 },
  { pts: [[24.3050,54.6200],[24.3050,54.6300],[24.3050,54.6400],[24.3050,54.6500]], d: 52, w: 14 },
  { pts: [[24.2980,54.6200],[24.2980,54.6300],[24.2980,54.6400],[24.2980,54.6500]], d: 62, w: 16 },
  { pts: [[24.3050,54.6350],[24.2980,54.6350],[24.2910,54.6350]], d: 58, w: 14 },
  { pts: [[24.2910,54.6200],[24.2910,54.6300],[24.2910,54.6400],[24.2910,54.6500]], d: 48, w: 12 },
  { pts: [[23.7100,53.7200],[23.7100,53.7300],[23.7100,53.7400],[23.7100,53.7500]], d: 68, w: 18 },
  { pts: [[23.7050,53.7200],[23.7050,53.7300],[23.7050,53.7400],[23.7050,53.7500]], d: 82, w: 24 },
  { pts: [[23.7100,53.7350],[23.7050,53.7350],[23.7000,53.7350]], d: 88, w: 26 },
  { pts: [[23.7000,53.7200],[23.7000,53.7300],[23.7000,53.7400],[23.7000,53.7500]], d: 72, w: 20 },
  { pts: [[24.4050,54.6350],[24.4050,54.6450],[24.4050,54.6550],[24.4050,54.6650]], d: 58, w: 14 },
  { pts: [[24.3980,54.6350],[24.3980,54.6450],[24.3980,54.6550],[24.3980,54.6650]], d: 68, w: 16 },
  { pts: [[24.4050,54.6500],[24.3980,54.6500],[24.3910,54.6500]], d: 62, w: 14 },
  { pts: [[24.1100,52.7200],[24.1100,52.7300],[24.1100,52.7400],[24.1100,52.7500]], d: 65, w: 18 },
  { pts: [[24.1050,52.7200],[24.1050,52.7300],[24.1050,52.7400],[24.1050,52.7500]], d: 78, w: 22 },
  { pts: [[24.1100,52.7350],[24.1050,52.7350],[24.1000,52.7350]], d: 82, w: 24 },

  // ── Sweihan Road corridor (شارع سويحان) — E-W main road ──────────────────
  { pts: [[24.2480,54.6200],[24.2480,54.6400],[24.2480,54.6600],[24.2480,54.6800],[24.2480,54.7000],[24.2480,54.7200]], d: 95, w: 28 },
  { pts: [[24.2380,54.6200],[24.2380,54.6400],[24.2380,54.6600],[24.2380,54.6800],[24.2380,54.7000],[24.2380,54.7200]], d: 88, w: 24 },
  { pts: [[24.2580,54.6200],[24.2580,54.6400],[24.2580,54.6600],[24.2580,54.6800],[24.2580,54.7000],[24.2580,54.7200]], d: 80, w: 22 },
  // N-S cross streets
  { pts: [[24.2200,54.6600],[24.2380,54.6600],[24.2480,54.6600],[24.2680,54.6600],[24.2900,54.6600]], d: 85, w: 22 },
  { pts: [[24.2200,54.6800],[24.2380,54.6800],[24.2480,54.6800],[24.2680,54.6800],[24.2900,54.6800]], d: 90, w: 24 },
  { pts: [[24.2200,54.7000],[24.2380,54.7000],[24.2480,54.7000],[24.2680,54.7000],[24.2900,54.7000]], d: 78, w: 20 },
  { pts: [[24.2200,54.6400],[24.2380,54.6400],[24.2480,54.6400],[24.2680,54.6400],[24.2900,54.6400]], d: 75, w: 20 },
  // Al Shamkha South streets
  { pts: [[24.2950,54.6400],[24.2950,54.6600],[24.2950,54.6800],[24.2950,54.7000]], d: 82, w: 22 },
  { pts: [[24.2850,54.6400],[24.2850,54.6600],[24.2850,54.6800],[24.2850,54.7000]], d: 88, w: 24 },
  { pts: [[24.2750,54.6400],[24.2750,54.6600],[24.2750,54.6800],[24.2750,54.7000]], d: 92, w: 26 },
  { pts: [[24.2950,54.6600],[24.2850,54.6600],[24.2750,54.6600],[24.2650,54.6600]], d: 80, w: 22 },
  { pts: [[24.2950,54.6800],[24.2850,54.6800],[24.2750,54.6800],[24.2650,54.6800]], d: 85, w: 24 },
  // Al Falah streets
  { pts: [[24.2150,54.5500],[24.2150,54.5700],[24.2150,54.5900],[24.2150,54.6100]], d: 72, w: 20 },
  { pts: [[24.2050,54.5500],[24.2050,54.5700],[24.2050,54.5900],[24.2050,54.6100]], d: 80, w: 22 },
  { pts: [[24.2250,54.5500],[24.2250,54.5700],[24.2250,54.5900],[24.2250,54.6100]], d: 68, w: 18 },
  { pts: [[24.2150,54.5700],[24.2050,54.5700],[24.1950,54.5700]], d: 75, w: 20 },
  { pts: [[24.2150,54.5900],[24.2050,54.5900],[24.1950,54.5900]], d: 78, w: 22 },
];

// ── Intersection pools ────────────────────────────────────────────────────────
interface Pool { lat: number; lng: number; r: number; d: number; }
const POOLS: Pool[] = [
  { lat: 24.3950, lng: 54.4900, r: 90,  d: 65  },
  { lat: 24.3950, lng: 54.5000, r: 100, d: 75  },
  { lat: 24.3950, lng: 54.5100, r: 110, d: 85  },
  { lat: 24.3950, lng: 54.5200, r: 95,  d: 78  },
  { lat: 24.3900, lng: 54.4900, r: 95,  d: 72  },
  { lat: 24.3900, lng: 54.5000, r: 105, d: 82  },
  { lat: 24.3900, lng: 54.5100, r: 115, d: 92  },
  { lat: 24.3900, lng: 54.5200, r: 100, d: 85  },
  { lat: 24.3850, lng: 54.5000, r: 110, d: 88  },
  { lat: 24.3850, lng: 54.5100, r: 120, d: 98  },
  { lat: 24.3800, lng: 54.5000, r: 115, d: 92  },
  { lat: 24.3800, lng: 54.5100, r: 125, d: 102 },
  { lat: 24.4280, lng: 54.5750, r: 85,  d: 62  },
  { lat: 24.4280, lng: 54.5850, r: 95,  d: 72  },
  { lat: 24.4280, lng: 54.5950, r: 105, d: 82  },
  { lat: 24.4230, lng: 54.5750, r: 90,  d: 68  },
  { lat: 24.4230, lng: 54.5850, r: 100, d: 78  },
  { lat: 24.4230, lng: 54.5950, r: 110, d: 88  },
  { lat: 24.4180, lng: 54.5750, r: 95,  d: 75  },
  { lat: 24.4180, lng: 54.5850, r: 108, d: 88  },
  { lat: 24.4180, lng: 54.5950, r: 118, d: 98  },
  { lat: 24.4130, lng: 54.5850, r: 105, d: 85  },
  { lat: 24.4130, lng: 54.5950, r: 112, d: 92  },
  { lat: 24.3780, lng: 54.4700, r: 120, d: 95  },
  { lat: 24.3720, lng: 54.4700, r: 135, d: 108 },
  { lat: 24.3660, lng: 54.4700, r: 140, d: 115 },
  { lat: 24.3780, lng: 54.4600, r: 110, d: 88  },
  { lat: 24.3720, lng: 54.4600, r: 125, d: 100 },
  { lat: 24.2800, lng: 54.6050, r: 130, d: 95  },
  { lat: 24.2700, lng: 54.6050, r: 145, d: 108 },
  { lat: 24.2600, lng: 54.6050, r: 120, d: 88  },
  { lat: 23.8480, lng: 52.8100, r: 200, d: 140 },
  { lat: 23.8400, lng: 52.8100, r: 220, d: 160 },
  { lat: 23.8320, lng: 52.8100, r: 240, d: 175 },
  { lat: 23.8400, lng: 52.8000, r: 210, d: 155 },
  { lat: 24.2200, lng: 55.7500, r: 100, d: 78  },
  { lat: 24.2150, lng: 55.7550, r: 90,  d: 68  },
  { lat: 24.3450, lng: 54.5700, r: 115, d: 88  },
  { lat: 24.3380, lng: 54.5700, r: 125, d: 98  },
  { lat: 24.4200, lng: 54.6350, r: 110, d: 85  },
  { lat: 24.4300, lng: 54.6350, r: 120, d: 95  },
  { lat: 23.7100, lng: 53.7350, r: 140, d: 108 },
  { lat: 23.7050, lng: 53.7350, r: 155, d: 120 },
  { lat: 24.4050, lng: 54.6500, r: 105, d: 82  },
  { lat: 24.3980, lng: 54.6500, r: 115, d: 92  },
  // ── Sweihan Road intersection pools ──────────────────────────────────────
  { lat: 24.2480, lng: 54.6600, r: 160, d: 115 }, // Main Sweihan/Shamkha junction
  { lat: 24.2480, lng: 54.6800, r: 145, d: 105 }, // Sweihan Rd E1
  { lat: 24.2480, lng: 54.7000, r: 130, d: 95  }, // Sweihan Rd E2
  { lat: 24.2380, lng: 54.6600, r: 140, d: 100 }, // Sweihan S junction
  { lat: 24.2380, lng: 54.6800, r: 130, d: 92  }, // Sweihan S E1
  { lat: 24.2580, lng: 54.6600, r: 135, d: 98  }, // Sweihan N junction
  { lat: 24.2580, lng: 54.6800, r: 125, d: 90  }, // Sweihan N E1
  { lat: 24.2950, lng: 54.6600, r: 140, d: 105 }, // Shamkha S main pool
  { lat: 24.2850, lng: 54.6600, r: 150, d: 112 }, // Shamkha S mid pool
  { lat: 24.2750, lng: 54.6600, r: 155, d: 118 }, // Shamkha S deep pool
  { lat: 24.2950, lng: 54.6800, r: 130, d: 98  }, // Shamkha S E pool
  { lat: 24.2850, lng: 54.6800, r: 140, d: 108 }, // Shamkha S E2 pool
  { lat: 24.2150, lng: 54.5700, r: 120, d: 88  }, // Al Falah main pool
  { lat: 24.2050, lng: 54.5700, r: 130, d: 95  }, // Al Falah deep pool
  { lat: 24.2150, lng: 54.5900, r: 125, d: 92  }, // Al Falah E pool
  { lat: 24.2050, lng: 54.5900, r: 135, d: 100 }, // Al Falah E2 pool
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

    _drawGrid(ctx, map, zoom, bounds, mult);
    if (zoom >= 12) _drawStreets(ctx, map, zoom, bounds, mult);
    if (zoom >= 12) _drawPools(ctx, map, zoom, bounds, mult);
  }

  // ── Layer A: Fine irregular patches ──────────────────────────────────────
  function _drawGrid(ctx: CanvasRenderingContext2D, map: any, zoom: number, bounds: any, mult: number) {
    const north = Math.min(bounds.getNorth(), 25.5);
    const south = Math.max(bounds.getSouth(), 22.5);
    const east  = Math.min(bounds.getEast(),  56.2);
    const west  = Math.max(bounds.getWest(),  51.3);
    if (north < 22.5 || south > 25.5) return;

    let step: number, patchM: number, baseD: number;
    if      (zoom >= 16) { step = 0.0008; patchM =  40; baseD = 15; }
    else if (zoom >= 14) { step = 0.0018; patchM =  90; baseD = 20; }
    else if (zoom >= 12) { step = 0.0045; patchM = 200; baseD = 25; }
    else if (zoom >= 10) { step = 0.0120; patchM = 400; baseD = 30; }
    else if (zoom >=  8) { step = 0.0350; patchM = 900; baseD = 38; }
    else                 { step = 0.0900; patchM = 2200; baseD = 45; }

    let lat = south;
    while (lat <= north + step) {
      let lng = west;
      while (lng <= east + step) {
        const jLat = Math.sin(lat * 1337.3 + lng * 919.7) * 0.38 * step;
        const jLng = Math.cos(lat * 773.1  + lng * 1153.9) * 0.38 * step;
        const pLat = lat + jLat, pLng = lng + jLng;

        if (!isInsideAbuDhabi(pLat, pLng)) { lng += step; continue; }

        const density = getUrbanDensity(pLat, pLng);
        const boost = zoneBoost(pLat, pLng);

        // ── Rainfall-adaptive density filter ─────────────────────────────────
        // mult=0.30 (dry)  → only low-density areas show water
        // mult=1.00 (10mm) → medium density areas start showing
        // mult=2.50 (254mm)→ ALL areas including dense urban show water
        //
        // rainFactor: 0.0 at mult=0.3 (dry), 1.0 at mult=2.5+ (extreme rain)
        const rainFactor = Math.min(1.0, Math.max(0.0, (mult - 0.3) / 2.2));

        // Maximum density allowed to show water — rises with rainfall
        // dry: max 0.30 density, extreme rain: max 1.0 (all areas)
        const maxDensity = 0.30 + rainFactor * 0.70;
        if (density > maxDensity && boost < 1.8) { lng += step; continue; }

        // Terrain threshold: rises with rainfall (more area covered)
        // dry: threshold=0.40 → ~40% of area shows water
        // moderate (mult=1.0): threshold=0.62 → ~62% shows water
        // extreme (mult=2.5): threshold=0.92 → ~92% shows water
        const densityPenalty = density * 0.12 * (1.0 - rainFactor * 0.85);
        const threshold = Math.min(0.95, Math.max(0.22,
          0.40 - densityPenalty + rainFactor * 0.52
        ));
        const h = terrain(pLat, pLng);
        if (h >= threshold) { lng += step; continue; }

        const frac = (threshold - h) / threshold;

        // ── Physics-based depth using real hydrology data ────────────────────────
        // Get real drainage efficiency and soil infiltration for this location
        let drainFactor = 1.0; // default: no drainage benefit
        let infiltFactor = 1.0; // default: no infiltration benefit
        let catchFactor = 1.0; // default: no catchment amplification
        const regionVal = getRegionTerrainValue(pLat, pLng);
        if (regionVal >= 0) {
          // Find the region hydrology data
          let bestId: string | null = null;
          let bestArea = Infinity;
          for (const [minLat, maxLat, minLng, maxLng, id] of TERRAIN_REGIONS) {
            if (pLat >= minLat && pLat <= maxLat && pLng >= minLng && pLng <= maxLng) {
              const area = (maxLat - minLat) * (maxLng - minLng);
              if (area < bestArea) { bestArea = area; bestId = id; }
            }
          }
          if (bestId) {
            const hyd = REGION_HYDROLOGY[bestId];
            if (hyd) {
              // Drainage efficiency: 0.9 (excellent) → depth reduced by 90%
              //                      0.1 (poor)      → depth reduced by 10%
              drainFactor = 1.0 - hyd.drainEfficiency * 0.80;
              // Soil infiltration: sandy (0.8) → much less water
              //                    sealed (0.05) → almost no absorption
              // infiltrationRateMmHr: 50+ (sandy) → much less water; <5 (sealed) → almost no absorption
              infiltFactor = 1.0 - Math.min(1.0, hyd.infiltrationRateMmHr / 80.0) * 0.60;
              // Catchment multiplier: depression areas collect more water
              catchFactor = Math.min(2.5, hyd.catchmentMultiplier * 0.6 + 0.4);
            }
          }
        }
        // Urban factor: dense urban areas drain faster (sewers)
        const urbanFactor = 1.0 - density * 0.25 * (1.0 - rainFactor * 0.50);
        const depthCm = baseD * mult * frac * boost * urbanFactor
          * drainFactor * infiltFactor * catchFactor
          * (zoom < 10 ? 0.60 : 0.90);
        if (depthCm < 2) { lng += step; continue; }

        const [r, g, b, alpha] = depthToRgba(depthCm);
        if (alpha < 0.01) { lng += step; continue; }

        const pt = map.latLngToContainerPoint([pLat, pLng]);
        const rpx = m2px(patchM, pLat, zoom);
        if (rpx < 1) { lng += step; continue; }

        const rx = rpx * (1.0 + Math.sin(pLat * 211.3 + pLng * 317.7) * 0.25);
        const ry = rpx * (0.68 + Math.cos(pLat * 149.1 + pLng * 251.3) * 0.20);
        const angle = Math.sin(pLat * 97.3 + pLng * 131.7) * 0.55;

        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(angle);
        ctx.scale(1, ry / rx);

        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        grd.addColorStop(0.00, `rgba(${r},${g},${b},${alpha.toFixed(3)})`);
        grd.addColorStop(0.40, `rgba(${r},${g},${b},${(alpha * 0.78).toFixed(3)})`);
        grd.addColorStop(0.68, `rgba(${r},${g},${b},${(alpha * 0.38).toFixed(3)})`);
        grd.addColorStop(0.88, `rgba(${r},${g},${b},${(alpha * 0.10).toFixed(3)})`);
        grd.addColorStop(1.00, `rgba(${r},${g},${b},0)`);

        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        lng += step;
      }
      lat += step;
    }
  }

  // ── Layer B: Street channels ──────────────────────────────────────────────
  function _drawStreets(ctx: CanvasRenderingContext2D, map: any, zoom: number, bounds: any, mult: number) {
    const latPad = (bounds.getNorth() - bounds.getSouth()) * 0.6;
    const lngPad = (bounds.getEast()  - bounds.getWest())  * 0.6;

    SEGS.forEach(seg => {
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

      // Outer soft glow
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(alpha * 0.18).toFixed(3)})`;
      ctx.lineWidth = wPx * 2.8;
      ctx.stroke();

      // Mid glow
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(alpha * 0.45).toFixed(3)})`;
      ctx.lineWidth = wPx * 1.4;
      ctx.stroke();

      // Core channel
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(alpha * 0.70).toFixed(3)})`;
      ctx.lineWidth = wPx * 0.70;
      ctx.stroke();

      ctx.restore();
    });
  }

  // ── Layer C: Intersection pools ───────────────────────────────────────────
  function _drawPools(ctx: CanvasRenderingContext2D, map: any, zoom: number, bounds: any, mult: number) {
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

  // ── Event listeners ───────────────────────────────────────────────────────
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
