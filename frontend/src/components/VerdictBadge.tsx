import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Verdict, RestrictionLevel } from '../types';

export function VerdictBadge({ verdict, size = 'sm' }: { verdict: Verdict; size?: 'sm' | 'md' }) {
  const styles: Record<Verdict, { classes: string; icon: typeof CheckCircle2; label: string }> = {
    APPROVED: {
      classes: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
      icon: CheckCircle2,
      label: 'APPROVED',
    },
    CONDITIONAL: {
      classes: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
      icon: AlertTriangle,
      label: 'CONDITIONAL',
    },
    REJECTED: {
      classes: 'border-red-500/40 bg-red-500/15 text-red-300',
      icon: XCircle,
      label: 'REJECTED',
    },
  };

  const { classes, icon: Icon, label } = styles[verdict];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide ${classes} ${
        size === 'md' ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-[11px]'
      }`}
    >
      <Icon className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
      {label}
    </span>
  );
}

export function ZoneLevelBadge({ level }: { level: RestrictionLevel }) {
  const map: Record<RestrictionLevel, string> = {
    GREEN: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    YELLOW: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
    RED: 'border-red-500/40 bg-red-500/15 text-red-300',
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold tracking-wider ${map[level]}`}
    >
      {level}
    </span>
  );
}
