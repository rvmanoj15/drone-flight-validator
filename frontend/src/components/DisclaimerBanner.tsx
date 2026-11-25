import { AlertTriangle } from 'lucide-react';

interface DisclaimerBannerProps {
  compact?: boolean;
}

export function DisclaimerBanner({ compact = false }: DisclaimerBannerProps) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 ${
        compact ? 'px-3.5 py-2.5 text-xs' : 'px-4 py-3 text-xs sm:text-sm'
      } text-amber-200`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <p className="leading-relaxed">
        <span className="font-semibold text-amber-300">Prototype Synthetic Airspace Notice:</span>{' '}
        TENORIX uses synthetic demo zones and prototype rules for hackathon demonstration only. It does
        not provide official flight authorization, real aviation clearance, or guaranteed flight safety.
      </p>
    </div>
  );
}
