import {
  AirspaceFeatureCollection,
  AlternativeRouteCandidate,
  DashboardStats,
  DemoRoute,
  LngLat,
  ValidateRouteResponse,
  ValidationRecord,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let errorMessage = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as {
        error?: string;
        details?: Array<{ path?: string; message: string }>;
      };
      if (payload.error) {
        errorMessage = payload.error;
        if (payload.details && payload.details.length > 0) {
          errorMessage += `: ${payload.details.map((d) => d.message).join('; ')}`;
        }
      }
    } catch {
      // ignore non-json error body
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

export const api = {
  getZones(level?: string) {
    const query = level && level !== 'ALL' ? `?level=${encodeURIComponent(level)}` : '';
    return requestJson<AirspaceFeatureCollection>(`/zones${query}`);
  },

  getDemoRoutes() {
    return requestJson<{ routes: DemoRoute[]; datasetSource: string; disclaimer: string }>('/demo/routes');
  },

  getDashboardStats() {
    return requestJson<DashboardStats>('/dashboard/stats');
  },

  validateFlight(payload: {
    name: string;
    coordinates: LngLat[];
    originalCoordinates?: LngLat[];
    plannedAltitudeMeters: number;
    droneModel?: string;
    flightSpeedMps?: number;
    permissionGranted?: boolean;
    flightPlanId?: string;
  }) {
    return requestJson<ValidateRouteResponse>('/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getRouteAlternatives(payload: {
    coordinates: LngLat[];
    plannedAltitudeMeters: number;
    flightSpeedMps?: number;
    permissionGranted?: boolean;
  }) {
    return requestJson<{ candidates: AlternativeRouteCandidate[]; message: string }>('/route-alternatives', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  listValidations(params?: { verdict?: string; search?: string }) {
    const sp = new URLSearchParams();
    if (params?.verdict && params.verdict !== 'ALL') sp.set('verdict', params.verdict);
    if (params?.search) sp.set('search', params.search);
    const qs = sp.toString();
    return requestJson<{ validations: ValidationRecord[] }>(`/validations${qs ? `?${qs}` : ''}`);
  },

  getValidationById(id: string) {
    return requestJson<{ validation: ValidationRecord }>(`/validations/${encodeURIComponent(id)}`);
  },

  deleteFlightPlan(id: string) {
    return requestJson<{ deleted: boolean; id: string }>(`/flight-plans/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  getPdfDownloadUrl(validationId: string) {
    return `${API_BASE}/reports/${encodeURIComponent(validationId)}/pdf`;
  },
};
