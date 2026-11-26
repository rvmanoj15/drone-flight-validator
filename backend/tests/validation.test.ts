import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { generateRouteAlternatives } from '../src/algorithms/detourAlgorithm.js';
import { JsonFileRepository } from '../src/services/storageService.js';
import { validateFlightRoute } from '../src/services/validationEngine.js';
import { AirspaceZoneFeature } from '../src/types/index.js';
import { validateCoordinates, validateZonePolygon } from '../src/validators/inputValidators.js';

const testDbPath = path.join(os.tmpdir(), `tenorix-val-test-${Date.now()}.json`);
const repo = new JsonFileRepository({ dbPath: testDbPath });
const zones = repo.getZones();

afterAll(() => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

describe('TENORIX Geospatial Validation Engine', () => {
  it('1. approves a route completely outside all zones within prototype ceiling', () => {
    const result = validateFlightRoute(
      {
        name: 'Outside All Zones',
        coordinates: [
          [-121.652, 36.812],
          [-121.652, 36.842],
        ],
        plannedAltitudeMeters: 50,
      },
      zones
    );

    expect(result.verdict).toBe('APPROVED');
    expect(result.intersections).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
  });

  it('2. rejects a route crossing a RED zone', () => {
    const result = validateFlightRoute(
      {
        name: 'Crosses RZ-02',
        coordinates: [
          [-121.635, 36.878],
          [-121.622, 36.882],
        ],
        plannedAltitudeMeters: 45,
      },
      zones
    );

    expect(result.verdict).toBe('REJECTED');
    expect(result.intersections.some((i) => i.zoneId === 'RZ-02' && i.restrictionLevel === 'RED')).toBe(true);
    expect(result.violations.some((v) => v.includes('RZ-02'))).toBe(true);
  });

  it('3. marks a route crossing a YELLOW zone as CONDITIONAL when permission is not supplied', () => {
    const result = validateFlightRoute(
      {
        name: 'Crosses YZ-01',
        coordinates: [
          [-121.648, 36.850],
          [-121.625, 36.856],
          [-121.608, 36.864],
        ],
        plannedAltitudeMeters: 55,
        permissionGranted: false,
      },
      zones
    );

    expect(result.verdict).toBe('CONDITIONAL');
    expect(result.intersections.some((i) => i.zoneId === 'YZ-01')).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('4. approves a route passing through GREEN zones within altitude bounds', () => {
    const result = validateFlightRoute(
      {
        name: 'Green Corridor',
        coordinates: [
          [-121.640, 36.825],
          [-121.612, 36.825],
          [-121.560, 36.828],
        ],
        plannedAltitudeMeters: 60,
      },
      zones
    );

    expect(result.verdict).toBe('APPROVED');
    expect(result.intersections.map((i) => i.zoneId)).toEqual(
      expect.arrayContaining(['GZ-01', 'GZ-02', 'GZ-03'])
    );
  });

  it('5. rejects when start and destination are safe, but middle segment crosses RED zone', () => {
    const result = validateFlightRoute(
      {
        name: 'Safe Endpoints Middle Cross',
        coordinates: [
          [-121.608, 36.851],
          [-121.576, 36.851],
        ],
        plannedAltitudeMeters: 60,
      },
      zones
    );

    expect(result.verdict).toBe('REJECTED');
    const redHit = result.intersections.find((i) => i.zoneId === 'RZ-01');
    expect(redHit).toBeDefined();
    expect(redHit?.intersectionType).toBe('MIDDLE_SEGMENT');
  });

  it('6. detects intersection when route touches a zone only at a boundary', () => {
    // RZ-01 spans lng [-121.605, -121.580], lat [36.842, 36.860]
    // Route runs exactly along the southern boundary lat = 36.842 from -121.607 to -121.578
    const result = validateFlightRoute(
      {
        name: 'Boundary Touch',
        coordinates: [
          [-121.607, 36.842],
          [-121.578, 36.842],
        ],
        plannedAltitudeMeters: 50,
      },
      zones
    );

    expect(result.verdict).toBe('REJECTED');
    const redHit = result.intersections.find((i) => i.zoneId === 'RZ-01');
    expect(redHit).toBeDefined();
    expect(redHit?.intersectionType).toBe('BOUNDARY_TOUCH');
  });

  it('7. rejects when planned altitude is below zone minimum', () => {
    // GZ-02 has minAltitudeMeters: 10, maxAltitudeMeters: 100
    const result = validateFlightRoute(
      {
        name: 'Below Minimum Altitude',
        coordinates: [
          [-121.605, 36.825],
          [-121.585, 36.825],
        ],
        plannedAltitudeMeters: 4,
      },
      zones
    );

    expect(result.verdict).toBe('REJECTED');
    expect(result.violations.some((v) => v.includes('below the configured minimum of 10 m'))).toBe(true);
  });

  it('8. rejects when planned altitude is above zone maximum', () => {
    // GZ-02 has maxAltitudeMeters: 100
    const result = validateFlightRoute(
      {
        name: 'Above Maximum Altitude',
        coordinates: [
          [-121.605, 36.825],
          [-121.585, 36.825],
        ],
        plannedAltitudeMeters: 135,
      },
      zones
    );

    expect(result.verdict).toBe('REJECTED');
    expect(result.violations.some((v) => v.includes('configured maximum of 100 m'))).toBe(true);
  });

  it('9. rejects missing or insufficient route coordinates', () => {
    const checkSingle = validateCoordinates([[-121.6, 36.85]]);
    expect(checkSingle.valid).toBe(false);

    expect(() =>
      validateFlightRoute(
        {
          name: 'Single Point',
          coordinates: [[-121.6, 36.85]],
          plannedAltitudeMeters: 50,
        },
        zones
      )
    ).toThrow();
  });

  it('10. rejects invalid latitude or longitude values', () => {
    const invalidLng = validateCoordinates([
      [-185, 36.85],
      [-121.6, 36.85],
    ]);
    const invalidLat = validateCoordinates([
      [-121.6, 95],
      [-121.58, 36.85],
    ]);

    expect(invalidLng.valid).toBe(false);
    expect(invalidLat.valid).toBe(false);
  });

  it('11. detects invalid GeoJSON polygon (unclosed or self-intersecting)', () => {
    const unclosedZone: AirspaceZoneFeature = {
      type: 'Feature',
      properties: {
        id: 'BAD-01',
        name: 'Unclosed Zone',
        zoneType: 'TEST',
        restrictionLevel: 'RED',
        description: 'Malformed test polygon',
        minAltitudeMeters: 0,
        maxAltitudeMeters: 0,
        ruleId: 'RULE-BAD',
        ruleVersion: '1.0',
        permissionRequired: false,
        dataSource: 'TEST',
        lastUpdated: '2026-01-01T00:00:00Z',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-121.6, 36.84],
            [-121.59, 36.84],
            [-121.59, 36.85],
            [-121.6, 36.85],
          ],
        ],
      },
    };

    const selfIntersectingZone: AirspaceZoneFeature = {
      ...unclosedZone,
      properties: { ...unclosedZone.properties, id: 'BAD-02' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-121.6, 36.84],
            [-121.59, 36.85],
            [-121.59, 36.84],
            [-121.6, 36.85],
            [-121.6, 36.84],
          ],
        ],
      },
    };

    expect(validateZonePolygon(unclosedZone).valid).toBe(false);
    expect(validateZonePolygon(selfIntersectingZone).valid).toBe(false);
  });

  it('12. detects multiple intersected zones and enforces verdict priority', () => {
    const result = validateFlightRoute(
      {
        name: 'Multi-Zone Route',
        coordinates: [
          [-121.635, 36.830],
          [-121.592, 36.850],
          [-121.555, 36.858],
        ],
        plannedAltitudeMeters: 60,
      },
      zones
    );

    expect(result.verdict).toBe('REJECTED');
    expect(result.intersections.length).toBeGreaterThanOrEqual(3);
    const levels = new Set(result.intersections.map((i) => i.restrictionLevel));
    expect(levels.has('GREEN')).toBe(true);
    expect(levels.has('YELLOW')).toBe(true);
    expect(levels.has('RED')).toBe(true);
  });

  it('13. approves permission-required YELLOW zone when demo permission is supplied and altitude is valid', () => {
    const result = validateFlightRoute(
      {
        name: 'Permitted Yellow Route',
        coordinates: [
          [-121.648, 36.850],
          [-121.625, 36.856],
          [-121.608, 36.864],
        ],
        plannedAltitudeMeters: 55,
        permissionGranted: true,
      },
      zones
    );

    expect(result.verdict).toBe('APPROVED');
    expect(result.intersections.some((i) => i.zoneId === 'YZ-01')).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('14. generates valid alternative route candidates around a blocking RED zone', () => {
    const altResult = generateRouteAlternatives({
      coordinates: [
        [-121.608, 36.851],
        [-121.576, 36.851],
      ],
      plannedAltitudeMeters: 60,
      flightSpeedMps: 12,
      permissionGranted: false,
      zones,
    });

    expect(altResult.candidates.length).toBeGreaterThan(0);
    const best = altResult.candidates[0];
    expect(best.verdict).toBe('APPROVED');
    expect(best.intersections.some((i) => i.restrictionLevel === 'RED')).toBe(false);

    // Independently verify candidate via validation engine
    const recheck = validateFlightRoute(
      {
        name: 'Recheck Best Alternative',
        coordinates: best.coordinates,
        plannedAltitudeMeters: 60,
      },
      zones
    );
    expect(recheck.verdict).toBe('APPROVED');
  });
});
