import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Pentagon,
  Square,
  Circle,
  MousePointer,
  Undo2,
  Trash2,
  Save,
  RotateCcw,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Edit3,
  Download,
} from 'lucide-react';
import { AdminDrawTool, AdminZoneMap } from '../components/AdminZoneMap';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { ZoneLevelBadge } from '../components/VerdictBadge';
import { api } from '../services/api';
import { AirspaceZoneFeature, LngLat, RestrictionLevel } from '../types';

const COLOR_OPTIONS: Array<{
  level: RestrictionLevel;
  title: string;
  subtitle: string;
  swatch: string;
  activeBorder: string;
}> = [
  {
    level: 'RED',
    title: 'RED — No-Fly Zone',
    subtitle: 'Prohibited area (REJECTED)',
    swatch: 'bg-red-500',
    activeBorder: 'border-red-500 bg-red-500/15 text-red-200',
  },
  {
    level: 'YELLOW',
    title: 'YELLOW — Caution',
    subtitle: 'Permission / conditional',
    swatch: 'bg-amber-500',
    activeBorder: 'border-amber-500 bg-amber-500/15 text-amber-200',
  },
  {
    level: 'GREEN',
    title: 'GREEN — Open Zone',
    subtitle: 'Permitted within ceiling',
    swatch: 'bg-emerald-500',
    activeBorder: 'border-emerald-500 bg-emerald-500/15 text-emerald-200',
  },
];

export function AdminPanelPage() {
  const [zones, setZones] = useState<AirspaceZoneFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Drawing & Zone Form State
  const [drawTool, setDrawTool] = useState<AdminDrawTool>('POLYGON');
  const [selectedColor, setSelectedColor] = useState<RestrictionLevel>('RED');
  const [draftVertices, setDraftVertices] = useState<LngLat[]>([]);
  const [circleRadiusMeters, setCircleRadiusMeters] = useState<number>(450);

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [zoneName, setZoneName] = useState('');
  const [zoneDescription, setZoneDescription] = useState('');
  const [minAltitude, setMinAltitude] = useState<number>(0);
  const [maxAltitude, setMaxAltitude] = useState<number>(100);
  const [permissionRequired, setPermissionRequired] = useState<boolean>(true);

  const loadZones = async () => {
    setLoading(true);
    try {
      const res = await api.getZones();
      setZones(res.features);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load airspace zones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadZones();
  }, []);

  const resetForm = (keepTool = true) => {
    setSelectedZoneId(null);
    setDraftVertices([]);
    setZoneName('');
    setZoneDescription('');
    setMinAltitude(selectedColor === 'YELLOW' ? 15 : 0);
    setMaxAltitude(selectedColor === 'YELLOW' ? 90 : 120);
    setPermissionRequired(selectedColor === 'YELLOW');
    if (!keepTool) setDrawTool('POLYGON');
  };

  const handleSelectColor = (level: RestrictionLevel) => {
    setSelectedColor(level);
    if (!selectedZoneId) {
      if (level === 'YELLOW') {
        setMinAltitude(15);
        setMaxAltitude(90);
        setPermissionRequired(true);
      } else if (level === 'GREEN') {
        setMinAltitude(0);
        setMaxAltitude(120);
        setPermissionRequired(false);
      } else {
        setPermissionRequired(false);
      }
    }
  };

  const handleSelectZoneForEdit = (zone: AirspaceZoneFeature) => {
    const p = zone.properties;
    setSelectedZoneId(p.id);
    setSelectedColor(p.restrictionLevel);
    setZoneName(p.name);
    setZoneDescription(p.description);
    setMinAltitude(p.minAltitudeMeters ?? 0);
    setMaxAltitude(p.maxAltitudeMeters ?? 120);
    setPermissionRequired(p.permissionRequired);

    if (zone.geometry.type === 'Polygon') {
      const outer = (zone.geometry.coordinates[0] as number[][])
        .slice(0, -1)
        .map((c) => [c[0], c[1]] as LngLat);
      setDraftVertices(outer);
    } else {
      setDraftVertices([]);
    }
    setDrawTool('POLYGON');
    setStatusMessage(`Editing ${p.id} (${p.name}). Adjust color, rules, or drag vertices on the map.`);
    setError(null);
  };

  const handleSaveZone = async () => {
    if (draftVertices.length < 3) {
      setError('Draw a shape with at least 3 points on the map before saving.');
      return;
    }

    setSaving(true);
    setError(null);
    setStatusMessage(null);

    const fallbackName =
      selectedColor === 'RED'
        ? 'Custom Restricted Zone'
        : selectedColor === 'YELLOW'
          ? 'Custom Caution Zone'
          : 'Custom Green Corridor';

    try {
      if (selectedZoneId) {
        const res = await api.updateZone(selectedZoneId, {
          name: zoneName.trim() || fallbackName,
          restrictionLevel: selectedColor,
          coordinates: draftVertices,
          description: zoneDescription.trim() || undefined,
          minAltitudeMeters: selectedColor === 'RED' ? 0 : Number(minAltitude),
          maxAltitudeMeters: selectedColor === 'RED' ? 0 : Number(maxAltitude),
          permissionRequired: selectedColor === 'YELLOW' ? permissionRequired : false,
        });
        setStatusMessage(`Updated zone ${res.zone.properties.id} (${res.zone.properties.name}). Now visible in Flight Planner.`);
      } else {
        const res = await api.createZone({
          name: zoneName.trim() || fallbackName,
          restrictionLevel: selectedColor,
          coordinates: draftVertices,
          description: zoneDescription.trim() || undefined,
          minAltitudeMeters: selectedColor === 'RED' ? 0 : Number(minAltitude),
          maxAltitudeMeters: selectedColor === 'RED' ? 0 : Number(maxAltitude),
          permissionRequired: selectedColor === 'YELLOW' ? permissionRequired : false,
        });
        setStatusMessage(`Created ${res.zone.properties.restrictionLevel} zone ${res.zone.properties.id} (${res.zone.properties.name}). Now active in Flight Planner.`);
      }

      await loadZones();
      resetForm(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save airspace zone');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteZone = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await api.deleteZone(id);
      if (selectedZoneId === id) {
        resetForm(true);
      }
      setStatusMessage(`Deleted zone ${id}.`);
      await loadZones();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete zone');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.resetZones();
      resetForm(true);
      setStatusMessage('Restored default 9 synthetic demo airspace zones.');
      await loadZones();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset zones');
    } finally {
      setSaving(false);
    }
  };

  const handleClearAllZones = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.clearZones();
      resetForm(true);
      setStatusMessage('Cleared all airspace zones. Pilots now see an open map until you draw new zones.');
      await loadZones();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear zones');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
            Admin Airspace Zone Editor
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Draw custom no-fly, caution, or open shapes on the map and pick a color. Saved zones immediately appear to pilots in the Flight Planner.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={api.getZonesPdfDownloadUrl()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-4 py-2.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25 transition"
          >
            <Download className="h-4 w-4" />
            Download Airspace PDF ({zones.length})
          </a>
          <Link
            to="/planner"
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-xs font-extrabold text-slate-950 shadow hover:bg-cyan-400 transition"
          >
            Test Zones in Flight Planner
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <DisclaimerBanner compact />

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Left: Shape Drawing Map */}
        <div className="space-y-3 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-navy-900/90 px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-slate-400">Shape Tool:</span>
              {(
                [
                  { id: 'POLYGON', label: 'Draw Polygon', icon: Pentagon },
                  { id: 'BOX', label: 'Draw Box', icon: Square },
                  { id: 'CIRCLE', label: 'Draw Circle', icon: Circle },
                  { id: 'SELECT', label: 'Select / Edit Existing', icon: MousePointer },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDrawTool(id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                    drawTool === id
                      ? 'border-cyan-500/40 bg-cyan-500/20 text-cyan-300'
                      : 'border-slate-700/80 bg-navy-800 text-slate-300 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDraftVertices((prev) => prev.slice(0, -1))}
                disabled={draftVertices.length === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-navy-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </button>
              <button
                type="button"
                onClick={() => resetForm(true)}
                disabled={draftVertices.length === 0 && !selectedZoneId}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Shape
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex h-[540px] items-center justify-center rounded-2xl border border-slate-800 bg-navy-900 text-sm text-slate-400">
              Loading airspace map...
            </div>
          ) : (
            <AdminZoneMap
              zones={zones}
              draftVertices={draftVertices}
              selectedColor={selectedColor}
              drawTool={drawTool}
              circleRadiusMeters={circleRadiusMeters}
              selectedZoneId={selectedZoneId}
              onChangeDraftVertices={setDraftVertices}
              onSelectZone={handleSelectZoneForEdit}
            />
          )}
        </div>

        {/* Right: Color & Rule Controls */}
        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-2xl border border-slate-800 bg-navy-800/85 p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                {selectedZoneId ? `Editing Zone ${selectedZoneId}` : 'New Airspace Zone'}
              </h2>
              <span className="font-mono text-xs text-cyan-300">
                {draftVertices.length} vertices
              </span>
            </div>

            {/* Color Picker */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                1. Choose Zone Color & Rule
              </label>
              <div className="space-y-2">
                {COLOR_OPTIONS.map((opt) => {
                  const active = selectedColor === opt.level;
                  return (
                    <button
                      key={opt.level}
                      type="button"
                      onClick={() => handleSelectColor(opt.level)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                        active
                          ? opt.activeBorder
                          : 'border-slate-700/80 bg-navy-900/70 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <span className={`h-4 w-4 shrink-0 rounded-full ${opt.swatch}`} />
                      <div>
                        <div className="text-xs font-bold">{opt.title}</div>
                        <div className="text-[11px] opacity-80">{opt.subtitle}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {drawTool === 'CIRCLE' && (
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300">
                  <span>Circle Radius</span>
                  <span className="font-mono text-cyan-300">{circleRadiusMeters} m</span>
                </div>
                <input
                  type="range"
                  min={150}
                  max={2000}
                  step={50}
                  value={circleRadiusMeters}
                  onChange={(e) => setCircleRadiusMeters(Number(e.target.value))}
                  className="mt-1.5 w-full accent-cyan-400"
                />
              </div>
            )}

            {/* Zone Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300">
                2. Zone Name
              </label>
              <input
                type="text"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder={`e.g., Custom ${selectedColor} Zone`}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            {/* Altitude Limits (non-RED) */}
            {selectedColor !== 'RED' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Min Alt (m)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    value={minAltitude}
                    onChange={(e) => setMinAltitude(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-xs font-mono text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Max Alt (m)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    value={maxAltitude}
                    onChange={(e) => setMaxAltitude(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-xs font-mono text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {selectedColor === 'YELLOW' && (
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-700/80 bg-navy-900/70 p-3 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={permissionRequired}
                  onChange={(e) => setPermissionRequired(e.target.checked)}
                  className="h-4 w-4 rounded accent-amber-400"
                />
                <span>Require Demo Permission to Enter</span>
              </label>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300">
                Description (Optional)
              </label>
              <textarea
                rows={2}
                value={zoneDescription}
                onChange={(e) => setZoneDescription(e.target.value)}
                placeholder="Reason or flight rule note shown to pilots..."
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {statusMessage && (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>{statusMessage}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveZone}
                disabled={saving || draftVertices.length < 3}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-extrabold text-slate-950 shadow hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 transition"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : selectedZoneId ? 'Update Zone' : 'Save Zone'}
              </button>

              {selectedZoneId && (
                <button
                  type="button"
                  onClick={() => handleDeleteZone(selectedZoneId)}
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-xl border border-red-500/40 bg-red-500/15 px-3.5 py-3 text-xs font-bold text-red-200 hover:bg-red-500/25"
                  title="Delete selected zone"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Active Zones List */}
      <div className="rounded-2xl border border-slate-800 bg-navy-800/75 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white">
              Active Airspace Zones ({zones.length})
            </h2>
            <p className="text-xs text-slate-400">
              All zones below are live in the pilot Flight Planner and backend validation engine.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-navy-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-500/50 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Default Zones
            </button>
            <button
              type="button"
              onClick={handleClearAllZones}
              disabled={saving || zones.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-40 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear All
            </button>
          </div>
        </div>

        {zones.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-navy-900/60 p-6 text-center text-xs text-slate-400">
            No airspace zones configured. Draw a shape on the map above or click{' '}
            <strong>Reset Default Zones</strong>.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {zones.map((z) => {
              const p = z.properties;
              const isSelected = selectedZoneId === p.id;
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 transition ${
                    isSelected
                      ? 'border-cyan-500/60 bg-cyan-500/10'
                      : 'border-slate-700/70 bg-navy-900/80'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <ZoneLevelBadge level={p.restrictionLevel} />
                      <span className="font-mono text-xs text-slate-400">{p.id}</span>
                    </div>
                    <div className="truncate text-sm font-bold text-white">{p.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {p.restrictionLevel === 'RED'
                        ? 'No Entry (0 m)'
                        : `Alt: ${p.minAltitudeMeters ?? 0}m–${p.maxAltitudeMeters ?? 120}m`}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSelectZoneForEdit(z)}
                      className="rounded-lg border border-slate-700 bg-navy-800 p-2 text-slate-200 hover:border-cyan-500/50"
                      title="Edit zone"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteZone(p.id)}
                      className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20"
                      title="Delete zone"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
