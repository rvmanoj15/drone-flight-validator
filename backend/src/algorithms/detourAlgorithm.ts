import { bbox, buffer, booleanIntersects, lineString, polygon } from '@turf/turf';
import { v4 as uuidv4 } from 'uuid';
import {
  AirspaceZoneFeature,
  AlternativeRouteCandidate,
  LngLat,
  Verdict,
} from '../types/index.js';
import { validateFlightRoute } from '../services/validationEngine.js';

const DETOUR_LIMITATIONS =
  '2D polygon-buffer detour heuristic: generates offset waypoints around intersected RED demo polygons in horizontal space. Does not account for 3D terrain, dynamic weather, micro-obstacles, or official aviation routing.';

function extractOuterRing(zone: AirspaceZoneFeature): LngLat[] {
  if (zone.geometry.type === 'Polygon') {
    return (zone.geometry.coordinates[0] as number[][]).map((c) => [c[0], c[1]]);
  }
  return (zone.geometry.coordinates[0][0] as number[][]).map((c) => [c[0], c[1]]);
}

/**
 * Generates clockwise and counter-clockwise detour waypoint paths around an expanded
 * bounding box / buffered polygon of a blocking RED zone.
 */
function buildPolygonBypassPaths(
  start: LngLat,
  end: LngLat,
  zone: AirspaceZoneFeature,
  offsetMeters: number
): Array<{ strategy: string; waypoints: LngLat[] }> {
  const ring = extractOuterRing(zone);
  const turfPoly = polygon([ring]);
  const buffered = buffer(turfPoly, offsetMeters / 1000, { units: 'kilometers' });
  const [minX, minY, maxX, maxY] = buffered ? bbox(buffered) : bbox(turfPoly);

  // Cardinal and corner candidate points around the buffered polygon
  const northY = maxY;
  const southY = minY;
  const westX = minX;
  const eastX = maxX;

  const corners: Record<string, LngLat> = {
    NW: [westX, northY],
    NE: [eastX, northY],
    SW: [westX, southY],
    SE: [eastX, southY],
    N_MID: [(westX + eastX) / 2, northY],
    S_MID: [(westX + eastX) / 2, southY],
    W_MID: [westX, (southY + northY) / 2],
    E_MID: [eastX, (southY + northY) / 2],
  };

  const goingEast = end[0] >= start[0];
  const goingNorth = end[1] >= start[1];

  const candidateSets: Array<{ strategy: string; waypoints: LngLat[] }> = [
    // South bypass (2-corner or single midpoint)
    {
      strategy: `South perimeter offset (+${offsetMeters}m)`,
      waypoints: goingEast ? [corners.SW, corners.SE] : [corners.SE, corners.SW],
    },
    {
      strategy: `South apex offset (+${offsetMeters}m)`,
      waypoints: [corners.S_MID],
    },
    // North bypass (2-corner or single midpoint)
    {
      strategy: `North perimeter offset (+${offsetMeters}m)`,
      waypoints: goingEast ? [corners.NW, corners.NE] : [corners.NE, corners.NW],
    },
    {
      strategy: `North apex offset (+${offsetMeters}m)`,
      waypoints: [corners.N_MID],
    },
    // West / East bypasses for North-South routes
    {
      strategy: `West perimeter offset (+${offsetMeters}m)`,
      waypoints: goingNorth ? [corners.SW, corners.NW] : [corners.NW, corners.SW],
    },
    {
      strategy: `East perimeter offset (+${offsetMeters}m)`,
      waypoints: goingNorth ? [corners.SE, corners.NE] : [corners.NE, corners.SE],
    },
    {
      strategy: `West apex offset (+${offsetMeters}m)`,
      waypoints: [corners.W_MID],
    },
    {
      strategy: `East apex offset (+${offsetMeters}m)`,
      waypoints: [corners.E_MID],
    },
  ];

  // Also include buffered polygon vertices sliced into two arcs (clockwise / counter-clockwise)
  if (buffered && buffered.geometry.type === 'Polygon') {
    const bufRing = buffered.geometry.coordinates[0] as number[][];
    if (bufRing.length >= 6) {
      const cleanRing = bufRing.slice(0, -1).map((c) => [c[0], c[1]] as LngLat);
      let entryIdx = 0;
      let exitIdx = 0;
      let bestEntryDist = Infinity;
      let bestExitDist = Infinity;

      cleanRing.forEach((pt, idx) => {
        const dStart = Math.hypot(pt[0] - start[0], pt[1] - start[1]);
        const dEnd = Math.hypot(pt[0] - end[0], pt[1] - end[1]);
        if (dStart < bestEntryDist) {
          bestEntryDist = dStart;
          entryIdx = idx;
        }
        if (dEnd < bestExitDist) {
          bestExitDist = dEnd;
          exitIdx = idx;
        }
      });

      const n = cleanRing.length;
      const forwardArc: LngLat[] = [];
      let i = entryIdx;
      for (let step = 0; step < n; step++) {
        forwardArc.push(cleanRing[i]);
        if (i === exitIdx) break;
        i = (i + 1) % n;
      }

      const backwardArc: LngLat[] = [];
      let j = entryIdx;
      for (let step = 0; step < n; step++) {
        backwardArc.push(cleanRing[j]);
        if (j === exitIdx) break;
        j = (j - 1 + n) % n;
      }

      if (forwardArc.length > 0 && forwardArc.length <= 12) {
        candidateSets.push({
          strategy: `Clockwise buffer arc (+${offsetMeters}m)`,
          waypoints: forwardArc,
        });
      }
      if (backwardArc.length > 0 && backwardArc.length <= 12) {
        candidateSets.push({
          strategy: `Counter-clockwise buffer arc (+${offsetMeters}m)`,
          waypoints: backwardArc,
        });
      }
    }
  }

  return candidateSets;
}

/**
 * Generates and ranks alternative detour route candidates when a route crosses RED zones.
 * Every candidate is verified through the full geospatial validation engine.
 */
export function generateRouteAlternatives(params: {
  coordinates: LngLat[];
  plannedAltitudeMeters: number;
  flightSpeedMps?: number;
  permissionGranted?: boolean;
  zones: AirspaceZoneFeature[];
}): {
  candidates: AlternativeRouteCandidate[];
  message: string;
} {
  const { coordinates, plannedAltitudeMeters, zones } = params;
  const flightSpeedMps = params.flightSpeedMps ?? 12;
  const permissionGranted = Boolean(params.permissionGranted);

  const baseline = validateFlightRoute(
    {
      name: 'Baseline Route Check',
      coordinates,
      plannedAltitudeMeters,
      flightSpeedMps,
      permissionGranted,
    },
    zones
  );

  const redZoneIds = baseline.intersections
    .filter((i) => i.restrictionLevel === 'RED')
    .map((i) => i.zoneId);

  if (redZoneIds.length === 0) {
    return {
      candidates: [],
      message: 'No RED prohibited zone intersections detected; detour generation is unnecessary.',
    };
  }

  const redZones = zones.filter((z) => redZoneIds.includes(z.properties.id));
  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];

  // Try progressive buffer offsets around the primary intersected RED zone(s)
  const offsets = [180, 320, 500, 750];
  const rawProposals: Array<{ strategy: string; coords: LngLat[] }> = [];

  for (const offset of offsets) {
    // 1) Direct start -> bypass -> end around first blocking zone
    const primaryPaths = buildPolygonBypassPaths(start, end, redZones[0], offset);
    for (const p of primaryPaths) {
      rawProposals.push({
        strategy: p.strategy,
        coords: [start, ...p.waypoints, end],
      });
    }

    // 2) Segment-wise detour preserving existing waypoints where safe
    for (let segIdx = 0; segIdx < coordinates.length - 1; segIdx++) {
      const segStart = coordinates[segIdx];
      const segEnd = coordinates[segIdx + 1];
      const segLine = lineString([segStart, segEnd]);

      for (const rz of redZones) {
        const rzPoly = polygon([extractOuterRing(rz)]);
        if (booleanIntersects(segLine, rzPoly)) {
          const segPaths = buildPolygonBypassPaths(segStart, segEnd, rz, offset);
          for (const sp of segPaths) {
            const rebuilt = [
              ...coordinates.slice(0, segIdx + 1),
              ...sp.waypoints,
              ...coordinates.slice(segIdx + 1),
            ];
            rawProposals.push({
              strategy: `Segment ${segIdx + 1} ${sp.strategy}`,
              coords: rebuilt,
            });
          }
        }
      }
    }
  }

  // Deduplicate by coordinate signature and evaluate via backend engine
  const seen = new Set<string>();
  const validCandidates: AlternativeRouteCandidate[] = [];

  for (const proposal of rawProposals) {
    const key = proposal.coords.map((c) => `${c[0].toFixed(5)},${c[1].toFixed(5)}`).join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    const validation = validateFlightRoute(
      {
        name: 'Alternative Candidate Check',
        coordinates: proposal.coords,
        plannedAltitudeMeters,
        flightSpeedMps,
        permissionGranted,
      },
      zones
    );

    // Reject candidates that still intersect RED zones or fail altitude checks
    const stillHitsRed = validation.intersections.some((i) => i.restrictionLevel === 'RED');
    if (stillHitsRed || validation.verdict === 'REJECTED') {
      continue;
    }

    const label =
      validation.verdict === 'APPROVED'
        ? 'Alternative route candidate – passed configured demo checks.'
        : 'Alternative route candidate – avoids RED zones; crosses conditional YELLOW zone.';

    validCandidates.push({
      candidateId: `ALT-${uuidv4().slice(0, 6).toUpperCase()}`,
      label,
      strategy: proposal.strategy,
      coordinates: proposal.coords,
      waypoints: proposal.coords.slice(1, -1),
      routeDistanceMeters: validation.routeDistanceMeters,
      distanceDeltaMeters: validation.routeDistanceMeters - baseline.routeDistanceMeters,
      estimatedFlightTimeSeconds: validation.estimatedFlightTimeSeconds,
      verdict: validation.verdict,
      intersections: validation.intersections,
      explanation: `${label} Strategy: ${proposal.strategy}. Total route distance: ${validation.routeDistanceMeters} m (${validation.routeDistanceMeters - baseline.routeDistanceMeters >= 0 ? '+' : ''}${validation.routeDistanceMeters - baseline.routeDistanceMeters} m vs original).`,
      limitations: DETOUR_LIMITATIONS,
    });
  }

  // Rank APPROVED candidates ahead of CONDITIONAL candidates, then by shortest distance
  const verdictRank: Record<Verdict, number> = {
    APPROVED: 0,
    CONDITIONAL: 1,
    REJECTED: 2,
  };

  validCandidates.sort((a, b) => {
    const rankDiff = verdictRank[a.verdict] - verdictRank[b.verdict];
    if (rankDiff !== 0) return rankDiff;
    return a.routeDistanceMeters - b.routeDistanceMeters;
  });

  const topCandidates = validCandidates.slice(0, 3);

  return {
    candidates: topCandidates,
    message:
      topCandidates.length > 0
        ? `Generated ${topCandidates.length} valid alternative route candidate(s) avoiding RED zone(s).`
        : 'No automatic 2D detour candidate passed all configured demo rules for the current endpoints and altitude. Try adjusting endpoints or altitude manually.',
  };
}
