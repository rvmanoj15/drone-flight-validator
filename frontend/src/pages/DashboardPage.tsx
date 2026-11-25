import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileCheck2,
  Layers,
  Download,
  ExternalLink,
  Play,
  Edit3,
} from 'lucide-react';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { VerdictBadge } from '../components/VerdictBadge';
import { api } from '../services/api';
import { DashboardStats } from '../types';
import { formatDistance } from '../utils/geo';

export function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getDashboardStats()
      .then((data) => {
        if (active) {
          setStats(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-slate-800 bg-navy-800/60 p-8 text-center text-sm text-slate-300">
          Loading live telemetry and stored validation records...
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-6 text-sm text-red-200">
          Unable to load dashboard metrics: {error ?? 'Unknown error'}. Ensure the backend API is running on port 4000.
        </div>
      </div>
    );
  }

  const approvalRate =
    stats.totalValidations > 0
      ? Math.round((stats.approvedCount / stats.totalValidations) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Mission Operations Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Metrics calculated directly from persisted flight plans ({stats.demoSeedCount} demo seed +{' '}
            {stats.userCreatedCount} custom validation runs).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/planner?demo=demo-restricted"
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 transition"
          >
            <Play className="h-4 w-4" />
            Launch Hackathon Demo
          </Link>
          <Link
            to="/planner"
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 shadow hover:bg-cyan-400 transition"
          >
            <PlusCircle className="h-4 w-4" />
            New Flight Plan
          </Link>
        </div>
      </div>

      <DisclaimerBanner compact />

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-navy-800/80 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Flight Plans
            </span>
            <FileCheck2 className="h-5 w-5 text-cyan-400" />
          </div>
          <div className="mt-3 text-3xl font-extrabold text-white">{stats.totalFlightPlans}</div>
          <div className="mt-1 text-xs text-slate-400">
            {stats.totalValidations} stored validation runs
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Approved Plans
            </span>
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="mt-3 text-3xl font-extrabold text-emerald-300">{stats.approvedCount}</div>
          <div className="mt-1 text-xs text-slate-400">{approvalRate}% pass rate across runs</div>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
              Conditional Plans
            </span>
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <div className="mt-3 text-3xl font-extrabold text-amber-300">
            {stats.conditionalCount}
          </div>
          <div className="mt-1 text-xs text-slate-400">Permission or condition required</div>
        </div>

        <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-red-300">
              Rejected Plans
            </span>
            <XCircle className="h-5 w-5 text-red-400" />
          </div>
          <div className="mt-3 text-3xl font-extrabold text-red-300">{stats.rejectedCount}</div>
          <div className="mt-1 text-xs text-slate-400">Prohibited zone or altitude breach</div>
        </div>
      </div>

      {/* Main Grid: Recent Validations + Airspace Overview */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-navy-800/75 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Recent Flight Validations</h2>
            <Link to="/history" className="text-xs font-semibold text-cyan-400 hover:text-cyan-300">
              View All History →
            </Link>
          </div>

          {stats.recentValidations.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No flight validations recorded yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-700/80 text-slate-400">
                    <th className="pb-2.5 font-semibold">Flight Plan</th>
                    <th className="pb-2.5 font-semibold">Verdict</th>
                    <th className="pb-2.5 font-semibold">Altitude</th>
                    <th className="pb-2.5 font-semibold">Distance</th>
                    <th className="pb-2.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {stats.recentValidations.map((rec) => (
                    <tr key={rec.validationId} className="hover:bg-navy-900/50">
                      <td className="py-3 pr-3">
                        <div className="font-semibold text-white">{rec.flightPlanName}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {rec.validationId}
                          {rec.isDemoSeed && (
                            <span className="ml-2 rounded bg-slate-700/70 px-1.5 py-0.5 text-[10px] text-slate-300">
                              DEMO SEED
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <VerdictBadge verdict={rec.verdict} />
                      </td>
                      <td className="py-3 pr-3 text-slate-200">{rec.plannedAltitudeMeters} m</td>
                      <td className="py-3 pr-3 text-slate-200">
                        {formatDistance(rec.routeDistanceMeters)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              navigate('/planner', {
                                state: {
                                  prefillRoute: {
                                    flightPlanId: rec.flightPlanId,
                                    name: rec.flightPlanName,
                                    coordinates: rec.coordinates,
                                    plannedAltitudeMeters: rec.plannedAltitudeMeters,
                                    droneModel: rec.droneModel,
                                    flightSpeedMps: rec.flightSpeedMps,
                                    permissionGranted: rec.permissionGranted,
                                  },
                                },
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-navy-900 px-2.5 py-1 font-semibold text-slate-200 hover:border-cyan-500/50"
                            title="Update this route in Flight Planner"
                          >
                            <Edit3 className="h-3 w-3" />
                            Edit Route
                          </button>
                          <Link
                            to={`/results/${rec.validationId}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-navy-900 px-2.5 py-1 font-semibold text-slate-200 hover:border-cyan-500/50"
                          >
                            Details
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                          <a
                            href={api.getPdfDownloadUrl(rec.validationId)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 font-semibold text-cyan-200 hover:bg-cyan-500/25"
                          >
                            <Download className="h-3 w-3" />
                            PDF
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Airspace Zone Overview */}
        <div className="rounded-2xl border border-slate-800 bg-navy-800/75 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-white">
              <Layers className="h-4 w-4 text-cyan-400" />
              Airspace Zone Overview
            </h2>
            <Link to="/zones" className="text-xs font-semibold text-cyan-400 hover:text-cyan-300">
              Explore →
            </Link>
          </div>

          <p className="text-xs text-slate-400">
            Active dataset: <span className="font-mono text-slate-200">{stats.datasetSource}</span>
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <div>
                <div className="text-xs font-bold text-emerald-300">GREEN ZONES</div>
                <div className="text-[11px] text-slate-300">Open demo corridors</div>
              </div>
              <div className="text-xl font-extrabold text-emerald-300">
                {stats.zoneCounts.green}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <div>
                <div className="text-xs font-bold text-amber-300">YELLOW ZONES</div>
                <div className="text-[11px] text-slate-300">Conditional / permission rules</div>
              </div>
              <div className="text-xl font-extrabold text-amber-300">
                {stats.zoneCounts.yellow}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <div>
                <div className="text-xs font-bold text-red-300">RED ZONES</div>
                <div className="text-[11px] text-slate-300">Prohibited no-fly demo areas</div>
              </div>
              <div className="text-xl font-extrabold text-red-300">{stats.zoneCounts.red}</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/80 bg-navy-900/80 p-3.5">
            <div className="text-xs font-semibold text-white">Validation Breakdown</div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-800 flex">
              {stats.totalValidations > 0 && (
                <>
                  <div
                    style={{ width: `${(stats.approvedCount / stats.totalValidations) * 100}%` }}
                    className="bg-emerald-500"
                  />
                  <div
                    style={{ width: `${(stats.conditionalCount / stats.totalValidations) * 100}%` }}
                    className="bg-amber-500"
                  />
                  <div
                    style={{ width: `${(stats.rejectedCount / stats.totalValidations) * 100}%` }}
                    className="bg-red-500"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
