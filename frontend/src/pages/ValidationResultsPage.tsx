import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AirspaceMap } from '../components/AirspaceMap';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { ValidationResultPanel } from '../components/ValidationResultPanel';
import { api } from '../services/api';
import {
  AirspaceZoneFeature,
  AlternativeRouteCandidate,
  ValidationRecord,
} from '../types';

export function ValidationResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [validation, setValidation] = useState<ValidationRecord | null>(null);
  const [zones, setZones] = useState<AirspaceZoneFeature[]>([]);
  const [alternatives, setAlternatives] = useState<AlternativeRouteCandidate[]>([]);
  const [alternativesMsg, setAlternativesMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const zoneRes = await api.getZones();
        if (!active) return;
        setZones(zoneRes.features);

        let record: ValidationRecord | null = null;
        if (id) {
          const res = await api.getValidationById(id);
          record = res.validation;
        } else {
          const list = await api.listValidations();
          record = list.validations[0] ?? null;
        }

        if (!active) return;
        setValidation(record);

        if (record && record.intersections.some((i) => i.restrictionLevel === 'RED')) {
          const altRes = await api.getRouteAlternatives({
            coordinates: record.coordinates,
            plannedAltitudeMeters: record.plannedAltitudeMeters,
            flightSpeedMps: record.flightSpeedMps,
            permissionGranted: record.permissionGranted,
          });
          if (active) {
            setAlternatives(altRes.candidates);
            setAlternativesMsg(altRes.message);
          }
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load validation result');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [id]);

  const handleOpenInPlanner = (coords?: [number, number][], nameOverride?: string) => {
    if (!validation) return;
    navigate('/planner', {
      state: {
        prefillRoute: {
          flightPlanId: validation.flightPlanId,
          name: nameOverride ?? validation.flightPlanName,
          coordinates: coords ?? validation.coordinates,
          plannedAltitudeMeters: validation.plannedAltitudeMeters,
          droneModel: validation.droneModel,
          flightSpeedMps: validation.flightSpeedMps,
          permissionGranted: validation.permissionGranted,
        },
      },
    });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 text-sm text-slate-300">
        Loading validation record...
      </div>
    );
  }

  if (error || !validation) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-slate-800 bg-navy-800 p-6 text-sm text-slate-300">
          {error ?? 'No validation record found. Run a validation in the Flight Planner first.'}
        </div>
        <Link to="/planner" className="inline-flex text-sm font-semibold text-cyan-400">
          ← Go to Flight Planner
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/history"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Flight History
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold text-white">{validation.flightPlanName}</h1>
        </div>
      </div>

      <DisclaimerBanner compact />

      <AirspaceMap
        zones={zones}
        coordinates={validation.coordinates}
        alternativeCoordinates={alternatives[0]?.coordinates ?? null}
        editable={false}
        fitTrigger={1}
        heightClass="h-[360px]"
      />

      <ValidationResultPanel
        validation={validation}
        alternatives={alternatives}
        alternativesMessage={alternativesMsg}
        onModifyRoute={() => handleOpenInPlanner()}
        onRevalidate={() => handleOpenInPlanner()}
        onApplyAlternative={(cand) =>
          handleOpenInPlanner(cand.coordinates, `${validation.flightPlanName} (Detour)`)
        }
      />
    </div>
  );
}
