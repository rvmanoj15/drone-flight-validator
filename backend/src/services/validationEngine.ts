import {
  booleanIntersects,
  booleanPointInPolygon,
  booleanWithin,
  buffer,
  length,
  lineString,
  multiPolygon,
  point,
  polygon,
} from '@turf/turf';
import { v4 as uuidv4 } from 'uuid';
import {
  AirspaceZoneFeature,
  FlightPlanInput,
  LngLat,
  RuleCheckResult,
  ValidationRecord,
  Verdict,
  ZoneIntersection,
} from '../types/index.js';
import {
  DATASET_SOURCE,
  RULE_VERSION,
  SYNTHETIC_DISCLAIMER,
  sanitizeText,
  validateCoordinates,
  validateZonePolygon,
} from '../validators/inputValidators.js';

export interface ValidateRouteOptions {
  flightPlanId?: string;
  persist?: boolean;
}

/**
 * Converts a zone GeoJSON feature into a Turf polygon/multipolygon feature.
 */
function toTurfZone(zone: AirspaceZoneFeature) {
  if (zone.geometry.type === 'Polygon') {
    return polygon(zone.geometry.coordinates as number[][][]);
  }
  return multiPolygon(zone.geometry.coordinates as number[][][][]);
}

function isPointInsideZone(pt: ReturnType<typeof point>, turfZone: ReturnType<typeof toTurfZone>): boolean {
  if (turfZone.geometry.type === 'Polygon') {
    return booleanPointInPolygon(pt, turfZone as ReturnType<typeof polygon>, { ignoreBoundary: true });
  }
  return turfZone.geometry.coordinates.some((rings) =>
    booleanPointInPolygon(pt, polygon(rings), { ignoreBoundary: true })
  );
}

/**
 * Classifies how the route interacts with a zone polygon:
 * - BOUNDARY_TOUCH: touches perimeter without entering interior or crossing through
 * - ENDPOINT: start or destination lies inside the zone
 * - FULL_CORRIDOR: both endpoints lie inside the zone
 * - MIDDLE_SEGMENT: both endpoints are outside, yet an intermediate segment crosses the zone
 */
function classifyIntersection(
  routeLine: ReturnType<typeof lineString>,
  coords: LngLat[],
  zone: AirspaceZoneFeature
): ZoneIntersection['intersectionType'] {
  const turfZone = toTurfZone(zone);
  const startPt = point(coords[0]);
  const endPt = point(coords[coords.length - 1]);
  const startIn = isPointInsideZone(startPt, turfZone);
  const endIn = isPointInsideZone(endPt, turfZone);

  if (startIn && endIn && booleanWithin(routeLine, turfZone)) {
    return 'FULL_CORRIDOR';
  }
  if (startIn || endIn) {
    return 'ENDPOINT';
  }

  // Check if any route vertex is strictly inside the polygon
  for (let i = 1; i < coords.length - 1; i++) {
    if (isPointInsideZone(point(coords[i]), turfZone)) {
      return 'MIDDLE_SEGMENT';
    }
  }

  // Check if the route enters the strict interior (inset by 2m) vs merely grazing the boundary
  const interior = buffer(turfZone, -0.002, { units: 'kilometers' });
  if (interior && booleanIntersects(routeLine, interior)) {
    return 'MIDDLE_SEGMENT';
  }

  return 'BOUNDARY_TOUCH';
}

/**
 * Core geospatial validation engine.
 * Evaluates full route LineString geometry against all valid airspace zone polygons,
 * applies RED/YELLOW/GREEN prototype rules and altitude bounds, and builds explainable results.
 */
export function validateFlightRoute(
  input: FlightPlanInput,
  zones: AirspaceZoneFeature[],
  options?: ValidateRouteOptions
): ValidationRecord {
  const coordValidation = validateCoordinates(input.coordinates);
  if (!coordValidation.valid || !coordValidation.coordinates) {
    throw new Error(coordValidation.error || 'Invalid route coordinates.');
  }

  if (!Number.isFinite(input.plannedAltitudeMeters) || input.plannedAltitudeMeters < 0) {
    throw new Error('Planned altitude must be a non-negative finite number.');
  }

  const coords = coordValidation.coordinates;
  const routeLine = lineString(coords);
  const routeDistanceMeters = Math.round(length(routeLine, { units: 'meters' }));
  const flightSpeedMps = input.flightSpeedMps && input.flightSpeedMps > 0 ? input.flightSpeedMps : 12;
  const estimatedFlightTimeSeconds = Math.max(1, Math.round(routeDistanceMeters / flightSpeedMps));
  const altitude = input.plannedAltitudeMeters;
  const permissionGranted = Boolean(input.permissionGranted);

  const checks: RuleCheckResult[] = [
    {
      checkId: 'CHK-GEOM-01',
      ruleId: 'SYS-INPUT-01',
      title: 'Route Coordinate & Geometry Validation',
      status: 'PASS',
      explanation: `Validated LineString with ${coords.length} points spanning ${routeDistanceMeters} m at ${altitude} m planned altitude.`,
    },
  ];

  const intersections: ZoneIntersection[] = [];
  const violations: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  let hasHardRejection = false;
  let hasConditionalRequirement = false;

  for (const zone of zones) {
    const polyCheck = validateZonePolygon(zone);
    if (!polyCheck.valid) {
      checks.push({
        checkId: `CHK-ZONE-INVALID-${zone.properties?.id ?? 'UNKNOWN'}`,
        ruleId: zone.properties?.ruleId ?? 'SYS-ZONE-INVALID',
        title: `Skip Invalid Zone Geometry (${zone.properties?.id ?? 'Unknown'})`,
        zoneId: zone.properties?.id,
        status: 'WARN',
        explanation: `Zone skipped because geometry failed validation: ${polyCheck.reason}`,
      });
      continue;
    }

    const turfZone = toTurfZone(zone);
    if (!booleanIntersects(routeLine, turfZone)) {
      continue;
    }

    const props = zone.properties;
    const intersectionType = classifyIntersection(routeLine, coords, zone);
    const minAlt = props.minAltitudeMeters;
    const maxAlt = props.maxAltitudeMeters;

    let altitudeCompliant = true;
    let altitudeReason = '';
    if (props.restrictionLevel !== 'RED') {
      if (minAlt !== null && altitude < minAlt) {
        altitudeCompliant = false;
        altitudeReason = `Planned altitude is ${altitude} m, which is below the configured minimum of ${minAlt} m for ${props.id} (${props.name}).`;
      } else if (maxAlt !== null && altitude > maxAlt) {
        altitudeCompliant = false;
        altitudeReason = `Planned altitude is ${altitude} m, but demo zone ${props.id} (${props.name}) has a configured maximum of ${maxAlt} m.`;
      }
    }

    const locationDesc =
      intersectionType === 'MIDDLE_SEGMENT'
        ? 'middle segment crosses'
        : intersectionType === 'BOUNDARY_TOUCH'
          ? 'route touches the boundary of'
          : intersectionType === 'FULL_CORRIDOR'
            ? 'route operates inside'
            : 'route endpoint enters';

    let summary = '';

    if (props.restrictionLevel === 'RED') {
      hasHardRejection = true;
      altitudeCompliant = false;
      summary = `The ${locationDesc} prohibited RED demo zone ${props.id} (${props.name}) under ${props.ruleId}.`;
      violations.push(summary);
      checks.push({
        checkId: `CHK-${props.id}`,
        ruleId: props.ruleId,
        title: `Prohibited Zone Check — ${props.id} (${props.name})`,
        zoneId: props.id,
        status: 'FAIL',
        explanation: summary,
      });
      recommendations.push(
        `Reroute around RED demo zone ${props.id} (${props.name}) or use Route Alternative Assistance to compute a compliant bypass.`
      );
    } else if (props.restrictionLevel === 'YELLOW') {
      const needsPermission = props.permissionRequired && !permissionGranted;
      if (needsPermission) {
        hasConditionalRequirement = true;
      }

      if (!altitudeCompliant) {
        hasHardRejection = true;
        summary = `The ${locationDesc} YELLOW demo zone ${props.id} (${props.name}). ${altitudeReason}`;
        violations.push(summary);
        checks.push({
          checkId: `CHK-${props.id}-ALT`,
          ruleId: props.ruleId,
          title: `Altitude Envelope Check — ${props.id} (${props.name})`,
          zoneId: props.id,
          status: 'FAIL',
          explanation: altitudeReason,
        });
        recommendations.push(
          `Adjust planned altitude into the ${minAlt ?? 0} m – ${maxAlt ?? 120} m range configured for ${props.id}.`
        );
      } else {
        summary = needsPermission
          ? `The ${locationDesc} YELLOW demo zone ${props.id} (${props.name}), where demo permission is required (${props.ruleId}).`
          : `The ${locationDesc} YELLOW demo zone ${props.id} (${props.name}) with demo permission supplied and compliant altitude (${altitude} m within ${minAlt ?? 0} m – ${maxAlt ?? 120} m).`;
      }

      if (needsPermission) {
        const permMsg = `The route crosses YELLOW demo zone ${props.id} (${props.name}), where demo permission is required under ${props.ruleId}.`;
        warnings.push(permMsg);
        checks.push({
          checkId: `CHK-${props.id}-PERM`,
          ruleId: props.ruleId,
          title: `Conditional Zone Permission — ${props.id} (${props.name})`,
          zoneId: props.id,
          status: 'WARN',
          explanation: permMsg,
        });
        recommendations.push(
          `Obtain or toggle demo operator authorization for ${props.id} (${props.name}), or adjust the route to remain in GREEN corridors.`
        );
      } else if (altitudeCompliant) {
        checks.push({
          checkId: `CHK-${props.id}-PERM`,
          ruleId: props.ruleId,
          title: `Conditional Zone Check — ${props.id} (${props.name})`,
          zoneId: props.id,
          status: 'PASS',
          explanation: summary,
        });
      }
    } else {
      // GREEN zone
      if (!altitudeCompliant) {
        hasHardRejection = true;
        summary = `The ${locationDesc} GREEN demo zone ${props.id} (${props.name}). ${altitudeReason}`;
        violations.push(summary);
        checks.push({
          checkId: `CHK-${props.id}-ALT`,
          ruleId: props.ruleId,
          title: `Altitude Envelope Check — ${props.id} (${props.name})`,
          zoneId: props.id,
          status: 'FAIL',
          explanation: altitudeReason,
        });
        recommendations.push(
          `Adjust planned altitude to ${minAlt ?? 0} m – ${maxAlt ?? 120} m to comply with ${props.id} (${props.name}).`
        );
      } else {
        summary = `The ${locationDesc} GREEN demo zone ${props.id} (${props.name}); permitted at ${altitude} m (limits: ${minAlt ?? 0} m – ${maxAlt ?? 120} m).`;
        checks.push({
          checkId: `CHK-${props.id}`,
          ruleId: props.ruleId,
          title: `Open Corridor Check — ${props.id} (${props.name})`,
          zoneId: props.id,
          status: 'PASS',
          explanation: summary,
        });
      }
    }

    intersections.push({
      zoneId: props.id,
      zoneName: props.name,
      zoneType: props.zoneType,
      restrictionLevel: props.restrictionLevel,
      ruleId: props.ruleId,
      ruleVersion: props.ruleVersion,
      minAltitudeMeters: minAlt,
      maxAltitudeMeters: maxAlt,
      permissionRequired: props.permissionRequired,
      intersectionType,
      altitudeCompliant,
      summary,
    });
  }

  // Explicit non-intersection check for RED zones for clarity
  const redHits = intersections.filter((i) => i.restrictionLevel === 'RED');
  if (redHits.length === 0) {
    checks.push({
      checkId: 'CHK-NO-RED',
      ruleId: 'SYS-RED-CLEAR',
      title: 'Prohibited Zone Clearance',
      status: 'PASS',
      explanation: 'No intersection with configured RED demo zones was detected along the entire route.',
    });
  }

  // If route is completely outside all zones, verify default prototype altitude ceiling (120 m)
  if (intersections.length === 0) {
    if (altitude > 120) {
      hasHardRejection = true;
      const msg = `Planned altitude is ${altitude} m, exceeding the default prototype unzoned ceiling of 120 m.`;
      violations.push(msg);
      checks.push({
        checkId: 'CHK-DEFAULT-ALT',
        ruleId: 'SYS-ALT-DEFAULT',
        title: 'Default Unzoned Altitude Ceiling',
        status: 'FAIL',
        explanation: msg,
      });
      recommendations.push('Lower planned altitude to 120 m or below for unzoned prototype corridors.');
    } else {
      checks.push({
        checkId: 'CHK-OUTSIDE-ALL',
        ruleId: 'SYS-CLEAR-CORRIDOR',
        title: 'Unrestricted Demo Corridor Check',
        status: 'PASS',
        explanation: 'Route remains outside all restricted/conditional demo zones and within the 120 m prototype ceiling.',
      });
    }
  }

  // Verdict priority: REJECTED > CONDITIONAL > APPROVED
  let verdict: Verdict = 'APPROVED';
  if (hasHardRejection) {
    verdict = 'REJECTED';
  } else if (hasConditionalRequirement) {
    verdict = 'CONDITIONAL';
  }

  if (verdict === 'APPROVED') {
    recommendations.push('The route passed all configured demo checks. Proceed with standard pre-flight checklist.');
  }

  const startPoint = coords[0];
  const destination = coords[coords.length - 1];
  const waypoints = coords.slice(1, -1);

  return {
    validationId: `VAL-${uuidv4().slice(0, 8).toUpperCase()}`,
    flightPlanId: options?.flightPlanId ?? `FP-${uuidv4().slice(0, 8).toUpperCase()}`,
    flightPlanName: sanitizeText(input.name || 'Untitled Drone Route'),
    verdict,
    routeDistanceMeters,
    estimatedFlightTimeSeconds,
    plannedAltitudeMeters: altitude,
    droneModel: sanitizeText(input.droneModel || 'Generic Quadcopter UAV'),
    flightSpeedMps,
    permissionGranted,
    startPoint,
    destination,
    waypoints,
    coordinates: coords,
    routeGeoJson: {
      type: 'LineString',
      coordinates: coords,
    },
    intersections,
    checks,
    violations,
    warnings,
    recommendations: Array.from(new Set(recommendations)),
    ruleVersion: RULE_VERSION,
    datasetSource: input.airspaceSource ? sanitizeText(input.airspaceSource) : DATASET_SOURCE,
    disclaimer: SYNTHETIC_DISCLAIMER,
    isDemoSeed: Boolean(input.isDemoSeed),
    timestamp: new Date().toISOString(),
  };
}
