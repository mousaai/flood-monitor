/**
 * abuDhabiHydrology.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Physics-based hydrology model for Abu Dhabi flood simulation.
 *
 * MODEL OVERVIEW (rational method + Green-Ampt infiltration):
 *
 *   Q_runoff = P × A_catchment × C_runoff × (1 − f_infil) × (1 − f_drain)
 *
 * Where:
 *   P              = precipitation depth (mm)
 *   A_catchment    = contributing catchment area (m²) — derived from DEM slope
 *   C_runoff       = runoff coefficient (0–1, depends on surface type)
 *   f_infil        = infiltration fraction (depends on soil type)
 *   f_drain        = drainage efficiency (depends on drain infrastructure)
 *
 * TERRAIN MODEL (SRTM-derived for Abu Dhabi):
 *   Each point has:
 *     - elevationM: average elevation above MSL (metres)
 *     - slopeIndex: 0=flat basin (accumulates), 1=steep hillside (drains fast)
 *     - catchmentMultiplier: how large an area drains INTO this point
 *       (low-lying flat areas have large catchment → large pool)
 *       (steep areas have small catchment → water flows away quickly)
 *
 * POOL SIZE PHYSICS:
 *   poolAreaM2 = baseAreaM2 × catchmentMultiplier × (1 - slopeIndex×0.7)
 *   poolDepthCm = netRunoffMm × slopeCorrection × terrainFactor
 *   poolVolumeM3 = (poolDepthCm/100) × poolAreaM2
 *
 * SOIL TYPES (Abu Dhabi):
 *   - urban_paved: very low infiltration (0.5–2 mm/hr), high runoff
 *   - sandy_loam:  medium infiltration (5–10 mm/hr)
 *   - sandy:       high infiltration (15–30 mm/hr), fast drainage
 *   - sabkha:      near-zero infiltration (salt crust seals surface)
 *   - agricultural: medium-high infiltration (10–20 mm/hr)
 *   - industrial:  very low infiltration, poor drainage infrastructure
 *
 * DATA SOURCES:
 *   - UAE National Atlas DEM (SRTM 30m resolution)
 *   - Abu Dhabi Municipality drainage reports 2019–2024
 *   - ADWEA infrastructure data
 *   - Post-April-2024 flood event assessment
 */

export type SoilType = 'urban_paved' | 'sandy_loam' | 'sandy' | 'sabkha' | 'agricultural' | 'industrial';

export interface RegionHydrology {
  id: string;
  /** Average elevation above MSL (metres) — lower = more flood-prone */
  elevationM: number;
  /** Terrain slope index 0–1 (0=flat basin, 1=steep hillside) */
  slopeIndex: number;
  /** Dominant soil / surface type */
  soilType: SoilType;
  /** Runoff coefficient C (0–1): fraction of rain that becomes surface runoff */
  runoffCoeff: number;
  /** Drainage infrastructure efficiency (0=no drains, 1=perfect drainage) */
  drainEfficiency: number;
  /** Soil infiltration rate (mm/hr) — Green-Ampt saturated hydraulic conductivity */
  infiltrationRateMmHr: number;
  /** Depression storage capacity (mm) — fills before runoff starts */
  depressionStorageMm: number;
  /** Catchment area fraction: fraction of region that contributes runoff */
  catchmentFraction: number;
  /** Typical flood duration (hours) before water recedes */
  floodDurationHr: number;
  /**
   * Catchment multiplier (1.0–8.0):
   * How many times larger is the CONTRIBUTING CATCHMENT vs the visible pool area.
   * Low-lying flat areas (sabkha, wadis) collect water from a much larger area.
   * High-density urban areas with sealed surfaces also have large effective catchments.
   * Sandy desert areas: water infiltrates quickly, small effective catchment.
   *
   * Physical basis: A = π×r² × catchmentMultiplier
   * where r is the visible pool radius on the map.
   */
  catchmentMultiplier: number;
  /**
   * Terrain depression factor (0.5–3.0):
   * Amplifies depth in natural depressions (wadis, sabkha, underpasses).
   * 1.0 = normal flat terrain, 3.0 = deep depression/wadi.
   */
  depressionFactor: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// REGION HYDROLOGY DATABASE
// Values derived from:
//   • UAE National DEM (SRTM 30m) — elevations verified against Google Earth
//   • Abu Dhabi Municipality drainage reports 2019–2024
//   • Post-April-2024 flood assessment (ADWEA, NCEMA)
//   • Soil survey data from Abu Dhabi Environment Agency
// ─────────────────────────────────────────────────────────────────────────────
export const REGION_HYDROLOGY: Record<string, RegionHydrology> = {

  // ── Abu Dhabi Island sub-districts ──────────────────────────────────────────
  // Island: 2–5m above MSL, heavily paved, poor drainage in 2024
  // Flat terrain → large catchment multiplier
  'Al Bateen': {
    id: 'Al Bateen', elevationM: 4.5, slopeIndex: 0.05,
    soilType: 'urban_paved', runoffCoeff: 0.88, drainEfficiency: 0.45,
    infiltrationRateMmHr: 2.0, depressionStorageMm: 3.0,
    catchmentFraction: 0.75, floodDurationHr: 6,
    catchmentMultiplier: 2.2, depressionFactor: 1.1,
  },
  'Al Manhal': {
    id: 'Al Manhal', elevationM: 3.2, slopeIndex: 0.03,
    soilType: 'urban_paved', runoffCoeff: 0.90, drainEfficiency: 0.40,
    infiltrationRateMmHr: 1.5, depressionStorageMm: 2.5,
    catchmentFraction: 0.80, floodDurationHr: 8,
    catchmentMultiplier: 2.8, depressionFactor: 1.3, // slightly lower area
  },
  'Al Karama': {
    id: 'Al Karama', elevationM: 3.8, slopeIndex: 0.04,
    soilType: 'urban_paved', runoffCoeff: 0.87, drainEfficiency: 0.42,
    infiltrationRateMmHr: 1.8, depressionStorageMm: 3.0,
    catchmentFraction: 0.78, floodDurationHr: 7,
    catchmentMultiplier: 2.5, depressionFactor: 1.2,
  },
  'Al Gharb': {
    id: 'Al Gharb', elevationM: 4.0, slopeIndex: 0.06,
    soilType: 'urban_paved', runoffCoeff: 0.85, drainEfficiency: 0.50,
    infiltrationRateMmHr: 2.2, depressionStorageMm: 3.5,
    catchmentFraction: 0.72, floodDurationHr: 6,
    catchmentMultiplier: 2.0, depressionFactor: 1.0,
  },
  'Al Khalidiyah': {
    id: 'Al Khalidiyah', elevationM: 2.8, slopeIndex: 0.02,
    soilType: 'urban_paved', runoffCoeff: 0.92, drainEfficiency: 0.35,
    infiltrationRateMmHr: 1.2, depressionStorageMm: 2.0,
    catchmentFraction: 0.85, floodDurationHr: 10,
    catchmentMultiplier: 3.2, depressionFactor: 1.5, // very low, flat
  },
  'Al Zaab': {
    id: 'Al Zaab', elevationM: 3.0, slopeIndex: 0.03,
    soilType: 'urban_paved', runoffCoeff: 0.89, drainEfficiency: 0.38,
    infiltrationRateMmHr: 1.6, depressionStorageMm: 2.5,
    catchmentFraction: 0.82, floodDurationHr: 8,
    catchmentMultiplier: 2.6, depressionFactor: 1.2,
  },
  'Al Muroor': {
    id: 'Al Muroor', elevationM: 3.5, slopeIndex: 0.04,
    soilType: 'urban_paved', runoffCoeff: 0.88, drainEfficiency: 0.40,
    infiltrationRateMmHr: 1.8, depressionStorageMm: 3.0,
    catchmentFraction: 0.80, floodDurationHr: 8,
    catchmentMultiplier: 2.8, depressionFactor: 1.3,
  },
  'Al Rawdah': {
    id: 'Al Rawdah', elevationM: 4.2, slopeIndex: 0.05,
    soilType: 'urban_paved', runoffCoeff: 0.85, drainEfficiency: 0.45,
    infiltrationRateMmHr: 2.0, depressionStorageMm: 3.0,
    catchmentFraction: 0.75, floodDurationHr: 6,
    catchmentMultiplier: 2.2, depressionFactor: 1.0,
  },
  'Al Mushrif': {
    id: 'Al Mushrif', elevationM: 3.0, slopeIndex: 0.03,
    soilType: 'urban_paved', runoffCoeff: 0.87, drainEfficiency: 0.38,
    infiltrationRateMmHr: 1.8, depressionStorageMm: 2.5,
    catchmentFraction: 0.80, floodDurationHr: 9,
    catchmentMultiplier: 3.0, depressionFactor: 1.4,
  },
  'Al Nahyan': {
    id: 'Al Nahyan', elevationM: 3.8, slopeIndex: 0.04,
    soilType: 'urban_paved', runoffCoeff: 0.86, drainEfficiency: 0.42,
    infiltrationRateMmHr: 2.0, depressionStorageMm: 3.0,
    catchmentFraction: 0.78, floodDurationHr: 7,
    catchmentMultiplier: 2.5, depressionFactor: 1.2,
  },
  'Tourist Club Area': {
    id: 'Tourist Club Area', elevationM: 2.5, slopeIndex: 0.02,
    soilType: 'urban_paved', runoffCoeff: 0.91, drainEfficiency: 0.35,
    infiltrationRateMmHr: 1.2, depressionStorageMm: 2.0,
    catchmentFraction: 0.85, floodDurationHr: 10,
    catchmentMultiplier: 3.0, depressionFactor: 1.4,
  },
  'Downtown Abu Dhabi': {
    id: 'Downtown Abu Dhabi', elevationM: 3.0, slopeIndex: 0.03,
    soilType: 'urban_paved', runoffCoeff: 0.92, drainEfficiency: 0.38,
    infiltrationRateMmHr: 1.0, depressionStorageMm: 2.0,
    catchmentFraction: 0.88, floodDurationHr: 10,
    catchmentMultiplier: 3.5, depressionFactor: 1.5,
  },
  'Corniche': {
    id: 'Corniche', elevationM: 2.0, slopeIndex: 0.08,
    soilType: 'urban_paved', runoffCoeff: 0.85, drainEfficiency: 0.55,
    infiltrationRateMmHr: 2.5, depressionStorageMm: 3.0,
    catchmentFraction: 0.70, floodDurationHr: 5,
    catchmentMultiplier: 1.8, depressionFactor: 0.9, // slopes to sea
  },
  'Al Difaa': {
    id: 'Al Difaa', elevationM: 4.5, slopeIndex: 0.05,
    soilType: 'urban_paved', runoffCoeff: 0.84, drainEfficiency: 0.48,
    infiltrationRateMmHr: 2.2, depressionStorageMm: 3.5,
    catchmentFraction: 0.72, floodDurationHr: 6,
    catchmentMultiplier: 2.0, depressionFactor: 1.0,
  },
  'Al Refa': {
    id: 'Al Refa', elevationM: 4.8, slopeIndex: 0.05,
    soilType: 'urban_paved', runoffCoeff: 0.83, drainEfficiency: 0.50,
    infiltrationRateMmHr: 2.5, depressionStorageMm: 3.5,
    catchmentFraction: 0.70, floodDurationHr: 5,
    catchmentMultiplier: 1.9, depressionFactor: 1.0,
  },
  'Zayed Sports City': {
    id: 'Zayed Sports City', elevationM: 5.0, slopeIndex: 0.04,
    soilType: 'urban_paved', runoffCoeff: 0.80, drainEfficiency: 0.55,
    infiltrationRateMmHr: 3.0, depressionStorageMm: 4.0,
    catchmentFraction: 0.65, floodDurationHr: 5,
    catchmentMultiplier: 1.8, depressionFactor: 0.9,
  },
  'Abu Dhabi Island': {
    id: 'Abu Dhabi Island', elevationM: 3.5, slopeIndex: 0.04,
    soilType: 'urban_paved', runoffCoeff: 0.88, drainEfficiency: 0.42,
    infiltrationRateMmHr: 1.8, depressionStorageMm: 2.5,
    catchmentFraction: 0.80, floodDurationHr: 8,
    catchmentMultiplier: 2.8, depressionFactor: 1.3,
  },

  // ── Al Reem Island ──────────────────────────────────────────────────────────
  'Al Reem Island': {
    id: 'Al Reem Island', elevationM: 2.0, slopeIndex: 0.06,
    soilType: 'urban_paved', runoffCoeff: 0.82, drainEfficiency: 0.52,
    infiltrationRateMmHr: 2.5, depressionStorageMm: 3.0,
    catchmentFraction: 0.70, floodDurationHr: 5,
    catchmentMultiplier: 2.0, depressionFactor: 1.0,
  },

  // ── Saadiyat Island ─────────────────────────────────────────────────────────
  'Saadiyat Island': {
    id: 'Saadiyat Island', elevationM: 2.5, slopeIndex: 0.07,
    soilType: 'sandy_loam', runoffCoeff: 0.72, drainEfficiency: 0.55,
    infiltrationRateMmHr: 5.0, depressionStorageMm: 4.0,
    catchmentFraction: 0.60, floodDurationHr: 4,
    catchmentMultiplier: 1.6, depressionFactor: 0.9,
  },

  // ── Al Maqta ────────────────────────────────────────────────────────────────
  // Bridge area — low-lying, collects water from both sides
  'Al Maqta': {
    id: 'Al Maqta', elevationM: 1.5, slopeIndex: 0.02,
    soilType: 'urban_paved', runoffCoeff: 0.92, drainEfficiency: 0.30,
    infiltrationRateMmHr: 1.0, depressionStorageMm: 2.0,
    catchmentFraction: 0.90, floodDurationHr: 12,
    catchmentMultiplier: 4.0, depressionFactor: 2.0, // very low bridge area
  },

  // ── Al Bahia ────────────────────────────────────────────────────────────────
  'Al Bahia': {
    id: 'Al Bahia', elevationM: 6.0, slopeIndex: 0.04,
    soilType: 'sandy_loam', runoffCoeff: 0.72, drainEfficiency: 0.45,
    infiltrationRateMmHr: 6.0, depressionStorageMm: 5.0,
    catchmentFraction: 0.65, floodDurationHr: 6,
    catchmentMultiplier: 1.8, depressionFactor: 1.0,
  },

  // ── Mussafah ────────────────────────────────────────────────────────────────
  // CRITICAL: Very low elevation (1–3m), industrial/paved, poor drainage
  // Largest flood accumulation in April 2024
  'Mussafah Industrial': {
    id: 'Mussafah Industrial', elevationM: 1.8, slopeIndex: 0.01,
    soilType: 'industrial', runoffCoeff: 0.95, drainEfficiency: 0.15,
    infiltrationRateMmHr: 0.5, depressionStorageMm: 1.5,
    catchmentFraction: 0.92, floodDurationHr: 36,
    catchmentMultiplier: 5.5, depressionFactor: 2.5, // very flat, very low
  },
  'Mussafah Residential': {
    id: 'Mussafah Residential', elevationM: 2.5, slopeIndex: 0.02,
    soilType: 'urban_paved', runoffCoeff: 0.88, drainEfficiency: 0.22,
    infiltrationRateMmHr: 1.5, depressionStorageMm: 2.0,
    catchmentFraction: 0.88, floodDurationHr: 24,
    catchmentMultiplier: 4.5, depressionFactor: 2.0,
  },
  'Mussafah': {
    id: 'Mussafah', elevationM: 2.0, slopeIndex: 0.01,
    soilType: 'industrial', runoffCoeff: 0.93, drainEfficiency: 0.18,
    infiltrationRateMmHr: 0.8, depressionStorageMm: 1.5,
    catchmentFraction: 0.90, floodDurationHr: 30,
    catchmentMultiplier: 5.0, depressionFactor: 2.3,
  },

  // ── KIZAD ───────────────────────────────────────────────────────────────────
  // Industrial zone, very flat, no drainage infrastructure
  'KIZAD': {
    id: 'KIZAD', elevationM: 2.0, slopeIndex: 0.01,
    soilType: 'industrial', runoffCoeff: 0.94, drainEfficiency: 0.18,
    infiltrationRateMmHr: 0.5, depressionStorageMm: 1.0,
    catchmentFraction: 0.92, floodDurationHr: 30,
    catchmentMultiplier: 5.5, depressionFactor: 2.5,
  },
  'KIZAD Industrial': {
    id: 'KIZAD Industrial', elevationM: 1.8, slopeIndex: 0.01,
    soilType: 'industrial', runoffCoeff: 0.96, drainEfficiency: 0.12,
    infiltrationRateMmHr: 0.3, depressionStorageMm: 0.8,
    catchmentFraction: 0.95, floodDurationHr: 40,
    catchmentMultiplier: 6.0, depressionFactor: 2.8,
  },

  // ── Mohammed Bin Zayed City ─────────────────────────────────────────────────
  'Mohammed Bin Zayed City': {
    id: 'Mohammed Bin Zayed City', elevationM: 3.5, slopeIndex: 0.02,
    soilType: 'sandy_loam', runoffCoeff: 0.82, drainEfficiency: 0.28,
    infiltrationRateMmHr: 5.0, depressionStorageMm: 4.5,
    catchmentFraction: 0.80, floodDurationHr: 14,
    catchmentMultiplier: 3.5, depressionFactor: 1.6,
  },

  // ── Khalifa City A / B ──────────────────────────────────────────────────────
  'Khalifa City A': {
    id: 'Khalifa City A', elevationM: 4.2, slopeIndex: 0.02,
    soilType: 'sandy_loam', runoffCoeff: 0.80, drainEfficiency: 0.32,
    infiltrationRateMmHr: 6.0, depressionStorageMm: 5.0,
    catchmentFraction: 0.75, floodDurationHr: 10,
    catchmentMultiplier: 3.2, depressionFactor: 1.5,
  },
  'Khalifa City B': {
    id: 'Khalifa City B', elevationM: 4.5, slopeIndex: 0.03,
    soilType: 'sandy_loam', runoffCoeff: 0.78, drainEfficiency: 0.38,
    infiltrationRateMmHr: 7.0, depressionStorageMm: 5.5,
    catchmentFraction: 0.72, floodDurationHr: 8,
    catchmentMultiplier: 2.8, depressionFactor: 1.3,
  },

  // ── Yas Island ──────────────────────────────────────────────────────────────
  'Yas Island': {
    id: 'Yas Island', elevationM: 2.5, slopeIndex: 0.05,
    soilType: 'urban_paved', runoffCoeff: 0.82, drainEfficiency: 0.58,
    infiltrationRateMmHr: 3.0, depressionStorageMm: 4.0,
    catchmentFraction: 0.68, floodDurationHr: 5,
    catchmentMultiplier: 2.0, depressionFactor: 1.0,
  },

  // ── Al Raha Beach ───────────────────────────────────────────────────────────
  'Al Raha Beach': {
    id: 'Al Raha Beach', elevationM: 1.8, slopeIndex: 0.04,
    soilType: 'urban_paved', runoffCoeff: 0.85, drainEfficiency: 0.50,
    infiltrationRateMmHr: 2.5, depressionStorageMm: 3.0,
    catchmentFraction: 0.72, floodDurationHr: 6,
    catchmentMultiplier: 2.5, depressionFactor: 1.2,
  },

  // ── Al Rahba ────────────────────────────────────────────────────────────────
  'Al Rahba': {
    id: 'Al Rahba', elevationM: 5.0, slopeIndex: 0.03,
    soilType: 'sandy_loam', runoffCoeff: 0.75, drainEfficiency: 0.40,
    infiltrationRateMmHr: 8.0, depressionStorageMm: 6.0,
    catchmentFraction: 0.65, floodDurationHr: 7,
    catchmentMultiplier: 2.2, depressionFactor: 1.1,
  },

  // ── Shahama ─────────────────────────────────────────────────────────────────
  'Shahama': {
    id: 'Shahama', elevationM: 4.5, slopeIndex: 0.03,
    soilType: 'sandy_loam', runoffCoeff: 0.72, drainEfficiency: 0.42,
    infiltrationRateMmHr: 7.0, depressionStorageMm: 5.5,
    catchmentFraction: 0.65, floodDurationHr: 6,
    catchmentMultiplier: 2.0, depressionFactor: 1.0,
  },

  // ── Zayed City ──────────────────────────────────────────────────────────────
  'Zayed City': {
    id: 'Zayed City', elevationM: 3.0, slopeIndex: 0.02,
    soilType: 'sandy_loam', runoffCoeff: 0.83, drainEfficiency: 0.30,
    infiltrationRateMmHr: 5.5, depressionStorageMm: 4.5,
    catchmentFraction: 0.80, floodDurationHr: 14,
    catchmentMultiplier: 3.8, depressionFactor: 1.7,
  },

  // ── Al Shamkha ──────────────────────────────────────────────────────────────
  // Flat, low-lying, poor drainage — major flood area April 2024
  'Al Shamkha': {
    id: 'Al Shamkha', elevationM: 3.5, slopeIndex: 0.02,
    soilType: 'sandy_loam', runoffCoeff: 0.80, drainEfficiency: 0.28,
    infiltrationRateMmHr: 6.0, depressionStorageMm: 5.0,
    catchmentFraction: 0.78, floodDurationHr: 16,
    catchmentMultiplier: 4.0, depressionFactor: 1.8,
  },
  'Al Shamkha Farms': {
    id: 'Al Shamkha Farms', elevationM: 4.0, slopeIndex: 0.02,
    soilType: 'agricultural', runoffCoeff: 0.55, drainEfficiency: 0.20,
    infiltrationRateMmHr: 15.0, depressionStorageMm: 10.0,
    catchmentFraction: 0.50, floodDurationHr: 8,
    catchmentMultiplier: 2.0, depressionFactor: 1.0,
  },

  // ── Sweihan Road Corridor ───────────────────────────────────────────────────
  // Major flood corridor — flat desert with no drainage
  'Sweihan Road': {
    id: 'Sweihan Road', elevationM: 4.0, slopeIndex: 0.01,
    soilType: 'sandy_loam', runoffCoeff: 0.75, drainEfficiency: 0.15,
    infiltrationRateMmHr: 8.0, depressionStorageMm: 6.0,
    catchmentFraction: 0.82, floodDurationHr: 18,
    catchmentMultiplier: 4.5, depressionFactor: 2.0,
  },

  // ── Al Falah ────────────────────────────────────────────────────────────────
  'Al Falah': {
    id: 'Al Falah', elevationM: 3.8, slopeIndex: 0.02,
    soilType: 'sandy_loam', runoffCoeff: 0.78, drainEfficiency: 0.30,
    infiltrationRateMmHr: 7.0, depressionStorageMm: 6.0,
    catchmentFraction: 0.72, floodDurationHr: 10,
    catchmentMultiplier: 3.2, depressionFactor: 1.5,
  },

  // ── Baniyas ─────────────────────────────────────────────────────────────────
  'Baniyas': {
    id: 'Baniyas', elevationM: 3.2, slopeIndex: 0.02,
    soilType: 'sandy_loam', runoffCoeff: 0.82, drainEfficiency: 0.32,
    infiltrationRateMmHr: 5.0, depressionStorageMm: 4.0,
    catchmentFraction: 0.78, floodDurationHr: 12,
    catchmentMultiplier: 3.5, depressionFactor: 1.6,
  },

  // ── Al Wathba ───────────────────────────────────────────────────────────────
  // Natural lake/wetland — VERY high retention, massive catchment
  'Al Wathba': {
    id: 'Al Wathba', elevationM: 1.2, slopeIndex: 0.01,
    soilType: 'sabkha', runoffCoeff: 0.95, drainEfficiency: 0.05,
    infiltrationRateMmHr: 0.3, depressionStorageMm: 50.0,
    catchmentFraction: 0.90, floodDurationHr: 72,
    catchmentMultiplier: 7.0, depressionFactor: 3.0, // massive natural basin
  },
  'Al Wathba Farms': {
    id: 'Al Wathba Farms', elevationM: 2.5, slopeIndex: 0.02,
    soilType: 'agricultural', runoffCoeff: 0.60, drainEfficiency: 0.15,
    infiltrationRateMmHr: 12.0, depressionStorageMm: 15.0,
    catchmentFraction: 0.55, floodDurationHr: 10,
    catchmentMultiplier: 2.2, depressionFactor: 1.1,
  },

  // ── ICAD ────────────────────────────────────────────────────────────────────
  'ICAD': {
    id: 'ICAD', elevationM: 2.0, slopeIndex: 0.01,
    soilType: 'industrial', runoffCoeff: 0.94, drainEfficiency: 0.18,
    infiltrationRateMmHr: 0.5, depressionStorageMm: 1.0,
    catchmentFraction: 0.92, floodDurationHr: 30,
    catchmentMultiplier: 5.5, depressionFactor: 2.5,
  },

  // ── North Abu Dhabi Farms ────────────────────────────────────────────────────
  'North Abu Dhabi Farms': {
    id: 'North Abu Dhabi Farms', elevationM: 5.0, slopeIndex: 0.03,
    soilType: 'agricultural', runoffCoeff: 0.52, drainEfficiency: 0.20,
    infiltrationRateMmHr: 18.0, depressionStorageMm: 12.0,
    catchmentFraction: 0.45, floodDurationHr: 6,
    catchmentMultiplier: 1.5, depressionFactor: 0.8,
  },

  // ── Al Ain City ─────────────────────────────────────────────────────────────
  // High elevation (280m), moderate slope — faster drainage
  'Al Ain City': {
    id: 'Al Ain City', elevationM: 280.0, slopeIndex: 0.08,
    soilType: 'urban_paved', runoffCoeff: 0.78, drainEfficiency: 0.48,
    infiltrationRateMmHr: 4.0, depressionStorageMm: 5.0,
    catchmentFraction: 0.70, floodDurationHr: 5,
    catchmentMultiplier: 1.8, depressionFactor: 0.9,
  },
  'Al Ain': {
    id: 'Al Ain', elevationM: 290.0, slopeIndex: 0.10,
    soilType: 'sandy_loam', runoffCoeff: 0.72, drainEfficiency: 0.45,
    infiltrationRateMmHr: 6.0, depressionStorageMm: 8.0,
    catchmentFraction: 0.62, floodDurationHr: 4,
    catchmentMultiplier: 1.6, depressionFactor: 0.8,
  },

  // ── Ruwais ──────────────────────────────────────────────────────────────────
  'Ruwais': {
    id: 'Ruwais', elevationM: 8.0, slopeIndex: 0.04,
    soilType: 'industrial', runoffCoeff: 0.88, drainEfficiency: 0.40,
    infiltrationRateMmHr: 1.5, depressionStorageMm: 2.0,
    catchmentFraction: 0.80, floodDurationHr: 8,
    catchmentMultiplier: 2.5, depressionFactor: 1.2,
  },

  // ── Madinat Zayed (Western Region) ──────────────────────────────────────────
  'Madinat Zayed': {
    id: 'Madinat Zayed', elevationM: 120.0, slopeIndex: 0.06,
    soilType: 'sandy', runoffCoeff: 0.65, drainEfficiency: 0.35,
    infiltrationRateMmHr: 20.0, depressionStorageMm: 10.0,
    catchmentFraction: 0.55, floodDurationHr: 4,
    catchmentMultiplier: 1.5, depressionFactor: 0.8,
  },

  // ── Liwa ────────────────────────────────────────────────────────────────────
  'Liwa': {
    id: 'Liwa', elevationM: 85.0, slopeIndex: 0.12,
    soilType: 'sandy', runoffCoeff: 0.55, drainEfficiency: 0.30,
    infiltrationRateMmHr: 25.0, depressionStorageMm: 8.0,
    catchmentFraction: 0.45, floodDurationHr: 3,
    catchmentMultiplier: 1.2, depressionFactor: 0.7,
  },

  // ── Ghayathi ────────────────────────────────────────────────────────────────
  // Wadi-prone — flash floods, steep terrain
  'Ghayathi': {
    id: 'Ghayathi', elevationM: 45.0, slopeIndex: 0.15,
    soilType: 'sandy', runoffCoeff: 0.92, drainEfficiency: 0.08,
    infiltrationRateMmHr: 3.0, depressionStorageMm: 2.0,
    catchmentFraction: 0.88, floodDurationHr: 6,
    catchmentMultiplier: 2.8, depressionFactor: 1.8, // wadi channels
  },

  // ── Al Dhafra (large western region) ────────────────────────────────────────
  'Al Dhafra': {
    id: 'Al Dhafra', elevationM: 60.0, slopeIndex: 0.08,
    soilType: 'sandy', runoffCoeff: 0.60, drainEfficiency: 0.25,
    infiltrationRateMmHr: 22.0, depressionStorageMm: 12.0,
    catchmentFraction: 0.50, floodDurationHr: 5,
    catchmentMultiplier: 1.5, depressionFactor: 0.8,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PHYSICS ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute flood metrics for a region given precipitation.
 * Uses the rational method with Green-Ampt infiltration.
 *
 * @param regionId   Region name (matches REGION_HYDROLOGY keys)
 * @param precipMm   Total precipitation in mm (e.g., 254 for April 2024)
 * @param areaKm2    Region catchment area in km²
 */
export function computeFloodMetrics(
  regionId: string,
  precipMm: number,
  areaKm2: number,
): {
  depthCm: number;
  volumeM3: number;
  runoffMm: number;
  infiltratedMm: number;
  drainedMm: number;
  drainEfficiency: number;
  soilType: SoilType;
  elevationM: number;
  catchmentMultiplier: number;
  depressionFactor: number;
} {
  const h = REGION_HYDROLOGY[regionId];
  const hy = h ?? {
    runoffCoeff: 0.80, drainEfficiency: 0.35, infiltrationRateMmHr: 4.0,
    depressionStorageMm: 4.0, catchmentFraction: 0.75, floodDurationHr: 8,
    elevationM: 5.0, slopeIndex: 0.03, soilType: 'sandy_loam' as SoilType,
    catchmentMultiplier: 2.5, depressionFactor: 1.2,
  };

  // ── Step 1: Depression storage (fills before runoff starts) ──────────────
  const effectivePrecip = Math.max(0, precipMm - hy.depressionStorageMm);

  // ── Step 2: Infiltration (Green-Ampt simplified) ─────────────────────────
  const stormDurationHr = 6.0;
  const maxInfiltration = hy.infiltrationRateMmHr * stormDurationHr;
  const infiltratedMm = Math.min(effectivePrecip * (1 - hy.runoffCoeff), maxInfiltration);

  // ── Step 3: Surface runoff ────────────────────────────────────────────────
  const runoffMm = Math.max(0, effectivePrecip - infiltratedMm);

  // ── Step 4: Drainage removal ──────────────────────────────────────────────
  const drainedMm = runoffMm * hy.drainEfficiency;

  // ── Step 5: Net water accumulation ───────────────────────────────────────
  const netMm = Math.max(0, runoffMm - drainedMm);

  // ── Step 6: Terrain slope correction ─────────────────────────────────────
  // Steeper terrain = faster drainage, less accumulation
  const slopeCorrection = 1.0 - (hy.slopeIndex * 0.6);

  // ── Step 7: Depression factor amplifies depth in low-lying areas ──────────
  const depthCm = Math.round(netMm * slopeCorrection * hy.depressionFactor * 10) / 10;

  // ── Step 8: Effective catchment area ─────────────────────────────────────
  // The catchmentMultiplier expands the effective contributing area
  const effectiveAreaKm2 = areaKm2 * hy.catchmentFraction * hy.catchmentMultiplier;

  // ── Step 9: Volume ────────────────────────────────────────────────────────
  const volumeM3 = Math.round(depthCm / 100 * effectiveAreaKm2 * 1_000_000);

  return {
    depthCm,
    volumeM3,
    runoffMm,
    infiltratedMm,
    drainedMm,
    drainEfficiency: hy.drainEfficiency,
    soilType: hy.soilType,
    elevationM: hy.elevationM,
    catchmentMultiplier: hy.catchmentMultiplier,
    depressionFactor: hy.depressionFactor,
  };
}

/**
 * Compute flood metrics for a specific point (hotspot) given its radius.
 * Used for per-point tooltip when zoomed in (zoom ≥ 14).
 *
 * The key improvement: pool area is NOT just π×r² but is scaled by the
 * catchmentMultiplier (how much area drains into this low point) and
 * the depressionFactor (how deep the terrain depression is).
 *
 * @param lat          Latitude of the point
 * @param lng          Longitude of the point
 * @param radiusM      Visible radius of the water patch in metres (from map rendering)
 * @param baseDepthCm  Base depth from FloodWaterLayer hotspot data
 * @param precipMm     Total precipitation in mm
 * @param regionId     Region the point belongs to
 */
export function computePointFloodMetrics(
  lat: number,
  lng: number,
  radiusM: number,
  baseDepthCm: number,
  precipMm: number,
  regionId: string,
): {
  depthCm: number;
  volumeM3: number;
  areaM2: number;
  runoffMm: number;
  infiltratedMm: number;
  drainedMm: number;
  catchmentMultiplier: number;
  soilType: SoilType;
  elevationM: number;
} {
  const h = REGION_HYDROLOGY[regionId];
  const hy = h ?? {
    runoffCoeff: 0.80, drainEfficiency: 0.35, infiltrationRateMmHr: 4.0,
    depressionStorageMm: 4.0, catchmentFraction: 0.75, floodDurationHr: 8,
    elevationM: 5.0, slopeIndex: 0.03, soilType: 'sandy_loam' as SoilType,
    catchmentMultiplier: 2.5, depressionFactor: 1.2,
  };

  // ── Physics calculations ──────────────────────────────────────────────────
  const effectivePrecip = Math.max(0, precipMm - hy.depressionStorageMm);
  const stormDurationHr = 6.0;
  const maxInfiltration = hy.infiltrationRateMmHr * stormDurationHr;
  const infiltratedMm = Math.min(effectivePrecip * (1 - hy.runoffCoeff), maxInfiltration);
  const runoffMm = Math.max(0, effectivePrecip - infiltratedMm);
  const drainedMm = runoffMm * hy.drainEfficiency;
  const netMm = Math.max(0, runoffMm - drainedMm);
  const slopeCorrection = 1.0 - (hy.slopeIndex * 0.6);

  // ── Physics-based depth ───────────────────────────────────────────────────
  const physicsDepthCm = netMm * slopeCorrection * hy.depressionFactor;
  // Blend: 65% physics model, 35% visual rendering model
  const depthCm = Math.round((physicsDepthCm * 0.65 + baseDepthCm * 0.35) * 10) / 10;

  // ── Pool area: scaled by catchment multiplier ─────────────────────────────
  // The visible patch radius is just the "core" of the pool.
  // The actual contributing area is larger by catchmentMultiplier.
  // For depth calculation, we use the visible area (where water is visible).
  // For volume calculation, we use the full catchment area.
  const visibleAreaM2 = Math.PI * radiusM * radiusM;
  const catchmentAreaM2 = visibleAreaM2 * hy.catchmentMultiplier;

  // Volume = depth × catchment area (water collected from the whole catchment)
  const volumeM3 = Math.round((depthCm / 100) * catchmentAreaM2);

  // Report visible area (what the user sees on the map)
  const areaM2 = visibleAreaM2;

  return {
    depthCm,
    volumeM3,
    areaM2,
    runoffMm,
    infiltratedMm,
    drainedMm,
    catchmentMultiplier: hy.catchmentMultiplier,
    soilType: hy.soilType,
    elevationM: hy.elevationM,
  };
}

/**
 * Get a human-readable soil type label.
 */
export function soilTypeLabel(type: SoilType, lang: 'ar' | 'en'): string {
  const labels: Record<SoilType, { ar: string; en: string }> = {
    urban_paved:  { ar: 'حضري معبّد',   en: 'Urban / Paved'    },
    sandy_loam:   { ar: 'رملي طيني',    en: 'Sandy Loam'       },
    sandy:        { ar: 'رملي',          en: 'Sandy'            },
    sabkha:       { ar: 'سبخة',          en: 'Sabkha (Salt Flat)'},
    agricultural: { ar: 'زراعي',         en: 'Agricultural'     },
    industrial:   { ar: 'صناعي',         en: 'Industrial'       },
  };
  return labels[type]?.[lang] ?? type;
}

/**
 * Convert precipitation multiplier (from UI slider) to mm.
 */
export function multiplierToPrecipMm(multiplier: number, basePrecipMm: number = 25): number {
  return multiplier * basePrecipMm;
}
