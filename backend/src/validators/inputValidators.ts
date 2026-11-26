import { z } from 'zod';
import { booleanValid, kinks, polygon } from '@turf/turf';
import { AirspaceZoneFeature, LngLat } from '../types/index.js';

export const SYNTHETIC_DISCLAIMER =
  'PROTOTYPE SYNTHETIC DATA DISCLAIMER: TENORIX uses synthetic demo airspace geometries and prototype rules for hackathon demonstration only. It does NOT provide official aviation clearance, legal flight authorization, or guaranteed flight safety.';

export const DATASET_SOURCE = 'SYNTHETIC_DEMO_DATASET_V1';
export const RULE_VERSION = '2026.1-PROTO';

export const coordinateSchema = z
  .tuple([
    z.number().finite().min(-180, 'Longitude must be >= -180').max(180, 'Longitude must be <= 180'),
    z.number().finite().min(-90, 'Latitude must be >= -90').max(90, 'Latitude must be <= 90'),
  ])
  .describe('[longitude, latitude]');

export const flightPlanPayloadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Flight plan name is required')
    .max(120, 'Flight plan name must be 120 characters or fewer')
    .default('Untitled Drone Route'),
  coordinates: z
    .array(coordinateSchema)
    .min(2, 'At least two route coordinates (start and destination) are required')
    .max(200, 'Route cannot exceed 200 coordinates'),
  originalCoordinates: z.array(coordinateSchema).min(2).max(200).optional(),
  plannedAltitudeMeters: z
    .number()
    .finite('Altitude must be a finite number')
    .min(0, 'Planned altitude cannot be negative')
    .max(5000, 'Planned altitude must not exceed 5000 meters in this prototype'),
  droneModel: z
    .string()
    .trim()
    .max(80)
    .optional()
    .default('Generic Quadcopter UAV'),
  flightSpeedMps: z
    .number()
    .finite()
    .min(1, 'Flight speed must be at least 1 m/s')
    .max(60, 'Flight speed must be <= 60 m/s')
    .optional()
    .default(12),
  permissionGranted: z.boolean().optional().default(false),
  flightPlanId: z.string().trim().max(80).optional(),
  isDemoSeed: z.boolean().optional().default(false),
  customZones: z.array(z.any()).max(200).optional(),
  airspaceSource: z.string().trim().max(160).optional(),
});

export const pdfUploadSchema = z.object({
  filename: z.string().trim().min(1).max(200).optional().default('airspace-briefing.pdf'),
  pdfBase64: z.string().min(16, 'Uploaded PDF payload is empty or invalid.'),
});

export const flightPlanUpdateSchema = flightPlanPayloadSchema.partial();

export const alternativeRouteRequestSchema = z.object({
  coordinates: z
    .array(coordinateSchema)
    .min(2, 'At least two route coordinates are required')
    .max(200),
  plannedAltitudeMeters: z.number().finite().min(0).max(5000),
  flightSpeedMps: z.number().finite().min(1).max(60).optional().default(12),
  permissionGranted: z.boolean().optional().default(false),
});

export const restrictionLevelSchema = z.enum(['RED', 'YELLOW', 'GREEN']);

export const zonePayloadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Zone name is required')
    .max(100, 'Zone name must be 100 characters or fewer'),
  restrictionLevel: restrictionLevelSchema,
  zoneType: z.string().trim().max(60).optional(),
  description: z.string().trim().max(400).optional(),
  coordinates: z
    .array(coordinateSchema)
    .min(3, 'A polygon zone requires at least 3 distinct coordinates')
    .max(200, 'Zone polygon cannot exceed 200 vertices'),
  minAltitudeMeters: z.number().finite().min(0).max(5000).nullable().optional(),
  maxAltitudeMeters: z.number().finite().min(0).max(5000).nullable().optional(),
  permissionRequired: z.boolean().optional(),
});

export const zoneUpdateSchema = zonePayloadSchema.partial();

/**
 * Ensures a polygon coordinate ring is explicitly closed (first === last).
 */
export function normalizeClosedRing(coords: LngLat[]): LngLat[] {
  if (coords.length === 0) return [];
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return coords;
  }
  return [...coords, [first[0], first[1]]];
}

/**
 * Validates that a coordinate array represents valid finite [lng, lat] pairs.
 */
export function validateCoordinates(coords: unknown): { valid: boolean; error?: string; coordinates?: LngLat[] } {
  const parsed = z.array(coordinateSchema).min(2).safeParse(coords);
  if (!parsed.success) {
    return {
      valid: false,
      error: parsed.error.issues.map((i) => i.message).join('; '),
    };
  }
  return { valid: true, coordinates: parsed.data };
}

/**
 * Validates that a GeoJSON Polygon/MultiPolygon feature is structurally sound,
 * closed, and free of self-intersections.
 */
export function validateZonePolygon(zone: AirspaceZoneFeature): { valid: boolean; reason?: string } {
  if (!zone || zone.type !== 'Feature' || !zone.geometry) {
    return { valid: false, reason: 'Missing GeoJSON Feature or geometry.' };
  }

  if (zone.geometry.type === 'Polygon') {
    const rings = zone.geometry.coordinates as number[][][];
    if (!Array.isArray(rings) || rings.length === 0) {
      return { valid: false, reason: 'Polygon has no coordinate rings.' };
    }
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 4) {
        return { valid: false, reason: 'Polygon ring must contain at least 4 coordinates.' };
      }
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
        return { valid: false, reason: 'Polygon ring is not closed (first and last coordinates differ).' };
      }
      for (const pt of ring) {
        if (
          !Array.isArray(pt) ||
          pt.length < 2 ||
          !Number.isFinite(pt[0]) ||
          !Number.isFinite(pt[1]) ||
          pt[0] < -180 ||
          pt[0] > 180 ||
          pt[1] < -90 ||
          pt[1] > 90
        ) {
          return { valid: false, reason: 'Polygon ring contains out-of-range or non-finite coordinates.' };
        }
      }
    }

    try {
      const poly = polygon(rings);
      if (!booleanValid(poly)) {
        return { valid: false, reason: 'Polygon failed GeoJSON validity check.' };
      }
      const selfIntersections = kinks(poly);
      if (selfIntersections.features.length > 0) {
        return { valid: false, reason: 'Polygon has self-intersecting edges.' };
      }
    } catch (err) {
      return {
        valid: false,
        reason: err instanceof Error ? err.message : 'Unable to parse Polygon geometry.',
      };
    }

    return { valid: true };
  }

  if (zone.geometry.type === 'MultiPolygon') {
    const polys = zone.geometry.coordinates as number[][][][];
    if (!Array.isArray(polys) || polys.length === 0) {
      return { valid: false, reason: 'MultiPolygon has no polygons.' };
    }
    for (const rings of polys) {
      const subCheck = validateZonePolygon({
        ...zone,
        geometry: { type: 'Polygon', coordinates: rings },
      });
      if (!subCheck.valid) return subCheck;
    }
    return { valid: true };
  }

  return { valid: false, reason: `Unsupported geometry type: ${String((zone.geometry as { type?: string }).type)}` };
}

/**
 * Strips potentially unsafe control characters from display strings.
 */
export function sanitizeText(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
}
