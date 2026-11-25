import { length, lineString } from '@turf/turf';
import { LngLat } from '../types';

export function computeRouteDistanceMeters(coords: LngLat[]): number {
  if (coords.length < 2) return 0;
  try {
    return Math.round(length(lineString(coords), { units: 'meters' }));
  } catch {
    return 0;
  }
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km (${meters} m)`;
  }
  return `${meters} m`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function formatCoord(coord: LngLat): string {
  return `${coord[1].toFixed(5)}°, ${coord[0].toFixed(5)}°`;
}
