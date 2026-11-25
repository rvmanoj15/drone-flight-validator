import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  Play,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Undo2,
  MapPin,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { AirspaceMap, DrawMode } from '../components/AirspaceMap';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { ValidationResultPanel } from '../components/ValidationResultPanel';
import { api } from '../services/api';
import {
  AirspaceZoneFeature,
  AlternativeRouteCandidate,
  DemoRoute,
  LngLat,
  ValidationRecord,
} from '../types';
import {
  computeRouteDistanceMeters,
  formatCoord,
  formatDistance,
  formatDuration,
} from '../utils/geo';

interface LocationPrefillState {
  prefillRoute?: {
    flightPlanId?: string;
    name: string;
    coordinates: LngLat[];
    plannedAltitudeMeters: number;
    droneModel: string;
    flightSpeedMps: number;
    permissionGranted: boolean;
  };
}

export function FlightPlannerPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const resultsRef = useRef<HTMLDivElement>(null);

  const [zones, setZones] = useState<AirspaceZoneFeature[]>([]);
  const [demoRoutes, setDemoRoutes] = useState<DemoRoute[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  // Route & Flight Plan Form State
  const [editingFlightPlanId, setEditingFlightPlanId] = useState<string | undefined>(undefined);
  const [originalRouteCoords, setOriginalRouteCoords] = useState<LngLat[] | undefined>(undefined);
  const [flightName, setFlightName] = useState('Custom UAV Inspection Route');
  const [coordinates, setCoordinates] = useState<LngLat[]>([]);
  const [altitudeMeters, setAltitudeMeters] = useState<number>(60);
  const [droneModel, setDroneModel] = useState('Tenorix Scout X4');
  const [flightSpeedMps, setFlightSpeedMps] = useState<number>(12);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>('AUTO');
  const [fitTrigger, setFitTrigger] = useState(0);

  // Validation Output State
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationRecord | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeRouteCandidate[]>([]);
  const [alternativesMessage, setAlternativesMessage] = useState<string | null>(null);
  const [previewAltCoords, setPreviewAltCoords] = useState<LngLat[] | null>(null);

  const loadDemoScenario = (demo: DemoRoute) => {
    setEditingFlightPlanId(undefined);
    setOriginalRouteCoords(undefined);
    setFlightName(demo.name);
    setCoordinates(demo.coordinates);
    setAltitudeMeters(demo.plannedAltitudeMeters);
    setDroneModel(demo.droneModel);
    setFlightSpeedMps(demo.flightSpeedMps);
    setPermissionGranted(demo.permissionGranted);
    setValidationResult(null);
    setAlternatives([]);
    setAlternativesMessage(null);
    setPreviewAltCoords(null);
    setValidationError(null);
    setFitTrigger((n) => n + 1);
  };

  useEffect(() => {
    let active = true;
    Promise.all([api.getZones(), api.getDemoRoutes()])
      .then(([zoneCollection, demoRes]) => {
        if (!active) return;
        setZones(zoneCollection.features);
        setDemoRoutes(demoRes.routes);

        const state = location.state as LocationPrefillState | null;
        if (state?.prefillRoute) {
          const p = state.prefillRoute;
          setEditingFlightPlanId(p.flightPlanId);
          setOriginalRouteCoords(p.coordinates);
          setFlightName(p.name);
          setCoordinates(p.coordinates);
          setAltitudeMeters(p.plannedAltitudeMeters);
          setDroneModel(p.droneModel);
          setFlightSpeedMps(p.flightSpeedMps);
          setPermissionGranted(p.permissionGranted);
          setFitTrigger((n) => n + 1);
          return;
        }

        const demoParam = searchParams.get('demo');
        if (demoParam) {
          const match = demoRes.routes.find((d) => d.id === demoParam);
          if (match) {
            loadDemoScenario(match);
            return;
          }
        }
        setFitTrigger((n) => n + 1);
      })
      .catch((err) => {
        if (active) setInitError(err instanceof Error ? err.message : 'Failed to initialize planner');
      })
      .finally(() => {
        if (active) setLoadingInit(false);
      });
    return () => {
      active = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const estimatedDistance = useMemo(() => computeRouteDistanceMeters(coordinates), [coordinates]);
  const estimatedDurationSec = useMemo(() => {
    if (estimatedDistance === 0) return 0;
    const speed = flightSpeedMps > 0 ? flightSpeedMps : 12;
    return Math.max(1, Math.round(estimatedDistance / speed));
  }, [estimatedDistance, flightSpeedMps]);

  const handleLoadHackathonDemo = () => {
    const restricted = demoRoutes.find((d) => d.id === 'demo-restricted') ?? demoRoutes[0];
    if (restricted) {
      loadDemoScenario(restricted);
    }
  };

  const handleResetDemo = () => {
    setEditingFlightPlanId(undefined);
    setOriginalRouteCoords(undefined);
    setFlightName('Custom UAV Inspection Route');
    setCoordinates([]);
    setAltitudeMeters(60);
    setDroneModel('Tenorix Scout X4');
    setFlightSpeedMps(12);
    setPermissionGranted(false);
    setValidationResult(null);
    setAlternatives([]);
    setAlternativesMessage(null);
    setPreviewAltCoords(null);
    setValidationError(null);
    setDrawMode('AUTO');
    setFitTrigger((n) => n + 1);
  };

  const runValidation = async (overrideCoords?: LngLat[], overrideOriginalCoords?: LngLat[]) => {
    const targetCoords = overrideCoords ?? coordinates;
    if (targetCoords.length < 2) {
      setValidationError('Please add at least 2 points (Start and Destination) on the map first.');
      return;
    }

    const origCoords =
      overrideOriginalCoords ??
      (originalRouteCoords &&
      JSON.stringify(originalRouteCoords) !== JSON.stringify(targetCoords)
        ? originalRouteCoords
        : undefined);

    setValidating(true);
    setValidationError(null);
    try {
      const response = await api.validateFlight({
        name: flightName.trim() || 'Untitled Drone Route',
        coordinates: targetCoords,
        originalCoordinates: origCoords,
        plannedAltitudeMeters: Number(altitudeMeters),
        droneModel: droneModel.trim() || 'Generic Quadcopter UAV',
        flightSpeedMps: Number(flightSpeedMps) || 12,
        permissionGranted,
        flightPlanId: editingFlightPlanId,
      });
      setEditingFlightPlanId(response.validation.flightPlanId);
      setValidationResult(response.validation);
      setAlternatives(response.alternatives);
      setAlternativesMessage(response.alternativesMessage);
      setPreviewAltCoords(
        response.alternatives.length > 0 ? response.alternatives[0].coordinates : null
      );
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Validation request failed.');
    } finally {
      setValidating(false);
    }
  };

  const handleApplyAlternative = async (candidate: AlternativeRouteCandidate) => {
    const priorCoords = [...coordinates];
    setOriginalRouteCoords(priorCoords);
    setCoordinates(candidate.coordinates);
    setPreviewAltCoords(null);
    setFlightName((prev) => (prev.includes('(Detour)') ? prev : `${prev} (Detour)`));
    setFitTrigger((n) => n + 1);
    await runValidation(candidate.coordinates, priorCoords);
  };

  const quickDemoIds = ['demo-safe', 'demo-conditional', 'demo-restricted'];
  const primaryDemos = quickDemoIds
    .map((id) => demoRoutes.find((d) => d.id === id))
    .filter((d): d is DemoRoute => Boolean(d));
  const extraDemos = demoRoutes.filter((d) => !quickDemoIds.includes(d.id));

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:px-6">
      {/* Top Demo & Judge Quick Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-navy-900/90 p-3.5 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleLoadHackathonDemo}
            disabled={demoRoutes.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3.5 py-2 text-xs font-extrabold tracking-wide text-slate-950 shadow hover:bg-cyan-400 disabled:opacity-50 transition"
          >
            <Sparkles className="h-4 w-4" />
            LOAD HACKATHON DEMO
          </button>

          {primaryDemos.map((demo) => {
            const pillColor =
              demo.expectedVerdict === 'APPROVED'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                : demo.expectedVerdict === 'CONDITIONAL'
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                  : 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20';
            return (
              <button
                key={demo.id}
                type="button"
                onClick={() => loadDemoScenario(demo)}
                title={demo.description}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${pillColor}`}
              >
                {demo.shortLabel}
              </button>
            );
          })}

          {extraDemos.length > 0 && (
            <select
              aria-label="More demo scenarios"
              value=""
              onChange={(e) => {
                const selected = demoRoutes.find((d) => d.id === e.target.value);
                if (selected) loadDemoScenario(selected);
              }}
              className="rounded-xl border border-slate-700 bg-navy-800 px-3 py-2 text-xs font-medium text-slate-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="" disabled>
                More Scenarios ({extraDemos.length})...
              </option>
              {extraDemos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.shortLabel} ({d.expectedVerdict})
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          type="button"
          onClick={handleResetDemo}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-navy-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white transition"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Demo
        </button>
      </div>

      {initError && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200">
          {initError}
        </div>
      )}

      {/* Main Map + Control Sidebar */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Map Column (Main Focus) */}
        <div className="space-y-3 lg:col-span-8">
          {/* Drawing Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-navy-900/90 px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-slate-400">Map Click Mode:</span>
              {(
                [
                  { id: 'AUTO', label: 'Draw Route' },
                  { id: 'START', label: 'Set Start' },
                  { id: 'WAYPOINT', label: 'Add Waypoint' },
                  { id: 'DESTINATION', label: 'Set Destination' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setDrawMode(m.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    drawMode === m.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-navy-800 text-slate-300 border border-slate-700/80 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCoordinates((prev) => prev.slice(0, -1))}
                disabled={coordinates.length === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-navy-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </button>
              <button
                type="button"
                onClick={() => {
                  setCoordinates([]);
                  setValidationResult(null);
                  setPreviewAltCoords(null);
                }}
                disabled={coordinates.length === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Route
              </button>
            </div>
          </div>

          {loadingInit ? (
            <div className="flex h-[560px] items-center justify-center rounded-2xl border border-slate-800 bg-navy-900 text-sm text-slate-400">
              Loading airspace map and GeoJSON zones...
            </div>
          ) : (
            <AirspaceMap
              zones={zones}
              coordinates={coordinates}
              alternativeCoordinates={previewAltCoords}
              drawMode={drawMode}
              editable
              onChangeCoordinates={(next) => {
                setCoordinates(next);
                setPreviewAltCoords(null);
              }}
              fitTrigger={fitTrigger}
              heightClass="h-[560px]"
            />
          )}

          <p className="text-xs text-slate-400">
            Tip: Click anywhere on the map to add points, drag any marker (S, 1, 2..., D) to reshape
            the corridor, or click a marker to remove it. Click any colored zone polygon to inspect
            its configured rules.
          </p>
        </div>

        {/* Right Flight Plan Controls Panel */}
        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-2xl border border-slate-800 bg-navy-800/85 p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Flight Parameters</h2>
              <span className="font-mono text-[11px] text-cyan-300">
                {coordinates.length} pts
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Flight Plan Name</label>
              <input
                type="text"
                value={flightName}
                onChange={(e) => setFlightName(e.target.value)}
                placeholder="e.g., Horizon Corridor Inspection"
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">
                  Planned Altitude (meters AGL)
                </label>
                <span className="font-mono text-xs font-bold text-cyan-300">{altitudeMeters} m</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={5}
                  value={Math.min(200, Math.max(0, altitudeMeters))}
                  onChange={(e) => setAltitudeMeters(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
                <input
                  type="number"
                  min={0}
                  max={5000}
                  value={altitudeMeters}
                  onChange={(e) => setAltitudeMeters(Number(e.target.value))}
                  className="w-24 rounded-xl border border-slate-700 bg-navy-950 px-2.5 py-1.5 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Drone Model (opt.)
                </label>
                <input
                  type="text"
                  value={droneModel}
                  onChange={(e) => setDroneModel(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Speed (m/s, opt.)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={flightSpeedMps}
                  onChange={(e) => setFlightSpeedMps(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-xs font-mono text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-700/80 bg-navy-900/70 p-3 text-xs">
              <input
                type="checkbox"
                checked={permissionGranted}
                onChange={(e) => setPermissionGranted(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-cyan-400"
              />
              <span className="text-slate-300">
                <strong className="text-white">Demo Permission Supplied</strong>
                <span className="block text-[11px] text-slate-400">
                  Simulates operator clearance for YELLOW conditional zones.
                </span>
              </span>
            </label>

            {/* Telemetry Preview */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-700/80 bg-navy-950/70 p-3">
              <div>
                <div className="text-[11px] text-slate-400">Est. Route Distance</div>
                <div className="mt-0.5 text-sm font-bold text-white">
                  {estimatedDistance > 0 ? formatDistance(estimatedDistance) : '—'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Est. Flight Time</div>
                <div className="mt-0.5 text-sm font-bold text-white">
                  {estimatedDurationSec > 0 ? formatDuration(estimatedDurationSec) : '—'}
                </div>
              </div>
            </div>

            {/* Route Coordinates List */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-300">Route Coordinates</div>
              {coordinates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-navy-950/40 p-3 text-center text-xs text-slate-400">
                  Click the map to plot Start & Destination, or click{' '}
                  <strong className="text-cyan-300">LOAD HACKATHON DEMO</strong>.
                </div>
              ) : (
                <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {coordinates.map((c, idx) => {
                    const role =
                      idx === 0
                        ? 'START'
                        : idx === coordinates.length - 1 && coordinates.length > 1
                          ? 'DEST'
                          : `WP ${idx}`;
                    return (
                      <div
                        key={`list-${idx}-${c[0]}-${c[1]}`}
                        className="flex items-center justify-between rounded-lg border border-slate-800 bg-navy-950/80 px-2.5 py-1.5 text-[11px]"
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3 text-cyan-400" />
                          <span className="font-bold text-slate-200">{role}</span>
                          <span className="font-mono text-slate-400">{formatCoord(c)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setCoordinates((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-slate-400 hover:text-red-400"
                          title="Remove point"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {validationError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Primary Action Buttons */}
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => runValidation()}
                disabled={validating || coordinates.length < 2}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-extrabold text-slate-950 shadow-lg hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 transition"
              >
                {validating ? (
                  <>Validating...</>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Validate Flight
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResetDemo}
                className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-navy-900 px-3.5 py-3 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition"
                title="Reset Flight"
              >
                Reset
              </button>
            </div>
          </div>

          <DisclaimerBanner compact />
        </div>
      </div>

      {/* Validation Results Section */}
      {validationResult && (
        <div ref={resultsRef} className="pt-2">
          <ValidationResultPanel
            validation={validationResult}
            alternatives={alternatives}
            alternativesMessage={alternativesMessage}
            onApplyAlternative={handleApplyAlternative}
            onModifyRoute={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            onRevalidate={() => runValidation()}
            isRevalidating={validating}
          />
        </div>
      )}
    </div>
  );
}
