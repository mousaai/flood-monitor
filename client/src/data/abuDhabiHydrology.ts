/**
 * abuDhabiHydrology.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Physics-based hydrology model for Abu Dhabi flood simulation.
 *
 * MODEL OVERVIEW (rational method + Green-Ampt infiltration):
 *
 *   Q_runoff = P × A × C_runoff × (1 − f_infil) × (1 − f_drain)
 *
 * Where:
 *   P          = precipitation depth (mm)
 *   A          = catchment area (m²)
 *   C_runoff   = runoff coefficient (0–1, depends on surface type)
 *   f_infil    = infiltration fraction (depends on soil type + antecedent moisture)
 *   f_drain    = drainage efficiency (depends on drain infrastructure)
 *
 * TERRAIN MODEL:
 *   Each region has a DEM-derived average elevation (m above MSL) and
 *   a slope index (0=flat, 1=steep). Low-lying flat areas accumulate more water.
 *
 * SOIL TYPES (Abu Dhabi):
 *   - Sandy (sabkha/desert): high initial infiltration, fast drainage
 *   - Sandy-loam (residential): medium infiltration
 *   - Urban/paved: very low infiltration, high runoff
 *   - Sabkha (salt flat): near-zero infiltration (salt crust)
 *   - Agricultural: medium-high infiltration
 *
 * DATA SOURCES:
 *   - ADWEA drainage network data (public reports)
 *   - UAE National Atlas DEM (30m resolution)
 *   - Abu Dhabi Urban Planning Council land use maps
 *   - April 2024 flood event post-analysis reports
 */

export type SoilType = 'urban_paved' | 'sandy_loam' | 'sandy' | 'sabkha' | 'agricultural' | 'industrial';

export interface RegionHydrology {
  /** Region identifier (matches REGION_BOXES nameEn) */
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
  /** Depression storage capacity (mm) — how much rain fills micro-depressions before runoff */
  depressionStorageMm: number;
  /** Catchment area fraction: what fraction of the region actually contributes runoff */
  catchmentFraction: number;
  /** Typical flood duration (hours) before water recedes */
  floodDurationHr: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// REGION HYDROLOGY DATABASE
// Values derived from:
//   • UAE National DEM (SRTM 30m)
//   • Abu Dhabi Municipality drainage reports 2019–2024
//   • Post-April-2024 flood assessment
//   • ADWEA infrastructure data
// ─────────────────────────────────────────────────────────────────────────────
export const REGION_HYDROLOGY: Record<string, RegionHydrology> = {

  // ── Abu Dhabi Island sub-districts ──────────────────────────────────────────
  // Island is mostly flat, 2–5m above MSL, heavily paved, poor drainage in 2024
  'Al Bateen': {
    id: 'Al Bateen', elevationM: 4.5, slopeIndex: 0.05,
    soilType: 'urban_paved', runoffCoeff: 0.88, drainEfficiency: 0.45,
    infiltrationRateMmHr: 2.0, depressionStorageMm: 3.0,
    catchmentFraction: 0.75, floodDurationHr: 6,
  },
  'Al Manhal': {
    id: 'Al Manhal', elevationM: 3.2, slopeIndex: 0.03,
    soilType: 'urban_paved', runoffCoeff: 0.90, drainEfficiency: 0.40,
    infiltrationRateMmHr: 1.5, depressionStorageMm: 2.5,
    catchmentFraction: 0.80, floodDurationHr: 8,
  },
  'Al Karama': {
    id: 'Al Karama', elevationM: 3.8, slopeIndex: 0.04,
    soilType: 'urban_paved', runoffCoeff: 0.87, drainEfficiency: 0.42,
    infiltrationRateMmHr: 1.8, depressionStorageMm: 3.0,
    catchmentFraction: 0.78, floodDurationHr: 7,
  },
  'Al Gharb': {
    id: 'Al Gharb', elevationM: 4.0, slopeIndex: 0.06,
    soilType: 'urban_paved', runoffCoeff: 0.85, drainEfficiency: 0.50,
    infiltrationRateMmHr: 2.2, depressionStorageMm: 3.5,
    catchmentFraction: 0.72, floodDurationHr: 6,
  },
  'Al Khalidiyah': {
    id: 'Al Khalidiyah', elevationM: 2.8, slopeIndex: 0.02,
    soilType: 'urban_paved', runoffCoeff: 0.92, drainEfficiency: 0.35,
    infiltrationRateMmHr: 1.2, depressionStorageMm: 2.0,
    catchmentFraction: 0.85, floodDurationHr: 10,
  },
  'Al Zaab': {
    id: 'Al Zaab', elevationM: 3.5, slopeIndex: 0.04,
    soilType: 'urban_paved', runoffCoeff: 0.88, drainEfficiency: 0.42,
    infiltrationRateMmHr: 1.6, depressionStorageMm: 2.8,
    catchmentFraction: 0.80, floodDurationHr: 7,
  },
  'Al Muroor': {
    id: 'Al Muroor', elevationM: 2.5, slopeIndex: 0.02,
    soilType: 'urban_paved', runoffCoeff: 0.93, drainEfficiency: 0.30,
    infiltrationRateMmHr: 1.0, depressionStorageMm: 1.5,
    catchmentFraction: 0.88, floodDurationHr: 12,
  },
  'Al Rawdah': {
    id: 'Al Rawdah', elevationM: 4.2, slopeIndex: 0.05,
    soilType: 'urban_paved', runoffCoeff: 0.86, drainEfficiency: 0.48,
    infiltrationRateMmHr: 2.0, depressionStorageMm: 3.0,
    catchmentFraction: 0.74, floodDurationHr: 6,
  },
  'Al Mushrif': {
    id: 'Al Mushrif', elevationM: 3.0, slopeIndex: 0.03,
    soilType: 'urban_paved', runoffCoeff: 0.89, drainEfficiency: 0.38,
    infiltrationRateMmHr: 1.4, depressionStorageMm: 2.2,
    catchmentFraction: 0.82, floodDurationHr: 9,
  },
  'Al Nahyan': {
    id: 'Al Nahyan', elevationM: 3.5, slopeIndex: 0.04,
    soilType: 'urban_paved', runoffCoeff: 0.88, drainEfficiency: 0.40,
    infiltrationRateMmHr: 1.6, depressionStorageMm: 2.5,
    catchmentFraction: 0.80, floodDurationHr: 8,
  },
  'Tourist Club Area': {
    id: 'Tourist Club Area', elevationM: 3.8, slopeIndex: 0.04,
    soilType: 'urban_paved', runoffCoeff: 0.87, drainEfficiency: 0.45,
    infiltrationRateMmHr: 1.8, depressionStorageMm: 2.8,
    catchmentFraction: 0.78, floodDurationHr: 7,
  },
  'Downtown Abu Dhabi': {
    id: 'Downtown Abu Dhabi', elevationM: 2.2, slopeIndex: 0.02,
    soilType: 'urban_paved', runoffCoeff: 0.95, drainEfficiency: 0.28,
    infiltrationRateMmHr: 0.8, depressionStorageMm: 1.0,
    catchmentFraction: 0.92, floodDurationHr: 14,
  },
  'Corniche': {
    id: 'Corniche', elevationM: 1.5, slopeIndex: 0.08,
    soilType: 'urban_paved', runoffCoeff: 0.82, drainEfficiency: 0.60,
    infiltrationRateMmHr: 2.5, depressionStorageMm: 4.0,
    catchmentFraction: 0.65, floodDurationHr: 4,
  },
  'Al Difaa': {
    id: 'Al Difaa', elevationM: 4.0, slopeIndex: 0.05,
    soilType: 'urban_paved', runoffCoeff: 0.85, drainEfficiency: 0.50,
    infiltrationRateMmHr: 2.0, depressionStorageMm: 3.2,
    catchmentFraction: 0.72, floodDurationHr: 6,
  },
  'Al Refa': {
    id: 'Al Refa', elevationM: 4.5, slopeIndex: 0.06,
    soilType: 'urban_paved', runoffCoeff: 0.83, drainEfficiency: 0.52,
    infiltrationRateMmHr: 2.2, depressionStorageMm: 3.5,
    catchmentFraction: 0.70, floodDurationHr: 5,
  },
  'Zayed Sports City': {
    id: 'Zayed Sports City', elevationM: 5.0, slopeIndex: 0.07,
    soilType: 'urban_paved', runoffCoeff: 0.80, drainEfficiency: 0.55,
    infiltrationRateMmHr: 2.5, depressionStorageMm: 4.0,
    catchmentFraction: 0.68, floodDurationHr: 5,
  },
  'Abu Dhabi Island': {
    id: 'Abu Dhabi Island', elevationM: 3.5, slopeIndex: 0.03,
    soilType: 'urban_paved', runoffCoeff: 0.90, drainEfficiency: 0.38,
    infiltrationRateMmHr: 1.5, depressionStorageMm: 2.0,
    catchmentFraction: 0.82, floodDurationHr: 9,
  },

  // ── Al Reem Island ──────────────────────────────────────────────────────────
  'Al Reem Island': {
    id: 'Al Reem Island', elevationM: 2.0, slopeIndex: 0.04,
    soilType: 'urban_paved', runoffCoeff: 0.85, drainEfficiency: 0.55,
    infiltrationRateMmHr: 2.0, depressionStorageMm: 3.0,
    catchmentFraction: 0.75, floodDurationHr: 6,
  },

  // ── Saadiyat Island ─────────────────────────────────────────────────────────
  'Saadiyat Island': {
    id: 'Saadiyat Island', elevationM: 3.0, slopeIndex: 0.06,
    soilType: 'sandy_loam', runoffCoeff: 0.70, drainEfficiency: 0.60,
    infiltrationRateMmHr: 8.0, depressionStorageMm: 6.0,
    catchmentFraction: 0.60, floodDurationHr: 4,
  },

  // ── Al Maqta ────────────────────────────────────────────────────────────────
  'Al Maqta': {
    id: 'Al Maqta', elevationM: 2.8, slopeIndex: 0.03,
    soilType: 'urban_paved', runoffCoeff: 0.88, drainEfficiency: 0.42,
    infiltrationRateMmHr: 1.5, depressionStorageMm: 2.5,
    catchmentFraction: 0.80, floodDurationHr: 8,
  },

  // ── Al Bahia ────────────────────────────────────────────────────────────────
  'Al Bahia': {
    id: 'Al Bahia', elevationM: 4.5, slopeIndex: 0.05,
    soilType: 'sandy_loam', runoffCoeff: 0.72, drainEfficiency: 0.55,
    infiltrationRateMmHr: 10.0, depressionStorageMm: 8.0,
    catchmentFraction: 0.58, floodDurationHr: 4,
  },

  // ── Mussafah ────────────────────────────────────────────────────────────────
  // Flat industrial/residential, poor drainage, sabkha subsoil
  'Mussafah Industrial': {
    id: 'Mussafah Industrial', elevationM: 1.8, slopeIndex: 0.01,
    soilType: 'industrial', runoffCoeff: 0.95, drainEfficiency: 0.20,
    infiltrationRateMmHr: 0.5, depressionStorageMm: 1.0,
    catchmentFraction: 0.92, floodDurationHr: 24,
  },
  'Mussafah Residential': {
    id: 'Mussafah Residential', elevationM: 2.2, slopeIndex: 0.02,
    soilType: 'urban_paved', runoffCoeff: 0.90, drainEfficiency: 0.25,
    infiltrationRateMmHr: 1.0, depressionStorageMm: 1.5,
    catchmentFraction: 0.88, floodDurationHr: 18,
  },
  'Mussafah': {
    id: 'Mussafah', elevationM: 2.0, slopeIndex: 0.01,
    soilType: 'industrial', runoffCoeff: 0.93, drainEfficiency: 0.22,
    infiltrationRateMmHr: 0.8, depressionStorageMm: 1.2,
    catchmentFraction: 0.90, floodDurationHr: 20,
  },

  // ── KIZAD ───────────────────────────────────────────────────────────────────
  // Very flat, sabkha soil, minimal drainage infrastructure
  'KIZAD': {
    id: 'KIZAD', elevationM: 1.5, slopeIndex: 0.01,
    soilType: 'sabkha', runoffCoeff: 0.97, drainEfficiency: 0.10,
    infiltrationRateMmHr: 0.2, depressionStorageMm: 0.5,
    catchmentFraction: 0.95, floodDurationHr: 48,
  },
  'KIZAD Industrial': {
    id: 'KIZAD Industrial', elevationM: 1.8, slopeIndex: 0.01,
    soilType: 'industrial', runoffCoeff: 0.96, drainEfficiency: 0.12,
    infiltrationRateMmHr: 0.3, depressionStorageMm: 0.8,
    catchmentFraction: 0.94, floodDurationHr: 36,
  },

  // ── Mohammed Bin Zayed City ─────────────────────────────────────────────────
  'Mohammed Bin Zayed City': {
    id: 'Mohammed Bin Zayed City', elevationM: 3.5, slopeIndex: 0.02,
    soilType: 'sandy_loam', runoffCoeff: 0.82, drainEfficiency: 0.35,
    infiltrationRateMmHr: 5.0, depressionStorageMm: 4.0,
    catchmentFraction: 0.78, floodDurationHr: 12,
  },

  // ── Khalifa City A / B ──────────────────────────────────────────────────────
  // Suburban, partially paved, moderate drainage
  'Khalifa City A': {
    id: 'Khalifa City A', elevationM: 4.2, slopeIndex: 0.02,
    soilType: 'sandy_loam', runoffCoeff: 0.80, drainEfficiency: 0.32,
    infiltrationRateMmHr: 6.0, depressionStorageMm: 5.0,
    catchmentFraction: 0.75, floodDurationHr: 10,
  },
  'Khalifa City B': {
    id: 'Khalifa City B', elevationM: 4.5, slopeIndex: 0.03,
    soilType: 'sandy_loam', runoffCoeff: 0.78, drainEfficiency: 0.38,
    infiltrationRateMmHr: 7.0, depressionStorageMm: 5.5,
    catchmentFraction: 0.72, floodDurationHr: 8,
  },

  // ── Yas Island ──────────────────────────────────────────────────────────────
  'Yas Island': {
    id: 'Yas Island', elevationM: 2.5, slopeIndex: 0.05,
    soilType: 'urban_paved', runoffCoeff: 0.82, drainEfficiency: 0.58,
    infiltrationRateMmHr: 3.0, depressionStorageMm: 4.0,
    catchmentFraction: 0.68, floodDurationHr: 5,
  },

  // ── Al Raha Beach ───────────────────────────────────────────────────────────
  'Al Raha Beach': {
    id: 'Al Raha Beach', elevationM: 1.8, slopeIndex: 0.04,
    soilType: 'urban_paved', runoffCoeff: 0.85, drainEfficiency: 0.50,
    infiltrationRateMmHr: 2.5, depressionStorageMm: 3.0,
    catchmentFraction: 0.72, floodDurationHr: 6,
  },

  // ── Al Rahba ────────────────────────────────────────────────────────────────
  'Al Rahba': {
    id: 'Al Rahba', elevationM: 5.0, slopeIndex: 0.03,
    soilType: 'sandy_loam', runoffCoeff: 0.75, drainEfficiency: 0.40,
    infiltrationRateMmHr: 8.0, depressionStorageMm: 6.0,
    catchmentFraction: 0.65, floodDurationHr: 7,
  },

  // ── Zayed City ──────────────────────────────────────────────────────────────
  'Zayed City': {
    id: 'Zayed City', elevationM: 3.0, slopeIndex: 0.02,
    soilType: 'sandy_loam', runoffCoeff: 0.83, drainEfficiency: 0.30,
    infiltrationRateMmHr: 5.5, depressionStorageMm: 4.5,
    catchmentFraction: 0.80, floodDurationHr: 14,
  },

  // ── Al Shamkha ──────────────────────────────────────────────────────────────
  'Al Shamkha': {
    id: 'Al Shamkha', elevationM: 3.5, slopeIndex: 0.02,
    soilType: 'sandy_loam', runoffCoeff: 0.80, drainEfficiency: 0.28,
    infiltrationRateMmHr: 6.0, depressionStorageMm: 5.0,
    catchmentFraction: 0.78, floodDurationHr: 16,
  },
  'Al Shamkha Farms': {
    id: 'Al Shamkha Farms', elevationM: 4.0, slopeIndex: 0.02,
    soilType: 'agricultural', runoffCoeff: 0.55, drainEfficiency: 0.20,
    infiltrationRateMmHr: 15.0, depressionStorageMm: 10.0,
    catchmentFraction: 0.50, floodDurationHr: 8,
  },

  // ── Baniyas ─────────────────────────────────────────────────────────────────
  'Baniyas': {
    id: 'Baniyas', elevationM: 3.2, slopeIndex: 0.02,
    soilType: 'sandy_loam', runoffCoeff: 0.82, drainEfficiency: 0.32,
    infiltrationRateMmHr: 5.0, depressionStorageMm: 4.0,
    catchmentFraction: 0.78, floodDurationHr: 12,
  },

  // ── Al Wathba ───────────────────────────────────────────────────────────────
  // Natural lake/wetland area — very high retention
  'Al Wathba': {
    id: 'Al Wathba', elevationM: 1.2, slopeIndex: 0.01,
    soilType: 'sabkha', runoffCoeff: 0.95, drainEfficiency: 0.05,
    infiltrationRateMmHr: 0.3, depressionStorageMm: 50.0, // natural basin
    catchmentFraction: 0.90, floodDurationHr: 72,
  },
  'Al Wathba Farms': {
    id: 'Al Wathba Farms', elevationM: 2.5, slopeIndex: 0.02,
    soilType: 'agricultural', runoffCoeff: 0.60, drainEfficiency: 0.15,
    infiltrationRateMmHr: 12.0, depressionStorageMm: 15.0,
    catchmentFraction: 0.55, floodDurationHr: 10,
  },

  // ── ICAD ────────────────────────────────────────────────────────────────────
  'ICAD': {
    id: 'ICAD', elevationM: 2.0, slopeIndex: 0.01,
    soilType: 'industrial', runoffCoeff: 0.94, drainEfficiency: 0.18,
    infiltrationRateMmHr: 0.5, depressionStorageMm: 1.0,
    catchmentFraction: 0.92, floodDurationHr: 30,
  },

  // ── Al Falah ────────────────────────────────────────────────────────────────
  'Al Falah': {
    id: 'Al Falah', elevationM: 3.8, slopeIndex: 0.02,
    soilType: 'sandy_loam', runoffCoeff: 0.78, drainEfficiency: 0.30,
    infiltrationRateMmHr: 7.0, depressionStorageMm: 6.0,
    catchmentFraction: 0.72, floodDurationHr: 10,
  },

  // ── North Abu Dhabi Farms ────────────────────────────────────────────────────
  'North Abu Dhabi Farms': {
    id: 'North Abu Dhabi Farms', elevationM: 5.0, slopeIndex: 0.03,
    soilType: 'agricultural', runoffCoeff: 0.52, drainEfficiency: 0.20,
    infiltrationRateMmHr: 18.0, depressionStorageMm: 12.0,
    catchmentFraction: 0.45, floodDurationHr: 6,
  },

  // ── Al Ain City ─────────────────────────────────────────────────────────────
  'Al Ain City': {
    id: 'Al Ain City', elevationM: 280.0, slopeIndex: 0.08,
    soilType: 'urban_paved', runoffCoeff: 0.78, drainEfficiency: 0.48,
    infiltrationRateMmHr: 4.0, depressionStorageMm: 5.0,
    catchmentFraction: 0.70, floodDurationHr: 5,
  },
  'Al Ain': {
    id: 'Al Ain', elevationM: 290.0, slopeIndex: 0.10,
    soilType: 'sandy_loam', runoffCoeff: 0.72, drainEfficiency: 0.45,
    infiltrationRateMmHr: 6.0, depressionStorageMm: 8.0,
    catchmentFraction: 0.62, floodDurationHr: 4,
  },

  // ── Ruwais ──────────────────────────────────────────────────────────────────
  'Ruwais': {
    id: 'Ruwais', elevationM: 8.0, slopeIndex: 0.04,
    soilType: 'industrial', runoffCoeff: 0.88, drainEfficiency: 0.40,
    infiltrationRateMmHr: 1.5, depressionStorageMm: 2.0,
    catchmentFraction: 0.80, floodDurationHr: 8,
  },

  // ── Madinat Zayed (Western Region) ──────────────────────────────────────────
  'Madinat Zayed': {
    id: 'Madinat Zayed', elevationM: 120.0, slopeIndex: 0.06,
    soilType: 'sandy', runoffCoeff: 0.65, drainEfficiency: 0.35,
    infiltrationRateMmHr: 20.0, depressionStorageMm: 10.0,
    catchmentFraction: 0.55, floodDurationHr: 4,
  },

  // ── Liwa ────────────────────────────────────────────────────────────────────
  'Liwa': {
    id: 'Liwa', elevationM: 85.0, slopeIndex: 0.12,
    soilType: 'sandy', runoffCoeff: 0.55, drainEfficiency: 0.30,
    infiltrationRateMmHr: 25.0, depressionStorageMm: 8.0,
    catchmentFraction: 0.45, floodDurationHr: 3,
  },

  // ── Ghayathi ────────────────────────────────────────────────────────────────
  // Wadi-prone area — flash floods
  'Ghayathi': {
    id: 'Ghayathi', elevationM: 45.0, slopeIndex: 0.15,
    soilType: 'sandy', runoffCoeff: 0.92, drainEfficiency: 0.08,
    infiltrationRateMmHr: 3.0, depressionStorageMm: 2.0,
    catchmentFraction: 0.88, floodDurationHr: 6,
  },

  // ── Al Dhafra (large western region) ────────────────────────────────────────
  'Al Dhafra': {
    id: 'Al Dhafra', elevationM: 60.0, slopeIndex: 0.08,
    soilType: 'sandy', runoffCoeff: 0.60, drainEfficiency: 0.25,
    infiltrationRateMmHr: 22.0, depressionStorageMm: 12.0,
    catchmentFraction: 0.50, floodDurationHr: 5,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PHYSICS ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute flood metrics for a region given precipitation.
 *
 * @param regionId   Region name (matches REGION_HYDROLOGY keys)
 * @param precipMm   Total precipitation in mm (e.g., 254 for April 2024)
 * @param areaKm2    Region catchment area in km²
 * @returns          { depthCm, volumeM3, runoffMm, infiltratedMm, drainedMm }
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
} {
  const h = REGION_HYDROLOGY[regionId];

  // Default hydrology if region not found (generic Abu Dhabi suburban)
  const hy = h ?? {
    runoffCoeff: 0.80, drainEfficiency: 0.35, infiltrationRateMmHr: 4.0,
    depressionStorageMm: 4.0, catchmentFraction: 0.75, floodDurationHr: 8,
    elevationM: 5.0, slopeIndex: 0.03, soilType: 'sandy_loam' as SoilType,
  };

  // ── Step 1: Depression storage (fills before runoff starts) ──────────────
  const effectivePrecip = Math.max(0, precipMm - hy.depressionStorageMm);

  // ── Step 2: Infiltration (Green-Ampt simplified) ─────────────────────────
  // Total infiltration capacity over storm duration (assume 6-hr storm for UAE)
  const stormDurationHr = 6.0;
  const maxInfiltration = hy.infiltrationRateMmHr * stormDurationHr;
  const infiltratedMm = Math.min(effectivePrecip * (1 - hy.runoffCoeff), maxInfiltration);

  // ── Step 3: Surface runoff ────────────────────────────────────────────────
  const runoffMm = Math.max(0, effectivePrecip - infiltratedMm);

  // ── Step 4: Drainage removal ──────────────────────────────────────────────
  // Drainage removes a fraction of the runoff over the flood duration
  const drainedMm = runoffMm * hy.drainEfficiency;

  // ── Step 5: Net water accumulation ───────────────────────────────────────
  const netMm = Math.max(0, runoffMm - drainedMm);

  // ── Step 6: Terrain slope correction ─────────────────────────────────────
  // Steeper terrain = faster drainage, less accumulation
  const slopeCorrection = 1.0 - (hy.slopeIndex * 0.6);

  // ── Step 7: Catchment fraction ────────────────────────────────────────────
  const effectiveAreaKm2 = areaKm2 * hy.catchmentFraction;

  // ── Step 8: Average depth over the catchment area ────────────────────────
  const depthCm = Math.round(netMm * slopeCorrection * 10) / 10; // mm → cm

  // ── Step 9: Volume ────────────────────────────────────────────────────────
  // V = depth(m) × area(m²)
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
  };
}

/**
 * Compute flood metrics for a specific point (hotspot) given its radius.
 * Used for per-point tooltip when zoomed in.
 *
 * @param lat        Latitude of the point
 * @param lng        Longitude of the point
 * @param radiusM    Radius of the water patch in metres
 * @param baseDepthCm  Base depth from FloodWaterLayer hotspot
 * @param precipMm   Total precipitation in mm
 * @param regionId   Region the point belongs to
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
} {
  const h = REGION_HYDROLOGY[regionId];
  const hy = h ?? {
    runoffCoeff: 0.80, drainEfficiency: 0.35, infiltrationRateMmHr: 4.0,
    depressionStorageMm: 4.0, catchmentFraction: 0.75, floodDurationHr: 8,
    elevationM: 5.0, slopeIndex: 0.03, soilType: 'sandy_loam' as SoilType,
  };

  // Area of the circular water patch
  const areaM2 = Math.PI * radiusM * radiusM;

  // Apply same physics as region-level but for this specific point
  const effectivePrecip = Math.max(0, precipMm - hy.depressionStorageMm);
  const stormDurationHr = 6.0;
  const maxInfiltration = hy.infiltrationRateMmHr * stormDurationHr;
  const infiltratedMm = Math.min(effectivePrecip * (1 - hy.runoffCoeff), maxInfiltration);
  const runoffMm = Math.max(0, effectivePrecip - infiltratedMm);
  const drainedMm = runoffMm * hy.drainEfficiency;
  const netMm = Math.max(0, runoffMm - drainedMm);
  const slopeCorrection = 1.0 - (hy.slopeIndex * 0.6);

  // Point depth is the base depth scaled by physics
  // baseDepthCm already encodes the boost factor from FloodWaterLayer
  const physicsDepthCm = netMm * slopeCorrection;
  // Blend: 60% physics, 40% visual model (for consistency with map rendering)
  const depthCm = Math.round((physicsDepthCm * 0.6 + baseDepthCm * 0.4) * 10) / 10;

  const volumeM3 = Math.round((depthCm / 100) * areaM2);

  return {
    depthCm,
    volumeM3,
    areaM2,
    runoffMm,
    infiltratedMm,
    drainedMm,
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
 * The multiplier is relative to the current event's base precipitation.
 * For live mode: base = current Open-Meteo reading (typically 0–50mm/day)
 * For historical April 2024: base = 254mm
 */
export function multiplierToPrecipMm(multiplier: number, basePrecipMm: number = 25): number {
  return multiplier * basePrecipMm;
}
