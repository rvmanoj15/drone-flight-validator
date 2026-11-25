# TENORIX — Drone Flight Plan Validator with Airspace Zone Rules

**Tagline:** *Fly Smart. Fly Safe.*

TENORIX is a full-stack geospatial pre-flight validation prototype that lets drone pilots plot routes on an interactive map, configure flight altitude, validate the entire route geometry against Red, Yellow, and Green synthetic airspace zone rules, explore automated detour candidates, and export downloadable PDF validation reports.

> **SYNTHETIC DATA DISCLAIMER:** TENORIX is a hackathon prototype. It uses synthetic demo airspace geometries (`backend/data/zones.geojson`) and prototype rules for demonstration only. It does **not** provide official flight authorization, legal aviation clearance, or guaranteed flight safety.

---

## Problem Statement

Drone pilots may unintentionally plan routes that cross restricted airspace, caution corridors, or altitude-limited sectors. Checking boundaries manually is slow and error-prone—especially when both the takeoff and destination points lie in safe areas, yet an intermediate segment cuts across a restricted zone.

## Proposed Solution

TENORIX solves this with a server-side geospatial validation engine powered by **Turf.js** and **Express**:

- Evaluates the **entire flight LineString**, not only the endpoints.
- Detects interior crossings, endpoint intersections, and boundary touches across closed GeoJSON polygons.
- Enforces configurable **GREEN** (open), **YELLOW** (conditional / permission-required), and **RED** (prohibited) prototype zone rules plus per-zone **minimum/maximum altitude** envelopes.
- Computes deterministic verdicts (**APPROVED**, **CONDITIONAL**, **REJECTED**) with plain-language explanations and rule IDs.
- Generates ranked **2D polygon-buffer detour candidates** when a route intersects a RED zone.
- Produces downloadable **PDF validation reports** via **PDFKit** and persists flight plans & validation records across restarts.

---

## Key Features

- **Interactive GIS Flight Planner** (Leaflet + React-Leaflet + OpenStreetMap / Dark GIS toggle)
- **Click-to-Plot, Drag-to-Edit & Waypoint Management** (`Auto Draw`, `Set Start`, `Insert Waypoint`, `Set Destination`)
- **Full-Route Backend Geospatial Engine** (Turf.js + Zod input validation)
- **Route Alternative Assistance** with map preview and one-click candidate application
- **Hackathon Judge Demo Controls** (`LOAD HACKATHON DEMO`, `DEMO 1 - SAFE ROUTE`, `DEMO 2 - CONDITIONAL ROUTE`, `DEMO 3 - RESTRICTED ROUTE`, `DEMO 4 - ALTITUDE VIOLATION`, `DEMO 5 - MULTI-ZONE CORRIDOR`, `Reset Demo`)
- **Live Operations Dashboard** computed from real persisted records
- **Flight History & Audit Trail** with search, verdict filtering, sorting, revalidation, deletion confirmation, and PDF re-download
- **Airspace Zone Explorer** with RED/YELLOW/GREEN filtering and rule inspection

---

## Technology Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Leaflet, React-Leaflet, Turf.js, Lucide Icons
- **Backend:** Node.js, Express.js, TypeScript, Turf.js, Zod, PDFKit, CORS, Express Rate Limit
- **Storage:** Persistent local JSON repository (`backend/data/db.json`) behind an `IStorageRepository` interface designed for drop-in PostgreSQL + PostGIS replacement
- **Testing:** Vitest + Supertest

---

## Project Structure

```text
tenorix/ (workspace root)
├── package.json
├── README.md
├── backend/
│   ├── data/
│   │   ├── zones.geojson        # 9 synthetic GeoJSON zones (3 GREEN, 3 YELLOW, 3 RED)
│   │   ├── demo-routes.json     # 5 predefined hackathon demo scenarios
│   │   └── db.json              # Persistent flight plans & validation records (auto-created)
│   ├── src/
│   │   ├── algorithms/detourAlgorithm.ts
│   │   ├── controllers/apiController.ts
│   │   ├── routes/apiRoutes.ts
│   │   ├── services/
│   │   │   ├── pdfService.ts
│   │   │   ├── seedService.ts
│   │   │   ├── storageService.ts
│   │   │   └── validationEngine.ts
│   │   ├── types/index.ts
│   │   ├── validators/inputValidators.ts
│   │   ├── app.ts
│   │   └── server.ts
│   └── tests/
│       ├── validation.test.ts   # 14 core geospatial, altitude, and edge-case tests
│       └── api.test.ts          # REST API, PDF, CRUD, and demo consistency tests
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/api.ts
│   │   ├── types/index.ts
│   │   ├── utils/geo.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── vite.config.ts
└── docs/
    ├── architecture.md
    ├── algorithm.md
    └── setup.md
```

---

## Setup & Running Locally

### Prerequisites
- **Node.js 20+** and **npm**

### 1. Install Dependencies
From the workspace root:
```bash
npm run install:all
```

### 2. Run the Backend API (Port `4000`)
```bash
npm run dev:backend
```

### 3. Run the Frontend App (Port `5173`)
In a second terminal:
```bash
npm run dev:frontend
```
Open `http://localhost:5173` in your browser. Vite proxies `/api/*` requests directly to `http://localhost:4000`.

### Environment Variables
- `backend/.env` (optional):
  - `PORT=4000`
  - `CORS_ORIGIN=http://localhost:5173`
- `frontend/.env` (optional):
  - `VITE_API_BASE_URL=/api`

---

## API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service health and dataset metadata |
| `GET` | `/api/zones` | Retrieve synthetic GeoJSON zones (`?level=RED\|YELLOW\|GREEN`) |
| `GET` | `/api/zones/:id` | Retrieve single zone details |
| `GET` | `/api/demo/routes` | Retrieve predefined demo scenarios |
| `POST` | `/api/flight-plans` | Create a flight plan record |
| `GET` | `/api/flight-plans` | List stored flight plans |
| `GET` | `/api/flight-plans/:id` | Get a specific flight plan |
| `PUT` | `/api/flight-plans/:id` | Update a flight plan |
| `DELETE` | `/api/flight-plans/:id` | Delete a flight plan and its validations |
| `POST` | `/api/validate` | Validate full route geometry, altitude, and rules; returns verdict + alternatives |
| `GET` | `/api/validations` | List validation records (`?verdict=...&search=...`) |
| `GET` | `/api/validations/:id` | Retrieve a single validation record |
| `POST` | `/api/route-alternatives` | Compute ranked detour candidates around RED zones |
| `GET` | `/api/dashboard/stats` | Live dashboard metrics from persisted storage |
| `GET` | `/api/reports/:validationId/pdf` | Download formatted PDF validation report |

---

## Testing Commands

Run the full automated backend test suite (17 tests across geospatial rules, edge cases, detour validity, API endpoints, and PDF generation):
```bash
npm test
```

Run production TypeScript & Vite builds:
```bash
npm run build
```

---

## 2-Minute Hackathon Judge Demo Walkthrough

1. Open `http://localhost:5173` and click **Start Flight Planning**.
2. Click **LOAD HACKATHON DEMO** (or **DEMO 3 - RESTRICTED ROUTE**) to load a route whose start and destination are outside restricted airspace, while the middle segment crosses **RED zone `RZ-01`**.
3. Click **Validate Flight**.
4. Observe the **REJECTED** verdict card with exact rule explanations (`RZ-01`, `RULE-R-301`, `MIDDLE_SEGMENT`).
5. Inspect the **Route Alternative Assistance** section and dashed cyan bypass line on the map.
6. Click **Apply Candidate Route** to apply the detour and automatically re-validate into **APPROVED**.
7. Click **Download PDF Report** to download the official-style prototype dossier.

---

## Limitations & Future Scope

- **Synthetic Data Only:** Coordinates represent a fictional valley grid (`SYNTHETIC_DEMO_DATASET_V1`) and not real national airspace.
- **2D Horizontal Detours:** The detour heuristic expands blocking RED polygons in 2D horizontal space and does not model 3D terrain elevation, buildings, or weather.
- **Future Scope:** Drop-in PostgreSQL + PostGIS persistence, DEM terrain clearance, live NOTAM/TFR feeds, and official aviation UTM integration.
