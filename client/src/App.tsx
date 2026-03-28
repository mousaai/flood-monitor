// Design: Techno-Geospatial Command Center (Dark Navy + Cyan/Amber/Red)
// Theme 2: ADEO Light — Abu Dhabi Executive Office brand identity

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { DataModeProvider } from "./contexts/DataModeContext";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { useIsMobile } from "./hooks/useMobile";
import Dashboard from "./pages/Dashboard";
import SatellitesPage from "./pages/SatellitesPage";
import AIModelsPage from "./pages/AIModelsPage";
import ReportsPage from "./pages/ReportsPage";
import AlertsPage from './pages/AlertsPage';
import DEMPage from './pages/DEMPage';
import SimulationPage from './pages/SimulationPage';
import RoadNetworkPage from './pages/RoadNetworkPage';
import AccuracyDashboard from './pages/AccuracyDashboard';
import UnifiedMapPage from './pages/UnifiedMapPage';
import RegionsExplorerPage from './pages/RegionsExplorerPage';
import HistoricalArchivePage from './pages/HistoricalArchivePage';
import DecisionSupportPage from './pages/DecisionSupportPage';
import UncertaintyMapPage from './pages/UncertaintyMapPage';
import ReleaseNotesPage from './pages/ReleaseNotesPage';
import DrainageDataPage from './pages/DrainageDataPage';
import SmartLensPage from './pages/SmartLensPage';
import WindyRadarPage from './pages/WindyRadarPage';
import NotificationsPage from './pages/NotificationsPage';
import Glossary from './pages/Glossary';

// Sidebar width constants
const SIDEBAR_EXPANDED = 210;
const SIDEBAR_COLLAPSED = 56;

function Layout({ children }: { children: React.ReactNode }) {
  const { dir } = useLanguage();
  const isRtl = dir === 'rtl';
  const isMobile = useIsMobile();
  return (
    <div className="min-h-screen grid-bg" style={{ background: 'var(--bg-primary)' }}>
      <TopBar />
      <Sidebar />
      <main
        className="transition-all duration-300"
        style={{
          marginTop: '56px',
          marginRight: isMobile ? '0' : (isRtl ? `${SIDEBAR_EXPANDED}px` : '0'),
          marginLeft: isMobile ? '0' : (isRtl ? '0' : `${SIDEBAR_EXPANDED}px`),
          padding: isMobile ? '12px' : '24px',
          minHeight: 'calc(100vh - 56px)',
        }}
        id="main-content"
      >
        {children}
      </main>
    </div>
  );
}

function MapLayout({ children }: { children: React.ReactNode }) {
  const { dir } = useLanguage();
  const isRtl = dir === 'rtl';
  const isMobile = useIsMobile();
  return (
    <div style={{ background: 'var(--bg-primary)' }}>
      <TopBar />
      <Sidebar />
      <div
        style={{
          marginTop: '56px',
          marginRight: isMobile ? '0' : (isRtl ? `${SIDEBAR_EXPANDED}px` : '0'),
          marginLeft: isMobile ? '0' : (isRtl ? '0' : `${SIDEBAR_EXPANDED}px`),
          height: 'calc(100vh - 56px)',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/" component={() => <Layout><Dashboard /></Layout>} />
      <Route path="/map" component={() => <MapLayout><UnifiedMapPage /></MapLayout>} />
      <Route path="/satellites" component={() => <Layout><SatellitesPage /></Layout>} />
      <Route path="/ai-models" component={() => <Layout><AIModelsPage /></Layout>} />
      <Route path="/regions" component={() => <Layout><RegionsExplorerPage /></Layout>} />
      <Route path="/reports" component={() => <Layout><ReportsPage /></Layout>} />
      <Route path="/alerts" component={() => <Layout><AlertsPage /></Layout>} />
      {/* Redirects for removed/merged pages */}
      <Route path="/heatmap" component={() => { window.location.replace('/map'); return null; }} />
      <Route path="/map-legacy" component={() => { window.location.replace('/map'); return null; }} />
      <Route path="/traffic" component={() => { window.location.replace('/road-network'); return null; }} />
      <Route path="/field-validation" component={() => { window.location.replace('/smart-lens'); return null; }} />
      <Route path="/field-match" component={() => { window.location.replace('/smart-lens'); return null; }} />
      <Route path="/dem" component={() => <MapLayout><DEMPage /></MapLayout>} />
      <Route path="/simulation" component={() => <MapLayout><SimulationPage /></MapLayout>} />
      <Route path="/road-network" component={() => <MapLayout><RoadNetworkPage /></MapLayout>} />
      <Route path="/accuracy" component={() => <Layout><AccuracyDashboard /></Layout>} />
      <Route path="/archive" component={() => <Layout><HistoricalArchivePage /></Layout>} />
      <Route path="/decision-support" component={() => <Layout><DecisionSupportPage /></Layout>} />
      <Route path="/uncertainty" component={() => <MapLayout><UncertaintyMapPage /></MapLayout>} />
      <Route path="/release-notes" component={() => <Layout><ReleaseNotesPage /></Layout>} />
      <Route path="/drainage" component={() => <MapLayout><DrainageDataPage /></MapLayout>} />
      <Route path="/smart-lens" component={() => <Layout><SmartLensPage /></Layout>} />
      <Route path="/glossary" component={() => <Layout><Glossary /></Layout>} />
      <Route path="/windy" component={() => <MapLayout><WindyRadarPage /></MapLayout>} />
      <Route path="/notifications" component={() => <Layout><NotificationsPage /></Layout>} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <DataModeProvider>
          <TooltipProvider>
            <Toaster position="top-left" />
            <Router />
          </TooltipProvider>
          </DataModeProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
