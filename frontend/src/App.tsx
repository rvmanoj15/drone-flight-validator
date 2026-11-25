import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { AboutPage } from './pages/AboutPage';
import { DashboardPage } from './pages/DashboardPage';
import { FlightHistoryPage } from './pages/FlightHistoryPage';
import { FlightPlannerPage } from './pages/FlightPlannerPage';
import { LandingPage } from './pages/LandingPage';
import { ValidationResultsPage } from './pages/ValidationResultsPage';
import { ZonesExplorerPage } from './pages/ZonesExplorerPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-navy-950 text-slate-100">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/planner" element={<FlightPlannerPage />} />
            <Route path="/results" element={<ValidationResultsPage />} />
            <Route path="/results/:id" element={<ValidationResultsPage />} />
            <Route path="/history" element={<FlightHistoryPage />} />
            <Route path="/zones" element={<ZonesExplorerPage />} />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
        </main>
        <footer className="border-t border-slate-800/80 bg-navy-950 py-4 text-center text-xs text-slate-500">
          TENORIX — Prototype Drone Flight Plan Validator • Synthetic Demo Airspace Data Only • Not Official Aviation Clearance
        </footer>
      </div>
    </BrowserRouter>
  );
}
