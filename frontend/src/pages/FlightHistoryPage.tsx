import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  Download,
  ExternalLink,
  RefreshCw,
  Trash2,
  ArrowUpDown,
} from 'lucide-react';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { VerdictBadge } from '../components/VerdictBadge';
import { api } from '../services/api';
import { ValidationRecord, Verdict } from '../types';
import { formatDistance } from '../utils/geo';

export function FlightHistoryPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<ValidationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [verdictFilter, setVerdictFilter] = useState<'ALL' | Verdict>('ALL');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'distance'>('newest');
  const [deleteTarget, setDeleteTarget] = useState<ValidationRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await api.listValidations();
      setRecords(res.validations);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load flight history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = records.filter((r) => {
      if (verdictFilter !== 'ALL' && r.verdict !== verdictFilter) return false;
      if (
        q &&
        !r.flightPlanName.toLowerCase().includes(q) &&
        !r.validationId.toLowerCase().includes(q) &&
        !r.droneModel.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortOrder === 'oldest') {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      }
      if (sortOrder === 'distance') {
        return b.routeDistanceMeters - a.routeDistanceMeters;
      }
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return list;
  }, [records, search, verdictFilter, sortOrder]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteFlightPlan(deleteTarget.flightPlanId);
      setDeleteTarget(null);
      await fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete flight plan');
    } finally {
      setDeleting(false);
    }
  };

  const handleRevalidate = (rec: ValidationRecord) => {
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
    });
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
            Flight Validation History
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Persisted pre-flight checks across restarts. Search, inspect, revalidate, or export PDF reports.
          </p>
        </div>

        <Link
          to="/planner"
          className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-400 transition"
        >
          + Plan New Route
        </Link>
      </div>

      <DisclaimerBanner compact />

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-navy-800/80 p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by flight plan name, ID, or drone model..."
            className="w-full rounded-xl border border-slate-700 bg-navy-950 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['ALL', 'APPROVED', 'CONDITIONAL', 'REJECTED'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVerdictFilter(v)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                verdictFilter === v
                  ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
                  : 'border-slate-700 bg-navy-900 text-slate-300 hover:text-white'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-slate-400" />
          <select
            aria-label="Sort flight history"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest' | 'distance')}
            className="rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-xs font-semibold text-slate-200 focus:border-cyan-500 focus:outline-none"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="distance">Longest Distance</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-navy-800/60 p-8 text-center text-sm text-slate-400">
          Loading stored validation history...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-navy-900/50 p-10 text-center">
          <p className="text-sm font-semibold text-slate-300">No matching validation records found.</p>
          <p className="mt-1 text-xs text-slate-400">
            Adjust your filters or validate a new route in the Flight Planner.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((rec) => (
            <div
              key={rec.validationId}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-navy-800/75 p-4 transition hover:border-slate-700"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <VerdictBadge verdict={rec.verdict} size="md" />
                  <h3 className="text-base font-bold text-white">{rec.flightPlanName}</h3>
                  {rec.isDemoSeed && (
                    <span className="rounded bg-slate-700/80 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-300">
                      Demo Seed
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                  <span className="font-mono text-slate-300">{rec.validationId}</span>
                  <span>Alt: {rec.plannedAltitudeMeters} m</span>
                  <span>Dist: {formatDistance(rec.routeDistanceMeters)}</span>
                  <span>Zones Hit: {rec.intersections.length}</span>
                  <span>{new Date(rec.timestamp).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/results/${rec.validationId}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-navy-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-500/50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Details
                </Link>
                <button
                  type="button"
                  onClick={() => handleRevalidate(rec)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-navy-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-500/50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Revalidate
                </button>
                <a
                  href={api.getPdfDownloadUrl(rec.validationId)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500/15 border border-cyan-500/40 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25"
                >
                  <Download className="h-3.5 w-3.5" />
                  PDF
                </a>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(rec)}
                  className="inline-flex items-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20"
                  title="Delete flight plan & history"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-navy-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Delete Flight Plan Record?</h3>
            <p className="text-sm text-slate-300">
              This will permanently remove <strong>{deleteTarget.flightPlanName}</strong> (
              <span className="font-mono">{deleteTarget.flightPlanId}</span>) and its associated
              validation history.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-xl border border-slate-700 bg-navy-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
