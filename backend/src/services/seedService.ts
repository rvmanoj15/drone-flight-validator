import { length, lineString } from '@turf/turf';
import { FlightPlanRecord } from '../types/index.js';
import { IStorageRepository } from './storageService.js';
import { validateFlightRoute } from './validationEngine.js';

/**
 * Seeds initial demo flight plans & computed validation records if the storage is empty,
 * so the dashboard and flight history reflect real calculated records on first launch.
 */
export function ensureDemoSeedData(repo: IStorageRepository): void {
  const existingValidations = repo.listValidations();
  const existingPlans = repo.listFlightPlans();
  if (existingValidations.length > 0 && existingPlans.length > 0) {
    return;
  }

  const zones = repo.getZones();
  const demoRoutes = repo.getDemoRoutes().slice(0, 3); // Seed Demo 1 (Approved), Demo 2 (Conditional), Demo 3 (Rejected)

  for (const demo of demoRoutes) {
    const planId = `FP-${demo.id.toUpperCase()}`;
    const routeLine = lineString(demo.coordinates);
    const routeDistanceMeters = Math.round(length(routeLine, { units: 'meters' }));
    const estimatedFlightTimeSeconds = Math.max(1, Math.round(routeDistanceMeters / demo.flightSpeedMps));
    const now = new Date().toISOString();

    const plan: FlightPlanRecord = {
      id: planId,
      name: `${demo.name} (Demo Seed)`,
      startPoint: demo.coordinates[0],
      destination: demo.coordinates[demo.coordinates.length - 1],
      waypoints: demo.coordinates.slice(1, -1),
      coordinates: demo.coordinates,
      routeGeometry: {
        type: 'LineString',
        coordinates: demo.coordinates,
      },
      plannedAltitudeMeters: demo.plannedAltitudeMeters,
      droneModel: demo.droneModel,
      flightSpeedMps: demo.flightSpeedMps,
      permissionGranted: demo.permissionGranted,
      routeDistanceMeters,
      estimatedFlightTimeSeconds,
      isDemoSeed: true,
      createdAt: now,
      updatedAt: now,
    };

    repo.saveFlightPlan(plan);

    const validation = validateFlightRoute(
      {
        name: plan.name,
        coordinates: plan.coordinates,
        plannedAltitudeMeters: plan.plannedAltitudeMeters,
        droneModel: plan.droneModel,
        flightSpeedMps: plan.flightSpeedMps,
        permissionGranted: plan.permissionGranted,
        isDemoSeed: true,
      },
      zones,
      { flightPlanId: planId }
    );

    repo.saveValidation(validation);
  }
}
