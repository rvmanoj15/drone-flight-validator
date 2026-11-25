export type RestrictionLevel = 'GREEN' | 'YELLOW' | 'RED';
export type Verdict = 'APPROVED' | 'CONDITIONAL' | 'REJECTED';
export type CheckStatus = 'PASS' | 'WARN' | 'FAIL';
export type LngLat = [number, number];

export interface ZoneProperties {
  id: string;
  name: string;
  zoneType: string;
  restrictionLevel: RestrictionLevel;
  description: string;
  minAltitudeMeters: number | null;
  maxAltitudeMeters: number | null;
  ruleId: string;
  ruleVersion: string;
  permissionRequired: boolean;
  dataSource: string;
  lastUpdated: string;
}

export interface AirspaceZoneFeature {
  type: 'Feature';
  id?: string;
  properties: ZoneProperties;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

export interface AirspaceFeatureCollection {
  type: 'FeatureCollection';
  metadata?: {
    datasetName: string;
    datasetSource: string;
    ruleVersion: string;
    disclaimer: string;
  };
  features: AirspaceZoneFeature[];
}

export interface DemoRoute {
  id: string;
  shortLabel: string;
  name: string;
  description: string;
  expectedVerdict: Verdict;
  plannedAltitudeMeters: number;
  droneModel: string;
  flightSpeedMps: number;
  permissionGranted: boolean;
  coordinates: LngLat[];
}

export interface ZoneIntersection {
  zoneId: string;
  zoneName: string;
  zoneType: string;
  restrictionLevel: RestrictionLevel;
  ruleId: string;
  ruleVersion: string;
  minAltitudeMeters: number | null;
  maxAltitudeMeters: number | null;
  permissionRequired: boolean;
  intersectionType: 'ENDPOINT' | 'MIDDLE_SEGMENT' | 'FULL_CORRIDOR' | 'BOUNDARY_TOUCH';
  altitudeCompliant: boolean;
  summary: string;
}

export interface RuleCheckResult {
  checkId: string;
  ruleId: string;
  title: string;
  zoneId?: string;
  status: CheckStatus;
  explanation: string;
}

export interface ValidationRecord {
  validationId: string;
  flightPlanId: string;
  flightPlanName: string;
  verdict: Verdict;
  routeDistanceMeters: number;
  estimatedFlightTimeSeconds: number;
  plannedAltitudeMeters: number;
  droneModel: string;
  flightSpeedMps: number;
  permissionGranted: boolean;
  startPoint: LngLat;
  destination: LngLat;
  waypoints: LngLat[];
  coordinates: LngLat[];
  originalCoordinates?: LngLat[];
  alternativeRoutes?: AlternativeRouteCandidate[];
  routeGeoJson: {
    type: 'LineString';
    coordinates: LngLat[];
  };
  intersections: ZoneIntersection[];
  checks: RuleCheckResult[];
  violations: string[];
  warnings: string[];
  recommendations: string[];
  ruleVersion: string;
  datasetSource: string;
  disclaimer: string;
  isDemoSeed: boolean;
  timestamp: string;
}

export interface AlternativeRouteCandidate {
  candidateId: string;
  label: string;
  strategy: string;
  coordinates: LngLat[];
  waypoints: LngLat[];
  routeDistanceMeters: number;
  distanceDeltaMeters: number;
  estimatedFlightTimeSeconds: number;
  verdict: Verdict;
  intersections: ZoneIntersection[];
  explanation: string;
  limitations: string;
}

export interface ValidateRouteResponse {
  validation: ValidationRecord;
  alternatives: AlternativeRouteCandidate[];
  alternativesMessage: string | null;
}

export interface DashboardStats {
  totalFlightPlans: number;
  totalValidations: number;
  approvedCount: number;
  conditionalCount: number;
  rejectedCount: number;
  demoSeedCount: number;
  userCreatedCount: number;
  zoneCounts: {
    total: number;
    green: number;
    yellow: number;
    red: number;
  };
  recentValidations: ValidationRecord[];
  datasetSource: string;
  disclaimer: string;
}
