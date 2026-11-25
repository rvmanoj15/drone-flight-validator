import { Router } from 'express';
import { ApiController } from '../controllers/apiController.js';

export function createApiRouter(controller: ApiController): Router {
  const router = Router();

  router.get('/health', controller.health);
  router.get('/zones', controller.getZones);
  router.get('/zones/:id', controller.getZoneById);
  router.get('/demo/routes', controller.getDemoRoutes);

  router.post('/flight-plans', controller.createFlightPlan);
  router.get('/flight-plans', controller.listFlightPlans);
  router.get('/flight-plans/:id', controller.getFlightPlanById);
  router.put('/flight-plans/:id', controller.updateFlightPlan);
  router.delete('/flight-plans/:id', controller.deleteFlightPlan);

  router.post('/validate', controller.validateRoute);
  router.get('/validations', controller.listValidations);
  router.get('/validations/:id', controller.getValidationById);

  router.post('/route-alternatives', controller.computeRouteAlternatives);
  router.get('/dashboard/stats', controller.getDashboardStats);
  router.get('/reports/:validationId/pdf', controller.downloadValidationPdf);

  return router;
}
