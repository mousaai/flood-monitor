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

// ── Pseudo-random terrain (0=low/flood-prone, 1=high/dry) ────────────────────
function terrain(lat: number, lng: number): number {
  const h1 = Math.sin(lat * 317.4 + lng * 211.7) * 0.5 + 0.5;
  const h2 = Math.sin(lat *  89.3 - lng * 143.1) * 0.5 + 0.5;
  const h3 = Math.sin(lat * 521.1 + lng *  67.9) * 0.5 + 0.5;
  const h4 = Math.cos(lat * 173.6 - lng * 389.2) * 0.5 + 0.5;
  return h1 * 0.35 + h2 * 0.30 + h3 * 0.20 + h4 * 0.15;
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
        // Dense areas get a penalty that shrinks as rain increases
        const densityPenalty = density * 0.15 * (1.0 - rainFactor * 0.80);
        const threshold = Math.min(0.85, Math.max(0.18,
          0.52 - densityPenalty + rainFactor * 0.28
        ));
        const h = terrain(pLat, pLng);
        if (h >= threshold) { lng += step; continue; }

        const frac = (threshold - h) / threshold;
        // Depth: urban areas get shallower water (faster drainage)
        const urbanFactor = 1.0 - density * 0.30 * (1.0 - rainFactor * 0.50);
        const depthCm = baseD * mult * frac * boost * urbanFactor * (zoom < 10 ? 0.60 : 0.90);
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
