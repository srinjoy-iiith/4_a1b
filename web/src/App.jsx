// App shell: top bar (logo, navigation, "acting as" switcher) and the page routes.
import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { useActor } from './context/ActorContext.jsx';
import { EntityPicker } from './components/EntityPicker.jsx';
import { money } from './api.js';
import BrowsePage from './pages/BrowsePage.jsx';
import ClientDetail from './pages/ClientDetail.jsx';
import FreelancerDetail from './pages/FreelancerDetail.jsx';
import ContractDetail from './pages/ContractDetail.jsx';
import FundGigPage from './pages/FundGigPage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import MapPage from './pages/MapPage.jsx';
import ReviewsPage from './pages/ReviewsPage.jsx';

const NAV = [
  ['/browse', 'Browse'],
  ['/fund', 'Fund a Gig'],
  ['/audit', 'Escrow Audit'],
  ['/analytics', 'Analytics'],
  ['/map', 'Nearby Workers'],
  ['/reviews', 'Reviews'],
];

export default function App() {
  const { actor, setActor } = useActor();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="logo">◆ Gig<span>Task</span></div>
          <nav className="nav">
            {NAV.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
          </nav>
          <div className="actor" title="Demo only: choose which client you are acting as">
            <span className="actor-label">Acting as</span>
            <div style={{ width: 200 }}>
              <EntityPicker kind="clients" value={actor} onChange={setActor} ariaLabel="Switch client" placeholder="Choose a client" />
            </div>
            {actor && <span className="muted">{money(actor.escrow_balance)}</span>}
          </div>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/browse" replace />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/freelancers/:id" element={<FreelancerDetail />} />
          <Route path="/contracts/:id" element={<ContractDetail />} />
          <Route path="/fund" element={<FundGigPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="*" element={<div className="card state"><div className="state-title">Page not found</div><NavLink to="/browse">Go to Browse</NavLink></div>} />
        </Routes>
      </main>
    </>
  );
}
