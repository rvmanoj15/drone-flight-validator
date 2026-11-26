import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AirspaceFeatureCollection,
  AirspaceZoneFeature,
  DemoRoute,
  FlightPlanRecord,
  ValidationRecord,
} from '../types/index.js';
import { validateZonePolygon } from '../validators/inputValidators.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');

export interface DatabaseSchema {
  flightPlans: FlightPlanRecord[];
  validations: ValidationRecord[];
  zones?: AirspaceZoneFeature[];
}

/**
 * Repository interface designed so PostgreSQL + PostGIS can replace JSON storage
 * without altering the geospatial validation engine or API controllers.
 */
export interface IStorageRepository {
  getZones(): AirspaceZoneFeature[];
  getZonesCollection(): AirspaceFeatureCollection;
  getZoneById(id: string): AirspaceZoneFeature | undefined;
  saveZone(zone: AirspaceZoneFeature): AirspaceZoneFeature;
  updateZone(id: string, updated: AirspaceZoneFeature): AirspaceZoneFeature | undefined;
  deleteZone(id: string): boolean;
  clearZones(): void;
  resetZonesToDefault(): AirspaceZoneFeature[];
  getDemoRoutes(): DemoRoute[];
  listFlightPlans(): FlightPlanRecord[];
  getFlightPlanById(id: string): FlightPlanRecord | undefined;
  saveFlightPlan(plan: FlightPlanRecord): FlightPlanRecord;
  updateFlightPlan(id: string, updated: FlightPlanRecord): FlightPlanRecord | undefined;
  deleteFlightPlan(id: string): boolean;
  listValidations(): ValidationRecord[];
  getValidationById(id: string): ValidationRecord | undefined;
  saveValidation(record: ValidationRecord): ValidationRecord;
}

export class JsonFileRepository implements IStorageRepository {
  private readonly zonesPath: string;
  private readonly demoRoutesPath: string;
  private readonly dbPath: string;
  private seedZonesCollectionCache: AirspaceFeatureCollection | null = null;
  private demoRoutesCache: DemoRoute[] | null = null;

  constructor(options?: { zonesPath?: string; demoRoutesPath?: string; dbPath?: string }) {
    this.zonesPath = options?.zonesPath ?? path.join(DATA_DIR, 'zones.geojson');
    this.demoRoutesPath = options?.demoRoutesPath ?? path.join(DATA_DIR, 'demo-routes.json');
    this.dbPath = options?.dbPath ?? path.join(DATA_DIR, 'db.json');
  }

  private readSeedZonesCollection(): AirspaceFeatureCollection {
    if (this.seedZonesCollectionCache) return this.seedZonesCollectionCache;
    const raw = fs.readFileSync(this.zonesPath, 'utf-8');
    const parsed = JSON.parse(raw) as AirspaceFeatureCollection;
    const validFeatures = (parsed.features ?? []).filter((f) => validateZonePolygon(f).valid);
    this.seedZonesCollectionCache = {
      ...parsed,
      features: validFeatures,
    };
    return this.seedZonesCollectionCache;
  }

  private readDb(): DatabaseSchema {
    if (!fs.existsSync(this.dbPath)) {
      const seed = this.readSeedZonesCollection();
      const initial: DatabaseSchema = {
        flightPlans: [],
        validations: [],
        zones: structuredClone(seed.features),
      };
      this.writeDb(initial);
      return initial;
    }
    try {
      const raw = fs.readFileSync(this.dbPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
      let zones = Array.isArray(parsed.zones) ? parsed.zones : undefined;
      const db: DatabaseSchema = {
        flightPlans: Array.isArray(parsed.flightPlans) ? parsed.flightPlans : [],
        validations: Array.isArray(parsed.validations) ? parsed.validations : [],
        zones,
      };
      // Seed zones once if an older db.json file existed without a zones array
      if (zones === undefined) {
        db.zones = structuredClone(this.readSeedZonesCollection().features);
        this.writeDb(db);
      }
      return db;
    } catch {
      return {
        flightPlans: [],
        validations: [],
        zones: structuredClone(this.readSeedZonesCollection().features),
      };
    }
  }

  private writeDb(data: DatabaseSchema): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${this.dbPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.dbPath);
  }

  getZonesCollection(): AirspaceFeatureCollection {
    const seed = this.readSeedZonesCollection();
    const db = this.readDb();
    const activeZones = (db.zones ?? []).filter((f) => validateZonePolygon(f).valid);
    return {
      type: 'FeatureCollection',
      metadata: seed.metadata,
      features: activeZones,
    };
  }

  getZones(): AirspaceZoneFeature[] {
    return this.getZonesCollection().features;
  }

  getZoneById(id: string): AirspaceZoneFeature | undefined {
    return this.getZones().find((z) => z.properties.id === id || z.id === id);
  }

  saveZone(zone: AirspaceZoneFeature): AirspaceZoneFeature {
    const db = this.readDb();
    const zones = db.zones ?? [];
    const existingIndex = zones.findIndex((z) => z.properties.id === zone.properties.id);
    if (existingIndex >= 0) {
      zones[existingIndex] = zone;
    } else {
      zones.push(zone);
    }
    db.zones = zones;
    this.writeDb(db);
    return zone;
  }

  updateZone(id: string, updated: AirspaceZoneFeature): AirspaceZoneFeature | undefined {
    const db = this.readDb();
    const zones = db.zones ?? [];
    const idx = zones.findIndex((z) => z.properties.id === id || z.id === id);
    if (idx < 0) return undefined;
    zones[idx] = updated;
    db.zones = zones;
    this.writeDb(db);
    return updated;
  }

  deleteZone(id: string): boolean {
    const db = this.readDb();
    const zones = db.zones ?? [];
    const next = zones.filter((z) => z.properties.id !== id && z.id !== id);
    if (next.length === zones.length) return false;
    db.zones = next;
    this.writeDb(db);
    return true;
  }

  clearZones(): void {
    const db = this.readDb();
    db.zones = [];
    this.writeDb(db);
  }

  resetZonesToDefault(): AirspaceZoneFeature[] {
    const db = this.readDb();
    const defaults = structuredClone(this.readSeedZonesCollection().features);
    db.zones = defaults;
    this.writeDb(db);
    return defaults;
  }

  getDemoRoutes(): DemoRoute[] {
    if (this.demoRoutesCache) return this.demoRoutesCache;
    const raw = fs.readFileSync(this.demoRoutesPath, 'utf-8');
    this.demoRoutesCache = JSON.parse(raw) as DemoRoute[];
    return this.demoRoutesCache;
  }

  listFlightPlans(): FlightPlanRecord[] {
    return this.readDb().flightPlans.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getFlightPlanById(id: string): FlightPlanRecord | undefined {
    return this.readDb().flightPlans.find((p) => p.id === id);
  }

  saveFlightPlan(plan: FlightPlanRecord): FlightPlanRecord {
    const db = this.readDb();
    const existingIndex = db.flightPlans.findIndex((p) => p.id === plan.id);
    if (existingIndex >= 0) {
      db.flightPlans[existingIndex] = plan;
    } else {
      db.flightPlans.unshift(plan);
    }
    this.writeDb(db);
    return plan;
  }

  updateFlightPlan(id: string, updated: FlightPlanRecord): FlightPlanRecord | undefined {
    const db = this.readDb();
    const index = db.flightPlans.findIndex((p) => p.id === id);
    if (index < 0) return undefined;
    db.flightPlans[index] = updated;
    this.writeDb(db);
    return updated;
  }

  deleteFlightPlan(id: string): boolean {
    const db = this.readDb();
    const initialLen = db.flightPlans.length;
    db.flightPlans = db.flightPlans.filter((p) => p.id !== id);
    db.validations = db.validations.filter((v) => v.flightPlanId !== id);
    if (db.flightPlans.length === initialLen) return false;
    this.writeDb(db);
    return true;
  }

  listValidations(): ValidationRecord[] {
    return this.readDb().validations.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  getValidationById(id: string): ValidationRecord | undefined {
    return this.readDb().validations.find((v) => v.validationId === id);
  }

  saveValidation(record: ValidationRecord): ValidationRecord {
    const db = this.readDb();
    db.validations.unshift(record);
    this.writeDb(db);
    return record;
  }
}
