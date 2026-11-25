import { Link } from 'react-router-dom';
import {
  Compass,
  ShieldCheck,
  Map,
  Route,
  FileText,
  Layers,
  ArrowRight,
  Play,
  CheckCircle2,
  Gauge,
} from 'lucide-react';
import { DisclaimerBanner } from '../components/DisclaimerBanner';

const features = [
  {
    icon: Map,
    title: 'Full-Route Geometry Analysis',
    description:
      'Checks the entire flight path LineString against airspace polygons — catching middle-segment intersections even when start and destination points are safe.',
  },
  {
    icon: Gauge,
    title: 'Altitude Envelope Verification',
    description:
      'Evaluates planned AGL altitude against per-zone minimum and maximum ceilings and surfaces exact numerical rule violations.',
  },
  {
    icon: Layers,
    title: 'Multi-Tier Zone Rule Engine',
    description:
      'Applies GREEN (open), YELLOW (conditional / permission-required), and RED (prohibited) prototype rules with deterministic verdict priority.',
  },
  {
    icon: Route,
    title: 'Route Alternative Assistance',
    description:
      'Automatically computes and ranks 2D polygon-buffer detour candidates around blocking RED zones and validates each candidate on the backend.',
  },
  {
    icon: FileText,
    title: 'PDF Validation Reports',
    description:
      'Exports structured pre-flight reports with route telemetry, rule-check logs, intersected zones, recommendations, and synthetic-data disclaimers.',
  },
  {
    icon: ShieldCheck,
    title: 'Persistent Audit History',
    description:
      'Stores flight plans and validation records across restarts so teams can inspect past verdicts, revalidate routes, and re-download reports.',
  },
];

const steps = [
  {
    step: '01',
    title: 'Plot Route & Altitude',
    detail: 'Click on the interactive map to define start, waypoints, and destination, or load one of the instant hackathon demo scenarios.',
  },
  {
    step: '02',
    title: 'Run Geospatial Engine',
    detail: 'The Express + Turf.js backend tests every route segment against closed GeoJSON polygons and altitude bounds.',
  },
  {
    step: '03',
    title: 'Inspect Verdict & Detours',
    detail: 'Review APPROVED, CONDITIONAL, or REJECTED status with plain-English rule explanations and one-click detour candidates.',
  },
  {
    step: '04',
    title: 'Export Flight Report',
    detail: 'Download a formatted PDF validation dossier and keep a persistent validation trail in Flight History.',
  },
];

export function LandingPage() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-14 px-4 py-10 sm:px-6 lg:py-14">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-navy-900/90 p-8 shadow-2xl sm:p-12">
        <div className="max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-cyan-300">
            <Compass className="h-4 w-4" />
            TENORIX — Airspace Mission Control Prototype
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
              TENORIX
            </h1>
            <p className="text-xl font-bold text-cyan-400 sm:text-2xl">Fly Smart. Fly Safe.</p>
          </div>

          <p className="text-base leading-relaxed text-slate-300 sm:text-lg">
            Pre-flight drone route validation powered by server-side geospatial intersection logic.
            Draw flight corridors, verify altitude ceilings against Red, Yellow, and Green synthetic
            airspace zones, explore automated detour candidates, and export PDF validation reports.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              to="/planner"
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-lg transition hover:bg-cyan-400"
            >
              Start Flight Planning
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/planner?demo=demo-restricted"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-navy-800 px-6 py-3.5 text-sm font-semibold text-white transition hover:border-cyan-500/50 hover:bg-navy-700"
            >
              <Play className="h-4 w-4 text-cyan-400" />
              Explore Demo
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-3 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Turf.js Backend Engine
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Interactive Leaflet GIS Map
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              PDFKit Report Export
            </span>
          </div>
        </div>
      </section>

      <DisclaimerBanner />

      {/* Features */}
      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Core Mission Capabilities</h2>
            <p className="mt-1 text-sm text-slate-400">
              End-to-end validation architecture built for clarity and reliable pre-flight checks.
            </p>
          </div>
          <Link
            to="/dashboard"
            className="text-sm font-semibold text-cyan-400 hover:text-cyan-300 transition"
          >
            View Operations Dashboard →
          </Link>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-800 bg-navy-800/70 p-6 transition hover:border-cyan-500/40"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="rounded-3xl border border-slate-800 bg-navy-900/70 p-8">
        <h2 className="text-2xl font-bold text-white">How TENORIX Works</h2>
        <p className="mt-1 text-sm text-slate-400">
          Four deterministic stages from route drafting to downloadable audit documentation.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((item) => (
            <div
              key={item.step}
              className="rounded-2xl border border-slate-800 bg-navy-950/70 p-5"
            >
              <div className="font-mono text-xs font-bold text-cyan-400">STEP {item.step}</div>
              <h3 className="mt-2 text-base font-bold text-white">{item.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
