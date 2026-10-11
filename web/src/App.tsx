import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Toast } from './components/Toast';
import { applyBodyClassForPath } from './lib/body-class';
import { LandingPage } from './pages/LandingPage';
import { ConnectPage } from './pages/ConnectPage';
import { LoginPage } from './pages/LoginPage';
import { QuizzesPage } from './pages/QuizzesPage';
import { BuilderPage } from './pages/BuilderPage';
import { HostPage } from './pages/HostPage';
import { PlayerPage } from './pages/PlayerPage';
import { PreviewHostPage } from './pages/PreviewHostPage';

function BodyClassSync() {
  const loc = useLocation();
  useEffect(() => {
    applyBodyClassForPath(loc.pathname);
  }, [loc.pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <BodyClassSync />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/quizzes" element={<QuizzesPage />} />
        <Route path="/builder" element={<BuilderPage />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/player" element={<PlayerPage />} />
        <Route path="/preview-host" element={<PreviewHostPage />} />
      </Routes>
      <Toast />
    </BrowserRouter>
  );
}
