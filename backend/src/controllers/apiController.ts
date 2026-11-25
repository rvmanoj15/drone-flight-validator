import { Request, Response } from 'express';
import { length, lineString } from '@turf/turf';
import { v4 as uuidv4 } from 'uuid';
import { generateRouteAlternatives } from '../algorithms/detourAlgorithm.js';
import { generateValidationPdfBuffer } from '../services/pdfService.js';
import { IStorageRepository } from '../services/storageService.js';
import { validateFlightRoute } from '../services/validationEngine.js';
import { DashboardStats, FlightPlanRecord } from '../types/index.js';
import {
  DATASET_SOURCE,
  RULE_VERSION,
  SYNTHETIC_DISCLAIMER,
  alternativeRouteRequestSchema,
  flightPlanPayloadSchema,
  flightPlanUpdateSchema,
  sanitizeText,
} from '../validators/inputValidators.js';

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? (val[0] ?? '') : (val ?? '');
}

export class ApiController {
  constructor(private readonly repo: IStorageRepository) { }

  health = (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'TENORIX Geospatial Validation API',
      ruleVersion: RULE_VERSION,
      datasetSource: DATASET_SOURCE,
      timestamp: new Date().toISOString(),
    });
  };

  getZones = (req: Request, res: Response) => {
    const level = typeof req.query.level === 'string' ? req.query.level.toUpperCase() : undefined;
    const collection = this.repo.getZonesCollection();
    const features =
      level && ['RED', 'YELLOW', 'GREEN'].includes(level)
        ? collection.features.filter((f) => f.properties.restrictionLevel === level)
        : collection.features;

    res.json({
      type: 'FeatureCollection',
      metadata: collection.metadata,
      features,
    });
  };

  getZoneById = (req: Request, res: Response) => {
    const id = paramStr(req.params.id);
    const zone = this.repo.getZoneById(id);
    if (!zone) {
      res.status(404).json({ error: `Airspace zone '${id}' not found.` });
      return;
    }
    res.json({ zone });
  };

  getDemoRoutes = (_req: Request, res: Response) => {
    const routes = this.repo.getDemoRoutes();
    res.json({
      routes,
      datasetSource: DATASET_SOURCE,
      disclaimer: SYNTHETIC_DISCLAIMER,
    });
  };

  listFlightPlans = (_req: Request, res: Response) => {
    const plans = this.repo.listFlightPlans();
    res.json({ flightPlans: plans });
  };

  getFlightPlanById = (req: Request, res: Response) => {
    const id = paramStr(req.params.id);
    const plan = this.repo.getFlightPlanById(id);
    if (!plan) {
      res.status(404).json({ error: `Flight plan '${id}' not found.` });
      return;
    }
    res.json({ flightPlan: plan });
  };

  createFlightPlan = (req: Request, res: Response) => {
    const parsed = flightPlanPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid flight plan payload.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }

    const data = parsed.data;
    const dist = Math.round(length(lineString(data.coordinates), { units: 'meters' }));
    const eta = Math.max(1, Math.round(dist / data.flightSpeedMps));
    const now = new Date().toISOString();

    const record: FlightPlanRecord = {
      id: `FP-${uuidv4().slice(0, 8).toUpperCase()}`,
      name: sanitizeText(data.name),
      startPoint: data.coordinates[0],
      destination: data.coordinates[data.coordinates.length - 1],
      waypoints: data.coordinates.slice(1, -1),
      coordinates: data.coordinates,
      routeGeometry: {
        type: 'LineString',
        coordinates: data.coordinates,
      },
      plannedAltitudeMeters: data.plannedAltitudeMeters,
      droneModel: sanitizeText(data.droneModel),
      flightSpeedMps: data.flightSpeedMps,
      permissionGranted: data.permissionGranted,
      routeDistanceMeters: dist,
      estimatedFlightTimeSeconds: eta,
      isDemoSeed: Boolean(data.isDemoSeed),
      createdAt: now,
      updatedAt: now,
    };

    const saved = this.repo.saveFlightPlan(record);
    res.status(201).json({ flightPlan: saved });
  };

  updateFlightPlan = (req: Request, res: Response) => {
    const id = paramStr(req.params.id);
    const existing = this.repo.getFlightPlanById(id);
    if (!existing) {
      res.status(404).json({ error: `Flight plan '${id}' not found.` });
      return;
    }

    const parsed = flightPlanUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid flight plan update payload.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }

    const patch = parsed.data;
    const coords = patch.coordinates ?? existing.coordinates;
    const speed = patch.flightSpeedMps ?? existing.flightSpeedMps;
    const dist = Math.round(length(lineString(coords), { units: 'meters' }));
    const eta = Math.max(1, Math.round(dist / speed));

    const updated: FlightPlanRecord = {
      ...existing,
      name: patch.name !== undefined ? sanitizeText(patch.name) : existing.name,
      coordinates: coords,
      startPoint: coords[0],
      destination: coords[coords.length - 1],
      waypoints: coords.slice(1, -1),
      routeGeometry: { type: 'LineString', coordinates: coords },
      plannedAltitudeMeters: patch.plannedAltitudeMeters ?? existing.plannedAltitudeMeters,
      droneModel: patch.droneModel !== undefined ? sanitizeText(patch.droneModel) : existing.droneModel,
      flightSpeedMps: speed,
      permissionGranted: patch.permissionGranted ?? existing.permissionGranted,
      routeDistanceMeters: dist,
      estimatedFlightTimeSeconds: eta,
      updatedAt: new Date().toISOString(),
    };

    this.repo.updateFlightPlan(existing.id, updated);
    res.json({ flightPlan: updated });
  };

  deleteFlightPlan = (req: Request, res: Response) => {
    const id = paramStr(req.params.id);
    const deleted = this.repo.deleteFlightPlan(id);
    if (!deleted) {
      res.status(404).json({ error: `Flight plan '${id}' not found.` });
      return;
    }
    res.json({ deleted: true, id });
  };

  validateRoute = (req: Request, res: Response) => {
    const parsed = flightPlanPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation input failed schema checks.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }

    const input = parsed.data;
    const zones = this.repo.getZones();
    const now = new Date().toISOString();

    let flightPlanId = input.flightPlanId;
    let previousCoordinates: [number, number][] | undefined = input.originalCoordinates;
    if (flightPlanId) {
      const existingPlan = this.repo.getFlightPlanById(flightPlanId);
      if (existingPlan) {
        if (
          !previousCoordinates &&
          JSON.stringify(existingPlan.coordinates) !== JSON.stringify(input.coordinates)
        ) {
          previousCoordinates = existingPlan.coordinates;
        }
        const dist = Math.round(length(lineString(input.coordinates), { units: 'meters' }));
        this.repo.updateFlightPlan(flightPlanId, {
          ...existingPlan,
          name: sanitizeText(input.name),
          coordinates: input.coordinates,
          startPoint: input.coordinates[0],
          destination: input.coordinates[input.coordinates.length - 1],
          waypoints: input.coordinates.slice(1, -1),
          routeGeometry: { type: 'LineString', coordinates: input.coordinates },
          plannedAltitudeMeters: input.plannedAltitudeMeters,
          droneModel: sanitizeText(input.droneModel),
          flightSpeedMps: input.flightSpeedMps,
          permissionGranted: input.permissionGranted,
          routeDistanceMeters: dist,
          estimatedFlightTimeSeconds: Math.max(1, Math.round(dist / input.flightSpeedMps)),
          updatedAt: now,
        });
      } else {
        flightPlanId = undefined;
      }
    }

    if (!flightPlanId) {
      const dist = Math.round(length(lineString(input.coordinates), { units: 'meters' }));
      const newPlan: FlightPlanRecord = {
        id: `FP-${uuidv4().slice(0, 8).toUpperCase()}`,
        name: sanitizeText(input.name),
        startPoint: input.coordinates[0],
        destination: input.coordinates[input.coordinates.length - 1],
        waypoints: input.coordinates.slice(1, -1),
        coordinates: input.coordinates,
        routeGeometry: { type: 'LineString', coordinates: input.coordinates },
        plannedAltitudeMeters: input.plannedAltitudeMeters,
        droneModel: sanitizeText(input.droneModel),
        flightSpeedMps: input.flightSpeedMps,
        permissionGranted: input.permissionGranted,
        routeDistanceMeters: dist,
        estimatedFlightTimeSeconds: Math.max(1, Math.round(dist / input.flightSpeedMps)),
        isDemoSeed: Boolean(input.isDemoSeed),
        createdAt: now,
        updatedAt: now,
      };
      this.repo.saveFlightPlan(newPlan);
      flightPlanId = newPlan.id;
    }

    const validation = validateFlightRoute(input, zones, { flightPlanId });
    if (previousCoordinates && previousCoordinates.length >= 2) {
      validation.originalCoordinates = previousCoordinates;
    }

    // If REJECTED due to RED zone intersection, also compute detour candidates immediately for responsive UX & PDF
    let alternatives: ReturnType<typeof generateRouteAlternatives> | null = null;
    if (validation.intersections.some((i) => i.restrictionLevel === 'RED')) {
      alternatives = generateRouteAlternatives({
        coordinates: input.coordinates,
        plannedAltitudeMeters: input.plannedAltitudeMeters,
        flightSpeedMps: input.flightSpeedMps,
        permissionGranted: input.permissionGranted,
        zones,
      });
      validation.alternativeRoutes = alternatives.candidates;
    }

    this.repo.saveValidation(validation);

    res.status(200).json({
      validation,
      alternatives: alternatives?.candidates ?? [],
      alternativesMessage: alternatives?.message ?? null,
    });
  };

  listValidations = (req: Request, res: Response) => {
    let records = this.repo.listValidations();
    const verdict = typeof req.query.verdict === 'string' ? req.query.verdict.toUpperCase() : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    if (verdict && ['APPROVED', 'CONDITIONAL', 'REJECTED'].includes(verdict)) {
      records = records.filter((r) => r.verdict === verdict);
    }
    if (search) {
      records = records.filter(
        (r) =>
          r.flightPlanName.toLowerCase().includes(search) ||
          r.validationId.toLowerCase().includes(search) ||
          r.droneModel.toLowerCase().includes(search)
      );
    }

    res.json({ validations: records });
  };

  getValidationById = (req: Request, res: Response) => {
    const id = paramStr(req.params.id);
    const record = this.repo.getValidationById(id);
    if (!record) {
      res.status(404).json({ error: `Validation record '${id}' not found.` });
      return;
    }
    res.json({ validation: record });
  };

  computeRouteAlternatives = (req: Request, res: Response) => {
    const parsed = alternativeRouteRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid route alternative request.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }

    const zones = this.repo.getZones();
    const result = generateRouteAlternatives({
      coordinates: parsed.data.coordinates,
      plannedAltitudeMeters: parsed.data.plannedAltitudeMeters,
      flightSpeedMps: parsed.data.flightSpeedMps,
      permissionGranted: parsed.data.permissionGranted,
      zones,
    });

    res.json(result);
  };

  getDashboardStats = (_req: Request, res: Response) => {
    const plans = this.repo.listFlightPlans();
    const validations = this.repo.listValidations();
    const zones = this.repo.getZones();

    const stats: DashboardStats = {
      totalFlightPlans: plans.length,
      totalValidations: validations.length,
      approvedCount: validations.filter((v) => v.verdict === 'APPROVED').length,
      conditionalCount: validations.filter((v) => v.verdict === 'CONDITIONAL').length,
      rejectedCount: validations.filter((v) => v.verdict === 'REJECTED').length,
      demoSeedCount: validations.filter((v) => v.isDemoSeed).length,
      userCreatedCount: validations.filter((v) => !v.isDemoSeed).length,
      zoneCounts: {
        total: zones.length,
        green: zones.filter((z) => z.properties.restrictionLevel === 'GREEN').length,
        yellow: zones.filter((z) => z.properties.restrictionLevel === 'YELLOW').length,
        red: zones.filter((z) => z.properties.restrictionLevel === 'RED').length,
      },
      recentValidations: validations.slice(0, 6),
      datasetSource: DATASET_SOURCE,
      disclaimer: SYNTHETIC_DISCLAIMER,
    };

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(stats);
  };

  downloadValidationPdf = async (req: Request, res: Response) => {
    const validationId = paramStr(req.params.validationId);
    const record = this.repo.getValidationById(validationId);
    if (!record) {
      res.status(404).json({ error: `Validation record '${validationId}' not found.` });
      return;
    }

    const zones = this.repo.getZones();
    let alternatives = record.alternativeRoutes ?? [];
    if (
      alternatives.length === 0 &&
      record.intersections.some((i) => i.restrictionLevel === 'RED')
    ) {
      alternatives = generateRouteAlternatives({
        coordinates: record.coordinates,
        plannedAltitudeMeters: record.plannedAltitudeMeters,
        flightSpeedMps: record.flightSpeedMps,
        permissionGranted: record.permissionGranted,
        zones,
      }).candidates;
    }

    const pdfBuffer = await generateValidationPdfBuffer(record, zones, alternatives);
    const safeFilename = `TENORIX-${record.validationId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(pdfBuffer);
  };
}
