# TENORIX Architecture

## System Overview

TENORIX separates presentation, geospatial rule evaluation, detour synthesis, PDF reporting, and persistence into clean layers:

1. **Frontend (`frontend/`)**
   - Built with React 18, TypeScript, Vite, Tailwind CSS, and React-Leaflet.
   - Displays interactive OpenStreetMap / Dark GIS maps, GeoJSON zone polygons, draggable route vertices, and validation dashboards.
   - Performs only non-authoritative client-side distance/ETA previews; all verdicts come from the backend API.

2. **API & Controller Layer (`backend/src/routes`, `backend/src/controllers`)**
   - Express REST endpoints under `/api/*`.
   - Enforces request schemas via **Zod** (`backend/src/validators/inputValidators.ts`), CORS, and rate limiting.

3. **Geospatial Validation Engine (`backend/src/services/validationEngine.ts`)**
   - Uses `@turf/turf` to validate LineStrings against closed GeoJSON Polygons/MultiPolygons.
   - Computes route distance, classifies intersection geometry (`ENDPOINT`, `MIDDLE_SEGMENT`, `FULL_CORRIDOR`, `BOUNDARY_TOUCH`), evaluates zone rules and altitude ceilings, and assigns verdict priority (`REJECTED` > `CONDITIONAL` > `APPROVED`).

4. **Detour Heuristic (`backend/src/algorithms/detourAlgorithm.ts`)**
   - Generates candidate bypass paths around blocking RED polygons using progressive Turf buffers and bounding-box perimeter offsets.
   - Re-runs every candidate through `validateFlightRoute` so no invalid candidate is ever recommended.

5. **Storage Layer (`backend/src/services/storageService.ts`)**
   - Exposes `IStorageRepository` implemented by `JsonFileRepository` (`backend/data/db.json` with atomic temp-file writes).
   - Designed so PostgreSQL + PostGIS (`ST_Intersects`, `ST_Length`) can replace `JsonFileRepository` without modifying `validationEngine.ts` or controllers.

6. **PDF Reporting (`backend/src/services/pdfService.ts`)**
   - Streams structured A4 reports with PDFKit containing flight metadata, coordinates, zone hits, rule checks, recommendations, and synthetic-data disclaimers.
