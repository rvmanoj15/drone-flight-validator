import { useState } from 'react';
import { Compass, Cpu, Users, Lightbulb, Rocket, AlertTriangle } from 'lucide-react';
import { DisclaimerBanner } from '../components/DisclaimerBanner';

const initialTeam = [
  { name: 'Member 1 (Editable)', role: 'Geospatial & Backend Lead', focus: 'Turf.js Engine, REST API, Detour Heuristic' },
  { name: 'Member 2 (Editable)', role: 'Frontend & GIS UI Lead', focus: 'React, Leaflet Interactive Map, Mission UX' },
  { name: 'Member 3 (Editable)', role: 'Systems, Testing & Docs', focus: 'Vitest Suite, PDFKit Reports, Demo Scenarios' },
];

export function AboutPage() {
  const [team, setTeam] = useState(initialTeam);

  const updateMemberName = (index: number, value: string) => {
    setTeam((prev) => prev.map((m, i) => (i === index ? { ...m, name: value } : m)));
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300">
          <Compass className="h-3.5 w-3.5" />
          Project Dossier
        </div>
        <h1 className="text-3xl font-extrabold text-white">About TENORIX</h1>
        <p className="text-sm text-slate-300 max-w-3xl">
          TENORIX (Drone Flight Plan Validator with Airspace Zone Rules) is a full-stack geospatial
          pre-flight validation prototype built to make drone route safety checks transparent, fast,
          and explainable.
        </p>
      </div>

      <DisclaimerBanner />

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-navy-800/75 p-6 space-y-3">
          <div className="flex items-center gap-2 text-base font-bold text-white">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Problem Statement
          </div>
          <p className="text-sm leading-relaxed text-slate-300">
            Drone pilots can inadvertently plan routes that cross restricted zones, caution corridors,
            or altitude-capped areas. Manual boundary inspection is slow and error-prone — especially
            when the takeoff and landing points are both safe, yet an intermediate flight segment
            cuts across a restricted polygon.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-navy-800/75 p-6 space-y-3">
          <div className="flex items-center gap-2 text-base font-bold text-white">
            <Lightbulb className="h-5 w-5 text-cyan-400" />
            Proposed Solution & Innovation
          </div>
          <p className="text-sm leading-relaxed text-slate-300">
            TENORIX validates the complete flight LineString on the backend against closed GeoJSON
            polygons and altitude rules, classifies flights into APPROVED, CONDITIONAL, or REJECTED,
            provides plain-language rule explanations, suggests validated 2D polygon-buffer detour
            candidates, and exports an audit-ready PDF report.
          </p>
        </div>
      </div>

      {/* Technology Stack */}
      <div className="rounded-2xl border border-slate-800 bg-navy-800/75 p-6 space-y-4">
        <div className="flex items-center gap-2 text-base font-bold text-white">
          <Cpu className="h-5 w-5 text-cyan-400" />
          Technology Stack
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div className="rounded-xl border border-slate-700/80 bg-navy-900/80 p-4 space-y-1.5">
            <div className="font-bold text-cyan-300">Frontend</div>
            <p className="text-slate-300">React 18, TypeScript, Vite, Tailwind CSS, Leaflet, React-Leaflet, Turf.js</p>
          </div>
          <div className="rounded-xl border border-slate-700/80 bg-navy-900/80 p-4 space-y-1.5">
            <div className="font-bold text-cyan-300">Backend & Geospatial</div>
            <p className="text-slate-300">Node.js, Express.js, TypeScript, Turf.js, Zod, Express Rate Limit</p>
          </div>
          <div className="rounded-xl border border-slate-700/80 bg-navy-900/80 p-4 space-y-1.5">
            <div className="font-bold text-cyan-300">Reporting & Storage</div>
            <p className="text-slate-300">PDFKit reports, GeoJSON datasets, Swappable JSON repository (PostGIS-ready)</p>
          </div>
          <div className="rounded-xl border border-slate-700/80 bg-navy-900/80 p-4 space-y-1.5">
            <div className="font-bold text-cyan-300">Testing</div>
            <p className="text-slate-300">Vitest + Supertest covering geometry, altitude, edge cases, and APIs</p>
          </div>
        </div>
      </div>

      {/* Future Scope */}
      <div className="rounded-2xl border border-slate-800 bg-navy-800/75 p-6 space-y-3">
        <div className="flex items-center gap-2 text-base font-bold text-white">
          <Rocket className="h-5 w-5 text-emerald-400" />
          Future Scope
        </div>
        <ul className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
          <li>• PostgreSQL + PostGIS spatial indexing for national-scale airspace layers</li>
          <li>• 3D terrain elevation (DEM) and obstacle clearance checks</li>
          <li>• Time-windowed NOTAM / temporary flight restriction (TFR) feeds</li>
          <li>• Official aviation authority API integration & digital flight authorization</li>
        </ul>
      </div>

      {/* Editable Team Section */}
      <div className="rounded-2xl border border-slate-800 bg-navy-800/75 p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-base font-bold text-white">
            <Users className="h-5 w-5 text-cyan-400" />
            Project Team (Editable for Demo)
          </div>
          <span className="text-xs text-slate-400">Click names below to customize</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {team.map((member, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-slate-700/80 bg-navy-900/80 p-4 space-y-2"
            >
              <input
                type="text"
                value={member.name}
                onChange={(e) => updateMemberName(idx, e.target.value)}
                aria-label={`Team member ${idx + 1} name`}
                className="w-full rounded-lg border border-slate-700 bg-navy-950 px-2.5 py-1.5 text-sm font-bold text-white focus:border-cyan-500 focus:outline-none"
              />
              <div className="text-xs font-semibold text-cyan-300">{member.role}</div>
              <div className="text-xs text-slate-400">{member.focus}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
