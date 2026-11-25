import { useEffect, useMemo, useState } from 'react';
import { Layers, ShieldAlert } from 'lucide-react';
import { AirspaceMap } from '../components/AirspaceMap';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { ZoneLevelBadge } from '../components/VerdictBadge';
import { api } from '../services/api';
import { AirspaceZoneFeature, RestrictionLevel } from '../types';

export function ZonesExplorerPage() {
  const [zones, setZones] = useState<AirspaceZoneFeature[]>([]);
  const [filter, setFilter] = useState<'ALL' | RestrictionLevel>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getZones()
      .then((res) => setZones(res.features))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load zones'))
      .finally(() => setLoading(false));
  }, []);

  const filteredZones = useMemo(() => {
    if (filter === 'ALL') return zones;
    return zones.filter((z) => z.properties.restrictionLevel === filter);
  }, [zones, filter]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-extrabold text-white sm:text-3xl">
            <Layers className="h-7 w-7 text-cyan-400" />
            Airspace Zone Explorer
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Inspect synthetic GeoJSON zone polygons, altitude ceilings, permission requirements, and rule identifiers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['ALL', 'RED', 'YELLOW', 'GREEN'] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setFilter(level)}
              className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                filter === level
                  ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
                  : 'border-slate-700 bg-navy-800 text-slate-300 hover:text-white'
              }`}
            >
              {level} {level === 'ALL' ? `(${zones.length})` : `(${zones.filter((z) => z.properties.restrictionLevel === level).length})`}
            </button>
          ))}
        </div>
      </div>

      <DisclaimerBanner />

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {!loading && (
        <AirspaceMap
          zones={filteredZones}
          coordinates={[]}
          editable={false}
          fitTrigger={filteredZones.length}
          heightClass="h-[380px]"
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredZones.map((zone) => {
          const p = zone.properties;
          const vertexCount =
            zone.geometry.type === 'Polygon' ? (zone.geometry.coordinates[0]?.length ?? 0) : 0;

          return (
            <div
              key={p.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-navy-800/80 p-5 space-y-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <ZoneLevelBadge level={p.restrictionLevel} />
                  <span className="font-mono text-xs text-slate-400">{p.ruleId}</span>
                </div>
                <h3 className="text-base font-bold text-white">
                  {p.id} — {p.name}
                </h3>
                <p className="text-xs leading-relaxed text-slate-300">{p.description}</p>
              </div>

              <div className="space-y-1.5 rounded-xl border border-slate-700/70 bg-navy-900/80 p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Zone Type</span>
                  <span className="font-mono text-slate-200">{p.zoneType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Altitude Limits</span>
                  <span className="font-semibold text-white">
                    {p.restrictionLevel === 'RED'
                      ? 'No Entry (0 m)'
                      : `${p.minAltitudeMeters ?? 0} m – ${p.maxAltitudeMeters ?? 120} m`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Demo Permission</span>
                  <span className="text-slate-200">
                    {p.permissionRequired ? 'Required' : 'Not Required'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Boundary Vertices</span>
                  <span className="font-mono text-slate-200">{vertexCount} closed pts</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Source / Version</span>
                  <span className="font-mono text-[11px] text-slate-300">{p.ruleVersion}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Last Updated</span>
                  <span className="text-slate-300">
                    {new Date(p.lastUpdated).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-amber-300/90">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span>{p.dataSource} (Synthetic Demo)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
