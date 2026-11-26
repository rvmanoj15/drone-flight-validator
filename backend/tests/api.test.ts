import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { JsonFileRepository } from '../src/services/storageService.js';

const tempFiles: string[] = [];

function createTestApp() {
  const dbPath = path.join(os.tmpdir(), `tenorix-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  tempFiles.push(dbPath);
  const repo = new JsonFileRepository({ dbPath });
  return createApp({ repository: repo, seedDemo: true, disableRateLimit: true });
}

afterEach(() => {
  for (const f of tempFiles.splice(0, tempFiles.length)) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
    }
  }
});

describe('TENORIX REST API & Persistence', () => {
  it('serves health, zones, and demo routes', async () => {
    const app = createTestApp();

    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const zones = await request(app).get('/api/zones');
    expect(zones.status).toBe(200);
    expect(zones.body.features.length).toBeGreaterThanOrEqual(9);

    const demos = await request(app).get('/api/demo/routes');
    expect(demos.status).toBe(200);
    expect(demos.body.routes.length).toBeGreaterThanOrEqual(5);
  });

  it('validates all 5 demo routes consistently with their expected verdicts and generates downloadable PDF', async () => {
    const app = createTestApp();
    const demosRes = await request(app).get('/api/demo/routes');
    const demos = demosRes.body.routes as Array<{
      id: string;
      name: string;
      expectedVerdict: string;
      plannedAltitudeMeters: number;
      droneModel: string;
      flightSpeedMps: number;
      permissionGranted: boolean;
      coordinates: [number, number][];
    }>;

    let lastValidationId = '';

    for (const demo of demos) {
      const res = await request(app).post('/api/validate').send({
        name: demo.name,
        coordinates: demo.coordinates,
        plannedAltitudeMeters: demo.plannedAltitudeMeters,
        droneModel: demo.droneModel,
        flightSpeedMps: demo.flightSpeedMps,
        permissionGranted: demo.permissionGranted,
      });

      expect(res.status).toBe(200);
      expect(res.body.validation.verdict).toBe(demo.expectedVerdict);
      lastValidationId = res.body.validation.validationId;

      if (demo.id === 'demo-restricted') {
        expect(res.body.alternatives.length).toBeGreaterThan(0);
        expect(res.body.alternatives[0].verdict).toBe('APPROVED');
      }
    }

    const pdfRes = await request(app).get(`/api/reports/${lastValidationId}/pdf`);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toContain('application/pdf');
    expect(pdfRes.body.slice(0, 4).toString()).toBe('%PDF');
  });

  it('supports flight plan CRUD, dashboard stats, and rejects malformed payloads', async () => {
    const app = createTestApp();

    const badRes = await request(app).post('/api/validate').send({
      name: 'Invalid Payload',
      coordinates: [[-200, 36.8]],
      plannedAltitudeMeters: -10,
    });
    expect(badRes.status).toBe(400);

    const createRes = await request(app).post('/api/flight-plans').send({
      name: 'CRUD Test Flight',
      coordinates: [
        [-121.64, 36.825],
        [-121.62, 36.825],
      ],
      plannedAltitudeMeters: 50,
    });
    expect(createRes.status).toBe(201);
    const id = createRes.body.flightPlan.id;

    const statsRes = await request(app).get('/api/dashboard/stats');
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.totalFlightPlans).toBeGreaterThanOrEqual(4);
    expect(statsRes.body.zoneCounts.red).toBe(3);

    const delRes = await request(app).delete(`/api/flight-plans/${id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.deleted).toBe(true);
  });

  it('persists alternativeRoutes on REJECTED routes and originalCoordinates on updated/corrected routes for PDF export', async () => {
    const app = createTestApp();
    const givenCoords: [number, number][] = [
      [-121.608, 36.851],
      [-121.576, 36.851],
    ];

    const rejectedRes = await request(app).post('/api/validate').send({
      name: 'Given Restricted Route',
      coordinates: givenCoords,
      plannedAltitudeMeters: 60,
    });
    expect(rejectedRes.status).toBe(200);
    expect(rejectedRes.body.validation.verdict).toBe('REJECTED');
    expect(rejectedRes.body.validation.alternativeRoutes.length).toBeGreaterThan(0);

    const rejectedPdf = await request(app).get(
      `/api/reports/${rejectedRes.body.validation.validationId}/pdf`
    );
    expect(rejectedPdf.status).toBe(200);
    expect(rejectedPdf.body.slice(0, 4).toString()).toBe('%PDF');

    const correctedCoords = rejectedRes.body.alternatives[0].coordinates;
    const correctedRes = await request(app).post('/api/validate').send({
      flightPlanId: rejectedRes.body.validation.flightPlanId,
      name: 'Given Restricted Route (Detour)',
      coordinates: correctedCoords,
      originalCoordinates: givenCoords,
      plannedAltitudeMeters: 60,
    });
    expect(correctedRes.status).toBe(200);
    expect(correctedRes.body.validation.verdict).toBe('APPROVED');
    expect(correctedRes.body.validation.originalCoordinates).toEqual(givenCoords);

    const correctedPdf = await request(app).get(
      `/api/reports/${correctedRes.body.validation.validationId}/pdf`
    );
    expect(correctedPdf.status).toBe(200);
    expect(correctedPdf.body.slice(0, 4).toString()).toBe('%PDF');
  });

  it('allows admin zone creation, recoloring, deletion, and reset, and immediately enforces custom zones in validation', async () => {
    const app = createTestApp();

    // Verify a route in open space passes initially
    const openCoords: [number, number][] = [
      [-121.652, 36.820],
      [-121.652, 36.836],
    ];
    const before = await request(app).post('/api/validate').send({
      name: 'Pre-Admin Route',
      coordinates: openCoords,
      plannedAltitudeMeters: 50,
    });
    expect(before.status).toBe(200);
    expect(before.body.validation.verdict).toBe('APPROVED');

    // Admin draws a new RED polygon directly across that open route
    const createZoneRes = await request(app).post('/api/zones').send({
      name: 'Admin Custom No-Fly',
      restrictionLevel: 'RED',
      coordinates: [
        [-121.656, 36.824],
        [-121.648, 36.824],
        [-121.648, 36.832],
        [-121.656, 36.832],
      ],
    });
    expect(createZoneRes.status).toBe(201);
    const createdId = createZoneRes.body.zone.properties.id;

    // Now the exact same route must be REJECTED
    const afterRed = await request(app).post('/api/validate').send({
      name: 'Post-Admin RED Route',
      coordinates: openCoords,
      plannedAltitudeMeters: 50,
    });
    expect(afterRed.status).toBe(200);
    expect(afterRed.body.validation.verdict).toBe('REJECTED');
    expect(afterRed.body.validation.intersections.some((i: { zoneId: string }) => i.zoneId === createdId)).toBe(true);

    // Admin recolors the zone to GREEN
    const updateZoneRes = await request(app).put(`/api/zones/${createdId}`).send({
      restrictionLevel: 'GREEN',
      minAltitudeMeters: 0,
      maxAltitudeMeters: 120,
    });
    expect(updateZoneRes.status).toBe(200);
    expect(updateZoneRes.body.zone.properties.restrictionLevel).toBe('GREEN');

    const afterGreen = await request(app).post('/api/validate').send({
      name: 'Post-Admin GREEN Route',
      coordinates: openCoords,
      plannedAltitudeMeters: 50,
    });
    expect(afterGreen.status).toBe(200);
    expect(afterGreen.body.validation.verdict).toBe('APPROVED');

    // Admin deletes the custom zone and resets defaults
    const delZoneRes = await request(app).delete(`/api/zones/${createdId}`);
    expect(delZoneRes.status).toBe(200);

    const resetRes = await request(app).post('/api/zones/reset');
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.features.length).toBe(9);
  });

  it('exports Admin Airspace Zones PDF and allows Pilot PDF upload to validate route against PDF zones', async () => {
    const app = createTestApp();

    // Admin adds a custom RED zone in open west area
    const createRes = await request(app).post('/api/zones').send({
      name: 'PDF Briefing Hazard Zone',
      restrictionLevel: 'RED',
      coordinates: [
        [-121.656, 36.824],
        [-121.648, 36.824],
        [-121.648, 36.832],
        [-121.656, 36.832],
      ],
    });
    expect(createRes.status).toBe(201);

    // Admin downloads the Airspace Zones PDF
    const pdfRes = await request(app).get('/api/zones/pdf');
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toContain('application/pdf');
    expect(pdfRes.body.slice(0, 4).toString()).toBe('%PDF');

    // Clear server zones to prove Pilot validation truly uses the uploaded PDF's zones
    await request(app).delete('/api/zones');

    const parseRes = await request(app).post('/api/zones/parse-pdf').send({
      filename: 'TENORIX-Airspace-Zones.pdf',
      pdfBase64: Buffer.from(pdfRes.body).toString('base64'),
    });
    expect(parseRes.status).toBe(200);
    expect(parseRes.body.checksumVerified).toBe(true);
    expect(parseRes.body.extractionMethod).toBe('EMBEDDED_GEOJSON');
    expect(parseRes.body.zoneCount).toBe(10);

    // Pilot validates route crossing the PDF's RED zone
    const valRes = await request(app).post('/api/validate').send({
      name: 'Pilot Route vs Uploaded PDF',
      coordinates: [
        [-121.652, 36.820],
        [-121.652, 36.836],
      ],
      plannedAltitudeMeters: 50,
      customZones: parseRes.body.zones,
      airspaceSource: 'PDF: TENORIX-Airspace-Zones.pdf',
    });
    expect(valRes.status).toBe(200);
    expect(valRes.body.validation.verdict).toBe('REJECTED');
    expect(valRes.body.validation.datasetSource).toBe('PDF: TENORIX-Airspace-Zones.pdf');
    expect(
      valRes.body.validation.intersections.some(
        (i: { zoneName: string }) => i.zoneName === 'PDF Briefing Hazard Zone'
      )
    ).toBe(true);
  });
});
