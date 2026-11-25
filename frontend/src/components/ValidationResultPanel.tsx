import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  RefreshCw,
  Route,
  ShieldCheck,
  Navigation,
  ArrowRight,
  Edit3,
} from 'lucide-react';
import { AlternativeRouteCandidate, ValidationRecord } from '../types';
import { api } from '../services/api';
import { formatDistance, formatDuration } from '../utils/geo';
import { VerdictBadge, ZoneLevelBadge } from './VerdictBadge';

interface ValidationResultPanelProps {
  validation: ValidationRecord;
  alternatives: AlternativeRouteCandidate[];
  alternativesMessage?: string | null;
  onApplyAlternative?: (candidate: AlternativeRouteCandidate) => void;
  onModifyRoute?: () => void;
  onRevalidate?: () => void;
  isRevalidating?: boolean;
}

export function ValidationResultPanel({
  validation,
  alternatives,
  alternativesMessage,
  onApplyAlternative,
  onModifyRoute,
  onRevalidate,
  isRevalidating = false,
}: ValidationResultPanelProps) {
  const verdictStyles = {
    APPROVED: {
      card: 'border-emerald-500/50 bg-emerald-950/40',
      title: 'text-emerald-300',
      icon: CheckCircle2,
      subtitle: 'Flight plan passed all configured prototype airspace and altitude checks.',
    },
    CONDITIONAL: {
      card: 'border-amber-500/50 bg-amber-950/40',
      title: 'text-amber-300',
      icon: AlertTriangle,
      subtitle: 'No hard prohibition detected, but conditional zone requirements remain unmet.',
    },
    REJECTED: {
      card: 'border-red-500/50 bg-red-950/40',
      title: 'text-red-300',
      icon: XCircle,
      subtitle: 'Route violates prohibited zone rules or configured altitude boundaries.',
    },
  }[validation.verdict];

  const VerdictIcon = verdictStyles.icon;

  return (
    <div className="space-y-4">
      {/* Large Verdict Card */}
      <div className={`rounded-2xl border p-5 shadow-lg transition-all ${verdictStyles.card}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 rounded-xl bg-navy-950/70 p-2.5 border border-white/10">
              <VerdictIcon className={`h-7 w-7 ${verdictStyles.title}`} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Validation Verdict
                </span>
                <span className="font-mono text-xs text-slate-400">{validation.validationId}</span>
              </div>
              <h2 className={`mt-1 text-2xl font-extrabold tracking-tight ${verdictStyles.title}`}>
                {validation.verdict}
              </h2>
              <p className="mt-1 text-sm text-slate-200">{verdictStyles.subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onModifyRoute && (
              <button
                type="button"
                onClick={onModifyRoute}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-navy-900/90 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Modify Route
              </button>
            )}
            {onRevalidate && (
              <button
                type="button"
                onClick={onRevalidate}
                disabled={isRevalidating}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50 transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRevalidating ? 'animate-spin' : ''}`} />
                Validate Again
              </button>
            )}
            <a
              href={api.getPdfDownloadUrl(validation.validationId)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow hover:bg-cyan-400 transition"
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF Report
            </a>
          </div>
        </div>

        {/* Summary Metrics */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-white/10 bg-navy-950/60 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Distance</div>
            <div className="mt-1 text-sm font-bold text-white">
              {formatDistance(validation.routeDistanceMeters)}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-navy-950/60 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Est. Time</div>
            <div className="mt-1 text-sm font-bold text-white">
              {formatDuration(validation.estimatedFlightTimeSeconds)}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-navy-950/60 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Altitude</div>
            <div className="mt-1 text-sm font-bold text-white">
              {validation.plannedAltitudeMeters} m AGL
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-navy-950/60 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Zones Hit
            </div>
            <div className="mt-1 text-sm font-bold text-white">{validation.intersections.length}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-navy-950/60 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Violations
            </div>
            <div
              className={`mt-1 text-sm font-bold ${
                validation.violations.length > 0 ? 'text-red-300' : 'text-emerald-300'
              }`}
            >
              {validation.violations.length}
            </div>
          </div>
        </div>
      </div>

      {/* Route Alternative Assistance */}
      {validation.intersections.some((i) => i.restrictionLevel === 'RED') && (
        <div className="rounded-2xl border border-cyan-500/35 bg-navy-800/90 p-5 shadow">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Navigation className="h-5 w-5 text-cyan-400" />
              <h3 className="text-base font-bold text-white">Route Alternative Assistance</h3>
            </div>
            <span className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300 border border-cyan-500/30">
              Automated Detour Heuristic
            </span>
          </div>

          {alternatives.length > 0 ? (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-slate-300">
                {alternativesMessage ??
                  'Candidate bypass routes evaluated against the backend validation engine:'}
              </p>
              {alternatives.map((cand, index) => (
                <div
                  key={cand.candidateId}
                  className="rounded-xl border border-slate-700/80 bg-navy-900/90 p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-cyan-300">
                          Candidate #{index + 1}
                        </span>
                        <VerdictBadge verdict={cand.verdict} />
                        <span className="text-xs text-slate-400">{cand.strategy}</span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-slate-100">{cand.label}</p>
                      <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-400">
                        <span>Distance: {formatDistance(cand.routeDistanceMeters)}</span>
                        <span>
                          Delta: {cand.distanceDeltaMeters >= 0 ? '+' : ''}
                          {cand.distanceDeltaMeters} m
                        </span>
                        <span>ETA: {formatDuration(cand.estimatedFlightTimeSeconds)}</span>
                        <span>Waypoints: {cand.waypoints.length}</span>
                      </div>
                    </div>

                    {onApplyAlternative && (
                      <button
                        type="button"
                        onClick={() => onApplyAlternative(cand)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition"
                      >
                        Apply Candidate Route
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-slate-400">{alternatives[0].limitations}</p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-300">
              {alternativesMessage ??
                'No automatic detour candidate satisfied all configured constraints. Adjust waypoints manually on the map.'}
            </p>
          )}
        </div>
      )}

      {/* Violations, Warnings, Recommendations */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-navy-800/70 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <XCircle className="h-4 w-4 text-red-400" />
            Violations & Warnings
          </h3>
          <div className="mt-3 space-y-2">
            {validation.violations.map((v, i) => (
              <div
                key={`v-${i}`}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200"
              >
                <span className="font-bold text-red-300">VIOLATION: </span>
                {v}
              </div>
            ))}
            {validation.warnings.map((w, i) => (
              <div
                key={`w-${i}`}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
              >
                <span className="font-bold text-amber-300">WARNING: </span>
                {w}
              </div>
            ))}
            {validation.violations.length === 0 && validation.warnings.length === 0 && (
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                No violations or conditional warnings detected.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-navy-800/70 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            Suggested Actions
          </h3>
          <ul className="mt-3 space-y-2">
            {validation.recommendations.map((rec, i) => (
              <li
                key={`r-${i}`}
                className="rounded-lg border border-slate-700/70 bg-navy-900/70 px-3 py-2 text-xs text-slate-200"
              >
                {rec}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Intersected Zones */}
      <div className="rounded-2xl border border-slate-800 bg-navy-800/70 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <Route className="h-4 w-4 text-cyan-400" />
          Intersected Airspace Zones ({validation.intersections.length})
        </h3>
        {validation.intersections.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">
            No synthetic zone polygons intersected along this route.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {validation.intersections.map((hit) => (
              <div
                key={hit.zoneId}
                className="rounded-xl border border-slate-700/70 bg-navy-900/80 p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ZoneLevelBadge level={hit.restrictionLevel} />
                    <span className="font-bold text-white">
                      {hit.zoneId} — {hit.zoneName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                    <span>{hit.ruleId}</span>
                    <span>•</span>
                    <span>{hit.intersectionType}</span>
                  </div>
                </div>
                <p className="mt-1.5 text-slate-300">{hit.summary}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rule Checks Performed */}
      <div className="rounded-2xl border border-slate-800 bg-navy-800/70 p-4">
        <h3 className="text-sm font-bold text-white">
          Rule Checks Performed ({validation.checks.length})
        </h3>
        <div className="mt-3 divide-y divide-slate-800">
          {validation.checks.map((chk) => {
            const badgeColor =
              chk.status === 'PASS'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : chk.status === 'WARN'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-red-500/15 text-red-300 border-red-500/30';
            return (
              <div key={chk.checkId} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${badgeColor}`}
                    >
                      {chk.status}
                    </span>
                    <span className="text-xs font-semibold text-white">{chk.title}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">{chk.ruleId}</span>
                </div>
                <p className="mt-1 text-xs text-slate-300">{chk.explanation}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
